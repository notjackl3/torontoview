import type { BusinessPlan } from "./businessPlan";
import type { TrafficImpactResult, BuildingTripGeneration, EdgeImpact } from "./trafficImpact";
import type { StakeholderAnalysis } from "./stakeholderImpact";
import type { ShadowAnalysisSummary } from "./sun/shadowAnalysis";

export type AskScopeId =
  | "demographics"
  | "competitor"
  | "traffic"
  | "reasonableness"
  | "stakeholder"
  | "shadow"
  | "drainage"
  | "financials"
  | "metric-analysis"
  | "generic"
  // Allow free-form scope ids on data-ask-scope attributes without losing
  // type-safety for the well-known ones above. New panels can pass any
  // kebab-case string as a scope id.
  | (string & {});

export interface AskScopeRegistration {
  id: AskScopeId;
  title: string;
  data: Record<string, unknown>;
}

export interface AskBuildingContext {
  id: string;
  lat: number;
  lng: number;
  buildMode?: string;
  floors?: number;
  floorHeightM?: number;
  totalHeightM?: number;
  footprintSqm?: number;
  gfaSqm?: number;
  rotationDeg?: number;
  scale?: { x: number; y: number; z: number };
  tenantFloor?: number;
  neighbourhoodName?: string | null;
  zoningCode?: string | null;
  nearestRoadName?: string | null;
  distanceToRoadM?: number | null;
  timeline?: { zoneType?: string; startDate?: string; durationDays?: number };
  businessPlanId?: number;
  existingBuildingId?: string;
}

export interface AskCityFacts {
  neighbourhoodName: string | null;
  populationDensity: number | null;
  households: number | null;
  ageMix?: {
    workingAge25to54Pct?: number;
    youth15to24Pct?: number;
    seniors65plusPct?: number;
  };
  nearbyBusinesses: Array<{ name: string; cat: string; distanceM: number }>;
  nearbyParks: Array<{ name: string; distanceM: number }>;
  streetTreesWithin50m: number;
  waterFeaturesWithin200m: Array<{ name: string; distanceM: number }>;
  intersectionsWithin250m: number;
  walkabilityHint?: "high" | "medium" | "low";
}

export interface AskAnalyses {
  traffic?: {
    totalDailyTrips: number;
    totalPeakHourTrips: number;
    congestedIntersections: number;
    buildings: Array<{
      buildingId: string;
      label: string;
      units: number;
      dailyTrips: number;
      peakHourTrips: number;
    }>;
    topEdges: Array<{ name: string; los: string; delta: number; level: number }>;
  };
  stakeholder?: {
    radiusMeters: number;
    totalAffected: number;
    residentialAffected: number;
    commercialAffected: number;
    institutionalAffected: number;
    significantSunlightLoss: number;
    highNoiseExposure: number;
    highViewObstruction: number;
    topImpacts: Array<{
      type: string | undefined;
      distanceM: number;
      severity: string;
      shadow: number;
      noise: number;
      view: number;
    }>;
  };
  shadow?: {
    dateLabel: string;
    totalAffected: number;
    severelyAffected: number;
    residentialUnitsAffected: number;
    topImpacts: Array<{
      type: string | undefined;
      hoursLost: number;
      estimatedUnits: number;
    }>;
  };
  demographics?: {
    neighbourhood: string;
    population: number | null;
    densityPerKm2: number | null;
    households: number | null;
    avgHouseholdSize: number | null;
    workingAge25to54: number | null;
    matchPct?: number;
    matchVerdict?: string;
  };
  competitors?: {
    radiusM: number;
    category: string;
    count: number;
    densityPerKm2: number;
    saturation: string;
    nearest: Array<{ name: string; cat: string; distanceM: number; addr?: string }>;
  };
  reasonableness?: {
    verdict?: string;
    score?: number;
    headline?: string;
  };
}

export interface AskContextBundle {
  selectedText: string;
  panel: { id: AskScopeId; title: string; fields: Record<string, unknown> };
  businessPlan: BusinessPlanSnapshot | null;
  buildings: AskBuildingContext[];
  analyses: AskAnalyses;
  cityFacts: AskCityFacts;
  generatedAt: number;
}

export interface BusinessPlanSnapshot {
  id: string;
  buildingId?: string;
  name: string;
  category: string;
  valueProp?: string;
  targetAgeMin: number;
  targetAgeMax: number;
  targetIncomeTier: string;
  serviceModel?: string;
  seatingCapacity?: number;
  rent?: number;
  monthlyRevenue?: number;
  monthlyNet?: number;
  breakEvenMonth?: number;
}

// ─── Geo helpers (kept local — used by enrichment) ──────────────────────────

const PLAN_PREFIX = "tv:plan:";

const EARTH_R = 6_371_000;

export function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const lat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dx = (bLng - aLng) * (Math.PI / 180) * Math.cos(lat) * EARTH_R;
  const dy = (bLat - aLat) * (Math.PI / 180) * EARTH_R;
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

interface NeighbourhoodFeature {
  name: string;
  polygons: number[][][][];
  population: number | null;
  densityPerKm2: number | null;
  households: number | null;
  avgHouseholdSize: number | null;
  incomeRecipients: number | null;
  ageGroups?: {
    children0to14: number | null;
    youth15to24: number | null;
    workingAge25to54: number | null;
    preRetire55to64: number | null;
    seniors65plus: number | null;
  };
}

interface BusinessRecord {
  name: string;
  cat: string;
  lat: number;
  lng: number;
  addr?: string;
}

interface ParkRecord {
  name?: string;
  geometry?: {
    type?: string;
    coordinates?: number[][][] | number[][][][];
  };
}

// ─── Datasets (cached in-memory) ────────────────────────────────────────────

let cachedNeighbourhoods: NeighbourhoodFeature[] | null = null;
let cachedBusinesses: BusinessRecord[] | null = null;
let cachedParks: Array<{ name: string; lat: number; lng: number }> | null = null;
let cachedTrees: Array<{ lat: number; lng: number }> | null = null;
let cachedWater: Array<{ name: string; lat: number; lng: number }> | null = null;

function safeFetchJson<T>(url: string): Promise<T | null> {
  return fetch(url, { cache: "force-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
    .catch(() => null);
}

async function loadNeighbourhoods() {
  if (cachedNeighbourhoods) return cachedNeighbourhoods;
  const data = await safeFetchJson<NeighbourhoodFeature[]>("/map-data/neighbourhoods.json");
  if (data) cachedNeighbourhoods = data;
  return cachedNeighbourhoods;
}

async function loadBusinesses() {
  if (cachedBusinesses) return cachedBusinesses;
  const data = await safeFetchJson<BusinessRecord[]>("/map-data/businesses.json");
  if (data) cachedBusinesses = data;
  return cachedBusinesses;
}

function centroidOfPolygon(coords: number[][]): [number, number] | null {
  if (!coords?.length) return null;
  let sx = 0;
  let sy = 0;
  for (const [lng, lat] of coords) {
    sx += lng;
    sy += lat;
  }
  return [sx / coords.length, sy / coords.length];
}

async function loadParks() {
  if (cachedParks) return cachedParks;
  const data = await safeFetchJson<{ features?: Array<{ properties?: { name?: string; AREA_NAME?: string }; geometry?: ParkRecord["geometry"] }> }>(
    "/map-data/parks.json",
  );
  if (!data?.features) {
    cachedParks = [];
    return cachedParks;
  }
  const out: Array<{ name: string; lat: number; lng: number }> = [];
  for (const f of data.features) {
    const name = f.properties?.name || f.properties?.AREA_NAME || "Park";
    const geom = f.geometry;
    if (!geom?.coordinates) continue;
    let ring: number[][] | undefined;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates[0])) {
      ring = geom.coordinates[0] as number[][];
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates[0]?.[0])) {
      ring = (geom.coordinates as number[][][][])[0][0];
    }
    if (!ring) continue;
    const c = centroidOfPolygon(ring);
    if (c) out.push({ name, lng: c[0], lat: c[1] });
  }
  cachedParks = out;
  return cachedParks;
}

async function loadTrees() {
  if (cachedTrees) return cachedTrees;
  const data = await safeFetchJson<Array<{ lat: number; lng: number }> | { features?: Array<{ geometry?: { coordinates?: [number, number] } }> }>(
    "/map-data/trees.json",
  );
  if (Array.isArray(data)) {
    cachedTrees = data.map((t) => ({ lat: t.lat, lng: t.lng }));
  } else if (data?.features) {
    cachedTrees = data.features
      .map((f) => f.geometry?.coordinates)
      .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2)
      .map(([lng, lat]) => ({ lat, lng }));
  } else {
    cachedTrees = [];
  }
  return cachedTrees;
}

async function loadWater() {
  if (cachedWater) return cachedWater;
  const data = await safeFetchJson<{ features?: Array<{ properties?: { name?: string }; geometry?: ParkRecord["geometry"] }> }>(
    "/map-data/waterbodies.json",
  );
  if (!data?.features) {
    cachedWater = [];
    return cachedWater;
  }
  const out: Array<{ name: string; lat: number; lng: number }> = [];
  for (const f of data.features) {
    const name = f.properties?.name || "Water";
    const geom = f.geometry;
    if (!geom?.coordinates) continue;
    let ring: number[][] | undefined;
    if (geom.type === "Polygon" && Array.isArray(geom.coordinates[0])) {
      ring = geom.coordinates[0] as number[][];
    } else if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates[0]?.[0])) {
      ring = (geom.coordinates as number[][][][])[0][0];
    }
    if (!ring) continue;
    const c = centroidOfPolygon(ring);
    if (c) out.push({ name, lng: c[0], lat: c[1] });
  }
  cachedWater = out;
  return cachedWater;
}

// ─── Business-plan loader (matches DemographicsPanel pattern) ───────────────

export function loadBusinessPlansFromStorage(): BusinessPlan[] {
  if (typeof window === "undefined") return [];
  const out: BusinessPlan[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(PLAN_PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as BusinessPlan;
      if (parsed?.concept) out.push(parsed);
    } catch {
      // ignore malformed entries
    }
  }
  return out;
}

export function pickActivePlan(
  plans: BusinessPlan[],
  anchorBuildingId?: string,
): BusinessPlan | null {
  if (plans.length === 0) return null;
  if (anchorBuildingId) {
    const match = plans.find((p) => p.buildingId === anchorBuildingId);
    if (match) return match;
  }
  return plans.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

function snapshotPlan(plan: BusinessPlan): BusinessPlanSnapshot {
  return {
    id: plan.id,
    buildingId: plan.buildingId,
    name: plan.concept.name,
    category: plan.concept.category || "",
    valueProp: plan.concept.valueProp,
    targetAgeMin: plan.concept.targetAgeMin,
    targetAgeMax: plan.concept.targetAgeMax,
    targetIncomeTier: plan.concept.targetIncomeTier,
    serviceModel: plan.operations.serviceModel,
    seatingCapacity: plan.operations.seatingCapacity,
    rent: plan.financials.rent,
  };
}

// ─── Building enrichment ────────────────────────────────────────────────────

const FLOOR_HEIGHT_M_DEFAULT = 3.5;

export interface RawPlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  scale?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  buildMode?: string;
  timeline?: { zoneType?: string; startDate?: string; durationDays?: number };
  existingBuildingId?: string;
  businessPlanId?: number;
}

function buildingFootprintSqm(scale?: { x: number; y: number; z: number }): number {
  if (!scale) return 0;
  // Crude: scale.x and scale.z roughly equal the footprint side in meters at unit-scale model.
  return Math.max(0, scale.x * scale.z * 100); // model multiplier matches existing rough estimates
}

export async function enrichBuildings(
  raw: RawPlacedBuilding[],
): Promise<AskBuildingContext[]> {
  if (raw.length === 0) return [];
  const neighbourhoods = await loadNeighbourhoods();

  return raw.map((b) => {
    const floorHeight = FLOOR_HEIGHT_M_DEFAULT;
    const totalHeight = b.scale ? Math.max(1, b.scale.y) * floorHeight : undefined;
    const floors = b.scale ? Math.max(1, Math.round(b.scale.y)) : undefined;
    const footprint = buildingFootprintSqm(b.scale);
    const gfa = floors && footprint ? floors * footprint : footprint;

    let neighbourhoodName: string | null = null;
    if (neighbourhoods) {
      for (const n of neighbourhoods) {
        if (n.polygons.some((poly) => pointInRing(b.lng, b.lat, poly[0]))) {
          neighbourhoodName = n.name;
          break;
        }
      }
    }

    const rotationDeg = b.rotation ? (b.rotation.y * 180) / Math.PI : undefined;

    return {
      id: b.id,
      lat: b.lat,
      lng: b.lng,
      buildMode: b.buildMode,
      floors,
      floorHeightM: floorHeight,
      totalHeightM: totalHeight,
      footprintSqm: footprint || undefined,
      gfaSqm: gfa || undefined,
      rotationDeg,
      scale: b.scale,
      neighbourhoodName,
      timeline: b.timeline,
      businessPlanId: b.businessPlanId,
      existingBuildingId: b.existingBuildingId,
    };
  });
}

// ─── City fact compilation (top-5 type slices around anchor) ────────────────

export async function compileCityFacts(
  anchor: { lat: number; lng: number } | null,
): Promise<AskCityFacts> {
  if (!anchor) {
    return {
      neighbourhoodName: null,
      populationDensity: null,
      households: null,
      nearbyBusinesses: [],
      nearbyParks: [],
      streetTreesWithin50m: 0,
      waterFeaturesWithin200m: [],
      intersectionsWithin250m: 0,
    };
  }

  const [neighbourhoods, businesses, parks, trees, water] = await Promise.all([
    loadNeighbourhoods(),
    loadBusinesses(),
    loadParks(),
    loadTrees(),
    loadWater(),
  ]);

  let n: NeighbourhoodFeature | null = null;
  if (neighbourhoods) {
    for (const candidate of neighbourhoods) {
      if (candidate.polygons.some((poly) => pointInRing(anchor.lng, anchor.lat, poly[0]))) {
        n = candidate;
        break;
      }
    }
  }

  const nearbyBusinesses = (businesses ?? [])
    .map((b) => ({
      name: b.name,
      cat: b.cat,
      distanceM: metersBetween(anchor.lat, anchor.lng, b.lat, b.lng),
    }))
    .filter((b) => b.distanceM <= 500)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 5);

  const nearbyParks = (parks ?? [])
    .map((p) => ({
      name: p.name,
      distanceM: metersBetween(anchor.lat, anchor.lng, p.lat, p.lng),
    }))
    .filter((p) => p.distanceM <= 500)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);

  const treesWithin50 = (trees ?? []).filter(
    (t) => metersBetween(anchor.lat, anchor.lng, t.lat, t.lng) <= 50,
  ).length;

  const nearbyWater = (water ?? [])
    .map((w) => ({
      name: w.name,
      distanceM: metersBetween(anchor.lat, anchor.lng, w.lat, w.lng),
    }))
    .filter((w) => w.distanceM <= 200)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 3);

  // Walkability hint from nearby-business density alone (proxy: many businesses within 500m = walkable).
  const businessesWithin500 = nearbyBusinesses.length >= 5 ? "high" : nearbyBusinesses.length >= 2 ? "medium" : "low";

  const pop = n?.population ?? null;
  const workingPct =
    pop && n?.ageGroups?.workingAge25to54 != null
      ? (n.ageGroups.workingAge25to54 / pop) * 100
      : undefined;
  const youthPct =
    pop && n?.ageGroups?.youth15to24 != null
      ? (n.ageGroups.youth15to24 / pop) * 100
      : undefined;
  const seniorPct =
    pop && n?.ageGroups?.seniors65plus != null
      ? (n.ageGroups.seniors65plus / pop) * 100
      : undefined;

  return {
    neighbourhoodName: n?.name ?? null,
    populationDensity: n?.densityPerKm2 ?? null,
    households: n?.households ?? null,
    ageMix: {
      workingAge25to54Pct: workingPct,
      youth15to24Pct: youthPct,
      seniors65plusPct: seniorPct,
    },
    nearbyBusinesses,
    nearbyParks,
    streetTreesWithin50m: treesWithin50,
    waterFeaturesWithin200m: nearbyWater,
    intersectionsWithin250m: 0, // not yet wired — roads file used elsewhere; safe to keep 0 for v1
    walkabilityHint: businessesWithin500,
  };
}

// ─── Analyses adapters ──────────────────────────────────────────────────────

export function summarizeTraffic(result: TrafficImpactResult): AskAnalyses["traffic"] {
  const topEdges: Array<{ name: string; los: string; delta: number; level: number }> = [];
  let edges: EdgeImpact[] = [];
  if (result.edgeImpact instanceof Map) {
    edges = Array.from(result.edgeImpact.values());
  } else if (Array.isArray(result.edgeImpact)) {
    edges = result.edgeImpact as EdgeImpact[];
  }
  edges
    .filter((e) => e.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5)
    .forEach((e) => topEdges.push({
      name: e.edgeName || e.edgeId.slice(0, 12),
      los: e.los,
      delta: e.delta,
      level: e.level,
    }));

  return {
    totalDailyTrips: result.totalDailyTrips,
    totalPeakHourTrips: result.totalPeakHourTrips,
    congestedIntersections: result.congestedIntersections.length,
    buildings: result.buildings.slice(0, 5).map((b: BuildingTripGeneration) => ({
      buildingId: b.buildingId,
      label: b.iteRate.label,
      units: b.units,
      dailyTrips: b.dailyTrips,
      peakHourTrips: b.peakHourTrips,
    })),
    topEdges,
  };
}

export function summarizeStakeholder(analysis: StakeholderAnalysis): AskAnalyses["stakeholder"] {
  const top = analysis.impacts
    .filter((i) => i.overallSeverity !== "none")
    .slice(0, 5)
    .map((i) => ({
      type: i.type,
      distanceM: Math.round(i.distanceMeters),
      severity: i.overallSeverity,
      shadow: Number(i.shadowImpact.toFixed(2)),
      noise: Number(i.noiseImpact.toFixed(2)),
      view: Number(i.viewObstruction.toFixed(2)),
    }));
  return {
    radiusMeters: analysis.summary.radiusMeters,
    totalAffected: analysis.summary.totalAffected,
    residentialAffected: analysis.summary.residentialAffected,
    commercialAffected: analysis.summary.commercialAffected,
    institutionalAffected: analysis.summary.institutionalAffected,
    significantSunlightLoss: analysis.summary.significantSunlightLoss,
    highNoiseExposure: analysis.summary.highNoiseExposure,
    highViewObstruction: analysis.summary.highViewObstruction,
    topImpacts: top,
  };
}

export function summarizeShadow(summary: ShadowAnalysisSummary): AskAnalyses["shadow"] {
  return {
    dateLabel: summary.dateLabel,
    totalAffected: summary.totalAffected,
    severelyAffected: summary.severelyAffected,
    residentialUnitsAffected: summary.residentialUnitsAffected,
    topImpacts: summary.impacts.slice(0, 5).map((i) => ({
      type: i.buildingType,
      hoursLost: Number(i.hoursLost.toFixed(1)),
      estimatedUnits: i.estimatedUnits,
    })),
  };
}

// ─── Top-level compile ──────────────────────────────────────────────────────

export interface CompileAskContextInput {
  scope: AskScopeRegistration;
  selectedText: string;
  rawBuildings: RawPlacedBuilding[];
  registeredScopes: AskScopeRegistration[];
  trafficImpactResult?: TrafficImpactResult | null;
  stakeholderAnalysis?: StakeholderAnalysis | null;
  shadowResults?: ShadowAnalysisSummary | null;
  reasonablenessLatest?: { verdict?: string; score?: number; headline?: string } | null;
  competitorState?: {
    radius: number;
    markers: Array<{ name: string; cat?: string; lat: number; lng: number }>;
  } | null;
  fallbackAnchor?: { lat: number; lng: number } | null;
}

export async function compileAskContext(input: CompileAskContextInput): Promise<AskContextBundle> {
  const buildings = await enrichBuildings(input.rawBuildings);
  const anchor =
    buildings[buildings.length - 1]
      ? { lat: buildings[buildings.length - 1].lat, lng: buildings[buildings.length - 1].lng }
      : input.fallbackAnchor ?? null;

  const cityFacts = await compileCityFacts(anchor);
  const plans = loadBusinessPlansFromStorage();
  const activePlan = pickActivePlan(plans, input.rawBuildings[input.rawBuildings.length - 1]?.id);

  // Merge scope-registered data from any panel currently mounted.
  const merged: Record<string, AskScopeRegistration> = {};
  for (const r of input.registeredScopes) merged[r.id] = r;
  // The triggering scope is authoritative for the "panel" field.
  merged[input.scope.id] = input.scope;

  const analyses: AskAnalyses = {};
  if (input.trafficImpactResult) analyses.traffic = summarizeTraffic(input.trafficImpactResult);
  if (input.stakeholderAnalysis) analyses.stakeholder = summarizeStakeholder(input.stakeholderAnalysis);
  if (input.shadowResults) analyses.shadow = summarizeShadow(input.shadowResults);
  if (input.reasonablenessLatest) analyses.reasonableness = input.reasonablenessLatest;

  // Demographics is computed from city facts when we have an anchor.
  if (anchor && cityFacts.neighbourhoodName) {
    analyses.demographics = {
      neighbourhood: cityFacts.neighbourhoodName,
      population: null,
      densityPerKm2: cityFacts.populationDensity,
      households: cityFacts.households,
      avgHouseholdSize: null,
      workingAge25to54: null,
    };
    // Allow the active panel registration to add matchPct / verdict.
    const demoReg = merged.demographics;
    if (demoReg?.data?.matchPct != null) {
      analyses.demographics.matchPct = demoReg.data.matchPct as number;
      analyses.demographics.matchVerdict = demoReg.data.matchVerdict as string | undefined;
    }
  }

  if (input.competitorState && cityFacts.nearbyBusinesses.length) {
    const compReg = merged.competitor;
    analyses.competitors = {
      radiusM: input.competitorState.radius,
      category: (compReg?.data?.category as string) ?? "selected category",
      count: input.competitorState.markers.length,
      densityPerKm2:
        input.competitorState.markers.length /
        Math.max(0.01, (Math.PI * input.competitorState.radius ** 2) / 1_000_000),
      saturation: (compReg?.data?.saturation as string) ?? "unknown",
      nearest: input.competitorState.markers.slice(0, 5).map((m) => ({
        name: m.name,
        cat: m.cat ?? "",
        distanceM: anchor ? Math.round(metersBetween(anchor.lat, anchor.lng, m.lat, m.lng)) : 0,
      })),
    };
  }

  return {
    selectedText: input.selectedText,
    panel: {
      id: input.scope.id,
      title: input.scope.title,
      fields: input.scope.data,
    },
    businessPlan: activePlan ? snapshotPlan(activePlan) : null,
    buildings,
    analyses,
    cityFacts,
    generatedAt: Date.now(),
  };
}
