"use client";

import { useState, useEffect, Suspense, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { peekNextBusinessId, consumeNextBusinessId } from "@/lib/businessIdCounter";
import { listOsmPlans, getOsmPlanId, setOsmPlanId } from "@/lib/osmBusinessPlans";
import { computePlanMetrics, type BusinessPlan } from "@/lib/businessPlan";
import type { BuildingClusterIndex } from "@/lib/buildingClusters";
import ThreeMap from "@/components/ThreeMap";
import { ProviderBadge } from "@/components/ProviderBadge";
import { formatHour, getPresetHour, type TimePreset } from "@/lib/sun/timeOfDay";
import {
  Landmark,
  Building2,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  FileText,
  PlayCircle,
  Clock,
  MapPin,

  X,
  Plus,
  Trash2,
  Upload,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Check,
  Volume2,
  Pause,
  Map,
  Navigation,
  Eye,
  ArrowUp,
  Droplets,
  Wind,
  Users,
  Car,
  ShieldAlert,
  Coins,
  Pencil,
  Trees,
  Waves,
  TreePine,
  Briefcase,
  DollarSign,
  Hammer,
  Store,
} from "lucide-react";
import { prefetchMapData } from "@/lib/prefetchMapData";
import {
  computeHappinessScore,
  isUnderConstruction,
  getConstructionProgress,
} from "@/lib/constructionNoise";
import {
  BuildingPlacementForm,
  type BuildingPlacementDetails,
  type BuildMode,
  type LeaseTerm,
} from "@/components/BuildingPlacementForm";
import DemographicsPanel from "@/components/DemographicsPanel";
import CompetitorPanel from "@/components/CompetitorPanel";
import ZoningPermitsPanel from "@/components/ZoningPermitsPanel";
import GrantsPanel from "@/components/GrantsPanel";
import CompetitorAnalysisPopup from "@/components/CompetitorAnalysisPopup";
import {
  cacheKey as competitorCacheKey,
  listCachedKeys as listCachedCompetitorKeys,
} from "@/lib/competitorAnalysisCache";
import type { ShadowAnalysisSummary, BuildingShadowImpact } from "@/lib/sun/shadowAnalysis";
import { type StakeholderAnalysis, type ImpactRadius } from "@/lib/stakeholderImpact";
import type { Building } from "@/lib/buildingData";
import { CityProjection } from "@/lib/projection";
import { analyzeTrafficImpact, fetchMapboxCongestion, type TrafficImpactResult, type MapboxCongestion } from "@/lib/trafficImpact";
import { TrafficImpactPanel } from "@/components/TrafficImpactPanel";
import { RoadNetwork } from "@/lib/roadNetwork";
import { fetchWindData, WindDataSet } from "@/lib/windData";
import {
  normalizeBreakdownToVolume,
  type MaterialCostBreakdown,
} from "@/lib/materialCosts";
import ReasonablenessPanel from "@/components/ReasonablenessPanel";
import { HighlightAskProvider, useAskScopeData } from "@/components/ask/HighlightAskProvider";

const VALID_BUILD_MODES: readonly BuildMode[] = [
  "new-build",
  "demolish-rebuild",
  "move-in",
];

const BUILD_MODE_STEP_COPY: Record<BuildMode, { label: string; hint: string; accent: string }> = {
  "move-in": {
    label: "Pick a building to move into",
    hint: "Click any existing building on the map to lease it.",
    accent: "emerald",
  },
  "demolish-rebuild": {
    label: "Pick a property to demolish",
    hint: "Click the building you want to tear down and replace.",
    accent: "amber",
  },
  "new-build": {
    label: "Pick an empty parcel",
    hint: "Click an open spot on the map to start a ground-up build.",
    accent: "blue",
  },
};

interface PlacedBuilding {
  id: string;
  modelPath: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  lat: number;
  lng: number;
  timeline?: {
    zoneType?: string;
    startDate?: string;
    durationDays?: number;
  };
  buildMode?: BuildMode;
  leaseTerm?: LeaseTerm;
  leaseMonths?: number;
  businessPlanId?: number;
  existingBuildingId?: string;
  uploadedModelMaterials?: MaterialCostBreakdown | null;
}

// Compute a summary of a building's footprint suitable for the
// "view from wall" camera: the centroid in world coordinates, the
// bounding-circle radius (metres), and the per-cardinal-direction wall
// distance (metres). The directional distances are what the camera uses
// to land on the actual wall — for a long, narrow building the
// north/south wall is much closer than the east/west wall, and using a
// single bounding radius makes the camera overshoot the short side.
function summarizeFootprintForWallView(footprint: [number, number][]): {
  worldX: number;
  worldZ: number;
  centroidLng: number;
  centroidLat: number;
  radiusM: number;
  wallOffsetByDirM: { 0: number; 90: number; 180: number; 270: number };
} {
  let cLng = 0;
  let cLat = 0;
  for (const [lng, lat] of footprint) {
    cLng += lng;
    cLat += lat;
  }
  cLng /= footprint.length;
  cLat /= footprint.length;
  const centroidWorld = CityProjection.projectToWorld([cLng, cLat]);

  // Project each vertex onto the four cardinal unit vectors. The max
  // projection along a direction is the distance from centroid to the
  // wall on that side. Three.js convention: +X east, -Z north.
  const dirs: Array<{ key: 0 | 90 | 180 | 270; x: number; z: number }> = [
    { key: 0, x: 0, z: -1 }, // North
    { key: 90, x: 1, z: 0 }, // East
    { key: 180, x: 0, z: 1 }, // South
    { key: 270, x: -1, z: 0 }, // West
  ];
  const M_PER_WORLD = 1.4 / 10; // inverse of CityProjection.SCALE_FACTOR
  const wallOffsetByDirM: { 0: number; 90: number; 180: number; 270: number } = {
    0: 0,
    90: 0,
    180: 0,
    270: 0,
  };
  let maxR = 0;
  for (const v of footprint) {
    const vw = CityProjection.projectToWorld(v);
    const dx = vw.x - centroidWorld.x;
    const dz = vw.z - centroidWorld.z;
    const r = Math.hypot(dx, dz);
    if (r > maxR) maxR = r;
    for (const d of dirs) {
      const proj = dx * d.x + dz * d.z;
      if (proj > wallOffsetByDirM[d.key]) wallOffsetByDirM[d.key] = proj;
    }
  }
  // Convert from world units → metres.
  for (const d of dirs) wallOffsetByDirM[d.key] *= M_PER_WORLD;

  return {
    worldX: centroidWorld.x,
    worldZ: centroidWorld.z,
    centroidLng: cLng,
    centroidLat: cLat,
    radiusM: maxR * M_PER_WORLD,
    wallOffsetByDirM,
  };
}

function MapPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isStreetViewSelectionMode, setIsStreetViewSelectionMode] = useState(false);

  // Building / interior view picker state.
  const [isBuildingViewSelectionMode, setIsBuildingViewSelectionMode] = useState(false);
  const [pickedBuildingForView, setPickedBuildingForView] = useState<{
    buildingId: string;
    centroidLng: number;
    centroidLat: number;
    worldX: number;
    worldZ: number;
    heightM: number;
    radiusM: number;
    // Distance in metres from the building centroid to the wall along each
    // cardinal facing. Lets the camera land on the *actual* wall rather than
    // on the bounding-circle radius (which overshoots the short side of any
    // non-square footprint, the source of the "wrong location" bug).
    wallOffsetByDirM: { 0: number; 90: number; 180: number; 270: number };
    defaultFacingDeg: number;
    isHouse: boolean;
  } | null>(null);
  const [buildingViewFloor, setBuildingViewFloor] = useState(1);
  const [buildingViewFacingDeg, setBuildingViewFacingDeg] = useState(0);
  const [buildingViewTarget, setBuildingViewTarget] = useState<{
    worldX: number;
    worldZ: number;
    floorHeightM: number;
    facingDeg: number;
    footprintRadiusM: number;
    id: number;
  } | null>(null);
  const [nextBusinessIdPreview, setNextBusinessIdPreview] = useState<number>(1);
  const [osmClusterIndex, setOsmClusterIndex] = useState<BuildingClusterIndex | null>(null);
  const [registryRefreshTick, setRegistryRefreshTick] = useState(0);

  const [pendingPlacement, setPendingPlacement] = useState<{
    lat: number;
    lng: number;
    worldX: number;
    worldY: number;
    worldZ: number;
    ghostRotationY?: number;
    existingBuildingId?: string;
  } | null>(null);

  const [timelineDate, setTimelineDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);

  const [placedBuildings, setPlacedBuildings] = useState<PlacedBuilding[]>([]);
  // Rehydrate any persisted placed buildings on mount so a building placed in
  // new-build / demolish-rebuild survives the trip through /plan and back —
  // but only when the URL says we're coming back from a plan flow (any of
  // ?planId / ?osmBuildingId / ?placedBuildingId). A bare visit to /map is
  // treated as a fresh canvas: previously-placed buildings get cleared so
  // the user isn't haunted by an old proposal tied to a different plan.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasAnalysisContext =
      !!searchParams.get("planId") ||
      !!searchParams.get("osmBuildingId") ||
      !!searchParams.get("placedBuildingId");
    if (!hasAnalysisContext) {
      window.localStorage.removeItem("tv:placedBuildings");
      setPlacedBuildings([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem("tv:placedBuildings");
      if (!raw) return;
      const parsed = JSON.parse(raw) as PlacedBuilding[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setPlacedBuildings(parsed);
      }
    } catch {
      /* ignore malformed cache */
    }
    // Run-once on mount: subsequent state changes are persisted by the
    // writer effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Persist on every change so the wizard can navigate away mid-flow and the
  // user lands back on the same map state.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "tv:placedBuildings",
        JSON.stringify(placedBuildings),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [placedBuildings]);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const [guidedBuildMode, setGuidedBuildMode] = useState<BuildMode | null>(null);

  // Move-in selection: when the user clicks an existing building, we record
  // the id + landmark name + lat/lng. The name comes from a small lookup file
  // we generated from OSM (public/map-data/building-names.json).
  const [existingBuildingNames, setExistingBuildingNames] = useState<Record<
    string,
    { name: string; type: string | null }
  > | null>(null);
  const [selectedExistingBuilding, setSelectedExistingBuilding] = useState<{
    buildingId: string;
    name: string;
    lat: number;
    lng: number;
    heightM: number;
    floorCount: number;
    isHouse: boolean;
  } | null>(null);
  const [moveInFloor, setMoveInFloor] = useState<number>(1);

  // While the user is mid-pipeline (came in from /start with ?mode=...) and
  // hasn't placed/locked a building yet, hide both sidebars so the analysis
  // panels don't appear for an undecided site. They snap back once the user
  // returns from the business-plan wizard (URL no longer has ?mode=) or has
  // placed at least one building.
  const inSelectionPipeline =
    guidedBuildMode !== null && placedBuildings.length === 0;

  // Analysis stage: user is back from the business-plan wizard with a saved
  // plan tied to an OSM building. The URL carries planId + osmBuildingId; we
  // build a virtual anchor (lat/lng + name) from that OSM building so the
  // analysis panels can run against a site without needing a placed model.
  const analysisPlanId = searchParams.get("planId");
  const analysisOsmBuildingId = searchParams.get("osmBuildingId");
  const analysisPlacedBuildingId = searchParams.get("placedBuildingId");
  const [analysisAnchor, setAnalysisAnchor] = useState<{
    id: string;
    lat: number;
    lng: number;
    name: string;
    existingBuildingId: string;
    anchorBuildingId: string;
  } | null>(null);

  // Resolve anchor once buildings load — we need osmClusterIndex to fire so
  // we know osmBuildingsDataRef is populated.
  useEffect(() => {
    if (!analysisOsmBuildingId) {
      setAnalysisAnchor(null);
      return;
    }
    const buildings = osmBuildingsDataRef.current;
    if (buildings.length === 0) return;
    const b = buildings.find((x) => x.id === analysisOsmBuildingId);
    if (!b) {
      setAnalysisAnchor(null);
      return;
    }
    // Centroid of footprint (lon/lat avg).
    let cLng = 0,
      cLat = 0;
    for (const [lng, lat] of b.footprint) {
      cLng += lng;
      cLat += lat;
    }
    cLng /= b.footprint.length;
    cLat /= b.footprint.length;
    const name =
      existingBuildingNames?.[analysisOsmBuildingId]?.name ??
      `Building ${analysisOsmBuildingId}`;
    setAnalysisAnchor({
      id: `anchor-${analysisOsmBuildingId}`,
      lat: cLat,
      lng: cLng,
      name,
      existingBuildingId: analysisOsmBuildingId,
      anchorBuildingId: analysisOsmBuildingId,
    });
    // Land the camera on the locked building so the user immediately sees
    // the highlighted target.
    setFlyToTarget({ lngLat: [cLng, cLat], id: Date.now() });

    // In planning mode the URL already names the target building — the
    // user can't click to pick it. Auto-prime the "view from wall" panel
    // so the floor + facing controls and the action button appear
    // straight away. Floor defaults to either ?floor= (carried over from
    // the move-in flow) or the top floor; facing defaults to N.
    const summary = summarizeFootprintForWallView(b.footprint);
    const heightM = b.height;
    const isHouse = heightM < 6;
    const floors = Math.max(1, Math.floor(heightM / 3.5));
    const urlFloor = parseInt(searchParams.get("floor") ?? "", 10);
    const initialFloor =
      Number.isFinite(urlFloor) && urlFloor >= 1 && urlFloor <= floors
        ? urlFloor
        : isHouse
          ? 1
          : floors;
    setPickedBuildingForView({
      buildingId: b.id,
      centroidLng: summary.centroidLng,
      centroidLat: summary.centroidLat,
      worldX: summary.worldX,
      worldZ: summary.worldZ,
      heightM,
      radiusM: summary.radiusM,
      wallOffsetByDirM: summary.wallOffsetByDirM,
      defaultFacingDeg: 0,
      isHouse,
    });
    setBuildingViewFacingDeg(0);
    setBuildingViewFloor(initialFloor);
  }, [analysisOsmBuildingId, osmClusterIndex, existingBuildingNames, searchParams]);

  // Same idea for new-build / demolish-rebuild: the URL names the placed
  // building we just came back from. Resolve it out of placedBuildings (which
  // has already been rehydrated from localStorage above) and set the anchor.
  useEffect(() => {
    if (!analysisPlacedBuildingId) return;
    // Don't overwrite an OSM anchor if one was already resolved (osmBuildingId
    // wins because it implies a move-in flow).
    if (analysisOsmBuildingId) return;
    const b = placedBuildings.find((x) => x.id === analysisPlacedBuildingId);
    if (!b) return;
    setAnalysisAnchor({
      id: `anchor-${b.id}`,
      lat: b.lat,
      lng: b.lng,
      name: "Your placed building",
      existingBuildingId: b.id,
      anchorBuildingId: b.id,
    });
    setFlyToTarget({ lngLat: [b.lng, b.lat], id: Date.now() });
  }, [analysisPlacedBuildingId, analysisOsmBuildingId, placedBuildings]);

  // What the analysis panels treat as "the building under analysis": prefer
  // the OSM anchor from URL, otherwise fall back to placed buildings. We carry
  // buildMode + leaseTerm through so downstream panels (permits, drainage,
  // shadow, stakeholder, traffic) can branch their analysis on whether this
  // is a fit-out or a ground-up project.
  const analysisBuildings = useMemo<
    Array<{
      id: string;
      lat: number;
      lng: number;
      anchorBuildingId?: string;
      existingBuildingId?: string;
      buildMode?: BuildMode;
      leaseTerm?: LeaseTerm;
      leaseMonths?: number;
      timeline?: { zoneType?: string; startDate?: string; durationDays?: number };
    }>
  >(() => {
    if (analysisAnchor) {
      // If the anchor was created from an OSM building id, see if there's a
      // placed building tied to it — that placed building's buildMode wins
      // (e.g. user picked an existing building then demolished it for rebuild).
      const tied = placedBuildings.find(
        (b) => b.existingBuildingId === analysisAnchor.existingBuildingId,
      );
      return [
        {
          id: analysisAnchor.id,
          lat: analysisAnchor.lat,
          lng: analysisAnchor.lng,
          anchorBuildingId: analysisAnchor.anchorBuildingId,
          existingBuildingId: analysisAnchor.existingBuildingId,
          // Default to move-in when the anchor came from picking an existing
          // OSM building — that's the only flow that produces an OSM anchor.
          buildMode: tied?.buildMode ?? "move-in",
          leaseTerm: tied?.leaseTerm,
          leaseMonths: tied?.leaseMonths,
          timeline: tied?.timeline,
        },
      ];
    }
    return placedBuildings.map((b) => ({
      ...b,
      anchorBuildingId: b.existingBuildingId,
    }));
  }, [analysisAnchor, placedBuildings]);

  // Active business plan for the analysis stage. Read from localStorage on
  // mount and whenever the planId/osmBuildingId changes; the wizard already
  // auto-saves to tv:plan:<id> on every edit.
  const [activePlan, setActivePlan] = useState<BusinessPlan | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!analysisPlanId && !analysisOsmBuildingId) {
      setActivePlan(null);
      return;
    }
    const candidates: BusinessPlan[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith("tv:plan:")) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) candidates.push(JSON.parse(raw) as BusinessPlan);
      } catch {
        /* ignore */
      }
    }
    if (candidates.length === 0) {
      setActivePlan(null);
      return;
    }
    // Prefer exact id match, then buildingId match, then most-recently-updated.
    const byId = analysisPlanId
      ? candidates.find((p) => p.id === analysisPlanId)
      : undefined;
    const byBuilding = analysisOsmBuildingId
      ? candidates.find((p) => p.buildingId === analysisOsmBuildingId)
      : undefined;
    setActivePlan(
      byId ??
        byBuilding ??
        candidates.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
        null,
    );
  }, [analysisPlanId, analysisOsmBuildingId]);

  // Cost overrides derived from the plan. When there's no placed building
  // (move-in analysis from URL) we fall back to plan-only numbers; when there
  // *is* a placed building, the card logic below merges these into the
  // strategy-aware figures (e.g. new-build = land + construction + plan
  // capital + first-year operating). All values are CAD, year-one framing.
  const planCosts = useMemo(() => {
    if (!activePlan) return null;
    const m = computePlanMetrics(activePlan);
    const fin = activePlan.financials;
    const capital = fin.capitalOwn + fin.capitalLoan + fin.capitalGrants;
    const annualLease = fin.rent * 12;
    const annualOperating = m.monthlyOperatingCost * 12;
    return {
      // Move-in-only fallback. New-build/demolish blend this with
      // buildingFinancials below.
      totalProjectCost: capital + annualOperating,
      acquisition: annualLease,
      buildCost: capital,
      // Components reused by the per-strategy combiner below.
      capital,
      annualLease,
      annualOperating,
      monthlyRent: fin.rent,
      monthlyOperating: m.monthlyOperatingCost,
      monthlyNet: m.monthlyNet,
    };
  }, [activePlan]);
  const [pendingMaterials, setPendingMaterials] = useState<MaterialCostBreakdown | null>(null);

  // Default scale for placed GLB buildings (map uses SCALE_FACTOR = 10/1.4 ≈ 7.14)
  // Modern Office Tower uses 0.75× multiplier → 7.5
  const [buildingScale, setBuildingScale] = useState({ x: 7.5, y: 7.5, z: 7.5 });
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  );

  // Custom model path from editor export
  const [customModelPath, setCustomModelPath] = useState<string | null>(null);
  const [importedBuildingName, setImportedBuildingName] = useState<
    string | null
  >(null);

  // Available buildings list
  interface AvailableBuilding {
    id: string;
    name: string;
    path: string;
    type: "default" | "custom";
  }
  const [availableBuildings, setAvailableBuildings] = useState<
    AvailableBuilding[]
  >([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [showBuildingSelector, setShowBuildingSelector] = useState(false);
  const [mapStyle, setMapStyle] = useState<"satellite" | "light">("light");
  const [showNoiseRipple, setShowNoiseRipple] = useState(false);
  const [showZoningLayer, setShowZoningLayer] = useState(false);
  const [showParksLayer, setShowParksLayer] = useState(true);
  const [showWaterLayer, setShowWaterLayer] = useState(false);
  const [showTorontoTreesLayer, setShowTorontoTreesLayer] = useState(true);
  const [showTrafficDensityLayer, setShowTrafficDensityLayer] = useState(false);
  const [showWindLayer, setShowWindLayer] = useState(false);
  const [windData, setWindData] = useState<WindDataSet | null>(null);
  useEffect(() => {
    if (!showWindLayer) return;
    fetchWindData().then(setWindData).catch(console.error);
  }, [showWindLayer]);
  // Correct config for Toronto zoning layer (Official Plan)
  const [zoningOffset, setZoningOffset] = useState({ x: 0, z: 0 });
  const [zoningRotationY, setZoningRotationY] = useState(0);
  const [zoningFlipH, setZoningFlipH] = useState(false);
  const [debugOverlayVisible, setDebugOverlayVisible] = useState(false);
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const panelsPortalRef = useRef<HTMLDivElement | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lngLat: [number, number]; id: number } | undefined>(undefined);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [timeOfDayHour, setTimeOfDayHour] = useState(12);
  const [streetViewTarget, setStreetViewTarget] = useState<{ worldX: number; worldZ: number; id: number } | null>(null);
  const [isStreetView, setIsStreetView] = useState(false);
  const [exitStreetViewTrigger, setExitStreetViewTrigger] = useState(0);

  // Demographics & catchment state (replaces former drainage panel)
  const [showDemographicsPanel, setShowDemographicsPanel] = useState(false);

  // Competitor analysis state (replaces former stakeholder impact panel)
  const [showCompetitorPanel, setShowCompetitorPanel] = useState(false);
  const [showZoningPanel, setShowZoningPanel] = useState(false);
  const [showGrantsPanel, setShowGrantsPanel] = useState(false);
  const [competitorRadius, setCompetitorRadius] = useState(400); // meters
  const [competitorMarkers, setCompetitorMarkers] = useState<
    Array<{ name: string; cat: string; lat: number; lng: number }>
  >([]);
  // Index of the competitor pin whose popup is currently open. -1 = closed.
  const [openCompetitorIndex, setOpenCompetitorIndex] = useState<number>(-1);
  // Close the popup whenever the user navigates away from competitor analysis.
  useEffect(() => {
    if (!showCompetitorPanel) setOpenCompetitorIndex(-1);
  }, [showCompetitorPanel]);
  // Close the popup whenever the marker set itself changes (e.g. user toggled
  // the category dropdown or moved the radius slider) so we never silently
  // re-run an LLM analysis against a different competitor that happens to
  // occupy the same index.
  useEffect(() => {
    setOpenCompetitorIndex(-1);
  }, [competitorMarkers]);
  // Cache-hit set: which markers already have a generated analysis stored
  // locally. Drives the red→green pin color and lets the popup skip a
  // network call on repeat opens.
  const [analyzedCompetitorKeys, setAnalyzedCompetitorKeys] = useState<
    Set<string>
  >(new Set());
  // Rescan localStorage whenever the marker set or active plan changes so a
  // freshly-loaded panel paints already-analyzed pins green on first render.
  useEffect(() => {
    setAnalyzedCompetitorKeys(
      listCachedCompetitorKeys(activePlan?.id ?? null, competitorMarkers),
    );
  }, [competitorMarkers, activePlan]);

  // Existing impact-color heatmap on OSM buildings (separate from the side
  // panels) is still driven by the stakeholder analysis; kept intact.
  const [stakeholderRadius, setStakeholderRadius] = useState<ImpactRadius>(250);
  const [stakeholderAnalysis, setStakeholderAnalysis] = useState<StakeholderAnalysis | null>(null);
  const osmBuildingsDataRef = useRef<Building[]>([]);

  // Traffic impact analysis state
  const [showTrafficImpact, setShowTrafficImpact] = useState(false);
  const [trafficImpactResult, setTrafficImpactResult] = useState<TrafficImpactResult | null>(null);
  const roadNetworkRef = useRef<RoadNetwork | null>(null);
  const [roadNetworkReady, setRoadNetworkReady] = useState(false);

  // Barricade / road block state
  const [barricadedEdgeIds, setBarricadedEdgeIds] = useState<Set<string>>(new Set());
  const [isBarricadeMode, setIsBarricadeMode] = useState(false);

  // Mapbox real traffic data
  const mapboxCongestionRef = useRef<Map<string, MapboxCongestion> | null>(null);
  const [mapboxDataTimestamp, setMapboxDataTimestamp] = useState<Date | null>(null);
  const [isLoadingMapbox, setIsLoadingMapbox] = useState(false);
  const [useRealTrafficData, setUseRealTrafficData] = useState(false);

  // Shadow analysis state
  const [shadowEnabled, setShadowEnabled] = useState(false);
  const [shadowDayOfYear, setShadowDayOfYear] = useState(172); // Summer solstice default
  const [shadowResults, setShadowResults] = useState<ShadowAnalysisSummary | null>(null);
  const [isShadowAnalyzing, setIsShadowAnalyzing] = useState(false);
  const [showProposedBuilding, setShowProposedBuilding] = useState(true);
  const [showShadowOverlay, setShowShadowOverlay] = useState(false);
  const shadowAnalysisRef = useRef<{
    runAnalysis: (dayOfYear: number) => Promise<ShadowAnalysisSummary | null>;
    applyShadowOverlay: (impacts: BuildingShadowImpact[], filterHour?: number) => void;
    clearShadowOverlay: () => void;
  } | null>(null);

  // Load the OSM landmark-name lookup (cluster building id → "CN Tower" etc.)
  // once on mount so we can name any building the user picks in move-in mode.
  useEffect(() => {
    let cancelled = false;
    fetch("/map-data/building-names.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j) setExistingBuildingNames(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fetch map data and available buildings on mount
  useEffect(() => {
    prefetchMapData();

    // Fetch available custom buildings
    async function fetchAvailableBuildings() {
      try {
        const response = await fetch("/api/editor/building");
        const data = await response.json();

        // Start with default buildings
        const buildings: AvailableBuilding[] = [
          {
            id: "default-sleep",
            name: "Modern Office Tower",
            path: "/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf",
            type: "default",
          },
        ];

        // Add custom buildings from API
        if (data.buildings && Array.isArray(data.buildings)) {
          data.buildings.forEach(
            (b: { id: string; publicPath: string }, index: number) => {
              buildings.push({
                id: b.id,
                name: `Custom Building ${index + 1}`,
                path: b.publicPath,
                type: "custom",
              });
            },
          );
        }

        setAvailableBuildings(buildings);
      } catch (error) {
        console.error("Failed to fetch available buildings:", error);
        // Set default building as fallback
        setAvailableBuildings([
          {
            id: "default-sleep",
            name: "Modern Office Tower",
            path: "/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf",
            type: "default",
          },
        ]);
      }
    }

    fetchAvailableBuildings();
  }, []);

  // Check for imported building from editor or /start upload
  useEffect(() => {
    const buildingId = searchParams.get("buildingId");
    if (buildingId) {
      const modelPath = `/api/editor/building/${buildingId}`;
      setCustomModelPath(modelPath);
      setImportedBuildingName("Custom building from /start");
      setIsPlacementMode(true);
      // Editor/upload geometry is authored in real meters; the map's
      // projection uses 10/1.4 world units per meter. Double that so
      // placed buildings read at 2× their editor dimensions.
      const placementScale = (10 / 1.4) * 2;
      setBuildingScale({ x: placementScale, y: placementScale, z: placementScale });

      // Pick up any material breakdown stashed by /start
      try {
        const cached = sessionStorage.getItem(`materials:${buildingId}`);
        if (cached) {
          setPendingMaterials(JSON.parse(cached) as MaterialCostBreakdown);
        }
      } catch (err) {
        console.warn("Could not parse cached materials:", err);
      }

      console.log(`✅ Imported building: ${modelPath}`);
    }
  }, [searchParams]);

  // Check for guided mode from /start
  useEffect(() => {
    const modeParam = searchParams.get("mode");
    if (modeParam && (VALID_BUILD_MODES as readonly string[]).includes(modeParam)) {
      setGuidedBuildMode(modeParam as BuildMode);
      // Move-in selects an existing building and shouldn't spawn the green
      // placement ghost — that's for new-build / demolish-rebuild only.
      if (modeParam !== "move-in") {
        setIsPlacementMode(true);
      }
    }
  }, [searchParams]);

  // Shadow analysis handlers
  const handleRunShadowAnalysis = async (doy: number) => {
    if (!shadowAnalysisRef.current) return;
    setIsShadowAnalyzing(true);
    const results = (await shadowAnalysisRef.current.runAnalysis(doy)) ?? null;
    setShadowResults(results);
    setIsShadowAnalyzing(false);
    // Auto-enable overlay if there are results
    if (results && results.totalAffected > 0) {
      setShowShadowOverlay(true);
      shadowAnalysisRef.current?.applyShadowOverlay(results.impacts, timeOfDayHour);
    }
  };

  const handleToggleShadowOverlay = (show: boolean) => {
    setShowShadowOverlay(show);
    if (show && shadowResults) {
      shadowAnalysisRef.current?.applyShadowOverlay(shadowResults.impacts, timeOfDayHour);
    } else {
      shadowAnalysisRef.current?.clearShadowOverlay();
    }
  };

  // Update shadow overlay when time of day changes
  useEffect(() => {
    if (showShadowOverlay && shadowResults) {
      shadowAnalysisRef.current?.applyShadowOverlay(shadowResults.impacts, timeOfDayHour);
    }
  }, [timeOfDayHour, showShadowOverlay, shadowResults]);

  // Clean up shadow overlay when disabling shadow mode
  useEffect(() => {
    if (!shadowEnabled) {
      shadowAnalysisRef.current?.clearShadowOverlay();
      setShowShadowOverlay(false);
    }
  }, [shadowEnabled]);

  const handleMapClick = (
    coordinate: {
      lat: number;
      lng: number;
      worldX: number;
      worldY: number;
      worldZ: number;
      ghostRotationY?: number;
      existingBuildingId?: string;
    } | null,
  ) => {
    if (coordinate) {
      // Move-in: clicking an existing building just records the selection.
      // No placement ghost, no placement form — the user is leasing space,
      // not erecting a structure. We look up the building's height so the
      // banner can show a floor slider before sending them to the wizard.
      if (guidedBuildMode === "move-in" && coordinate.existingBuildingId) {
        const id = coordinate.existingBuildingId;
        const entry = existingBuildingNames?.[id];
        const name = entry?.name ?? `Building ${id}`;
        const b = osmBuildingsDataRef.current.find((x) => x.id === id);
        const heightM = b?.height ?? 0;
        const isHouse = heightM > 0 && heightM < 6;
        const floorCount = Math.max(1, Math.floor(heightM / 3.5));
        setSelectedExistingBuilding({
          buildingId: id,
          name,
          lat: coordinate.lat,
          lng: coordinate.lng,
          heightM,
          floorCount,
          isHouse,
        });
        setMoveInFloor(isHouse ? 1 : Math.min(floorCount, 1)); // start on the ground floor
        return;
      }
      if (isPlacementMode) {
        setPendingPlacement(coordinate);
      } else if (isStreetViewSelectionMode) {
        setStreetViewTarget({ worldX: coordinate.worldX, worldZ: coordinate.worldZ, id: Date.now() });
        setIsStreetViewSelectionMode(false);
      }
    }
  };

  const handlePlacementSubmit = (details: BuildingPlacementDetails) => {
    if (!pendingPlacement) return;

    let modelPath = customModelPath;
    if (!modelPath && availableBuildings.length > 0) {
      modelPath = availableBuildings[0].path;
    }
    if (!modelPath) {
      modelPath = "/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf";
    }

    // Mint the plan id up front when the guided flow expects one so we can
    // stamp it onto the building and link back from the wizard.
    const guidedPlanFlow =
      details.buildMode === "new-build" ||
      details.buildMode === "demolish-rebuild";
    const mintedPlanId = guidedPlanFlow ? consumeNextBusinessId() : undefined;
    const buildingId = `building-${Date.now()}`;

    const newBuilding: PlacedBuilding = {
      id: buildingId,
      modelPath,
      position: {
        x: pendingPlacement.worldX,
        y: pendingPlacement.worldY,
        z: pendingPlacement.worldZ,
      },
      rotation: { x: 0, y: pendingPlacement.ghostRotationY || 0, z: 0 },
      scale: { x: buildingScale.x, y: buildingScale.y, z: buildingScale.z },
      lat: pendingPlacement.lat,
      lng: pendingPlacement.lng,
      timeline: {
        zoneType: details.zoneType,
        startDate: details.startDate,
        durationDays: details.durationDays,
      },
      buildMode: details.buildMode,
      leaseTerm: details.leaseTerm,
      leaseMonths: details.leaseMonths,
      existingBuildingId: pendingPlacement.existingBuildingId,
      uploadedModelMaterials: pendingMaterials,
      businessPlanId: mintedPlanId,
    };
    setPlacedBuildings([...placedBuildings, newBuilding]);
    setPendingPlacement(null);
    setPendingMaterials(null);
    setTimelineDate(details.startDate);

    // After placing in new-build / demolish-rebuild, jump straight to the
    // business-plan wizard for this site. The wizard will route back to /map
    // with planId + placedBuildingId so the analysis stage can anchor on the
    // building we just placed.
    if (guidedPlanFlow && mintedPlanId != null) {
      router.push(
        `/plan/business-${mintedPlanId}?placedBuildingId=${encodeURIComponent(buildingId)}`,
      );
    }
  };

  const clearImportedBuilding = () => {
    setCustomModelPath(null);
    setImportedBuildingName(null);
    setSelectedModelId(null);
    setIsPlacementMode(false);
    setBuildingScale({ x: 7.5, y: 7.5, z: 7.5 });
    // Clear the URL param
    window.history.replaceState({}, "", "/map");
  };

  const removeBuilding = (id: string) => {
    setPlacedBuildings(placedBuildings.filter((b) => b.id !== id));
    if (selectedBuildingId === id) {
      setSelectedBuildingId(null);
    }
  };

  const updateSelectedBuilding = (updates: Partial<PlacedBuilding>) => {
    if (!selectedBuildingId) return;
    setPlacedBuildings(
      placedBuildings.map((b) =>
        b.id === selectedBuildingId ? { ...b, ...updates } : b,
      ),
    );
  };

  const selectedBuilding = placedBuildings.find(
    (b) => b.id === selectedBuildingId,
  );

  useEffect(() => {
    if (selectedBuildingId) {
      setNextBusinessIdPreview(peekNextBusinessId());
    }
  }, [selectedBuildingId]);

  const openBusinessPlan = (building: PlacedBuilding) => {
    const existing = building.businessPlanId;
    const planId = existing ?? consumeNextBusinessId();
    if (existing == null) {
      setPlacedBuildings((prev) =>
        prev.map((b) =>
          b.id === building.id ? { ...b, businessPlanId: planId } : b,
        ),
      );
      setNextBusinessIdPreview(peekNextBusinessId());
    }
    router.push(`/plan/business-${planId}?buildingId=${building.id}`);
  };

  // Buildings that are under construction (active) at the current timeline date
  const buildingsActiveAtTimeline = useMemo(() => {
    return placedBuildings.filter((b) => {
      if (!b.timeline?.startDate || b.timeline.durationDays == null)
        return true; // no timeline = always "active"
      return isUnderConstruction(
        b.timeline.startDate,
        b.timeline.durationDays,
        timelineDate,
      );
    });
  }, [placedBuildings, timelineDate]);


  // Traffic impact analysis: re-analyze whenever placed buildings or barricades change
  useEffect(() => {
    if (!showTrafficImpact || placedBuildings.length === 0 || !roadNetworkRef.current) {
      setTrafficImpactResult(null);
      return;
    }
    const buildingsForAnalysis = placedBuildings
      .filter((b) => b.timeline?.zoneType)
      .map((b) => ({
        id: b.id,
        position: [b.lng, b.lat] as [number, number],
        zoneCode: b.timeline!.zoneType!,
        scale: b.scale,
        buildMode: b.buildMode ?? "new-build",
      }));
    if (buildingsForAnalysis.length === 0) {
      setTrafficImpactResult(null);
      return;
    }
    const result = analyzeTrafficImpact(buildingsForAnalysis, roadNetworkRef.current, {
      barricadedEdgeIds: barricadedEdgeIds.size > 0 ? barricadedEdgeIds : undefined,
      mapboxCongestion: useRealTrafficData ? mapboxCongestionRef.current ?? undefined : undefined,
    });
    setTrafficImpactResult(result);
  }, [showTrafficImpact, placedBuildings, roadNetworkReady, barricadedEdgeIds, useRealTrafficData, mapboxDataTimestamp]);

  // Fetch Mapbox traffic data
  const handleFetchMapboxData = async () => {
    if (!roadNetworkRef.current) return;
    setIsLoadingMapbox(true);
    try {
      const data = await fetchMapboxCongestion(roadNetworkRef.current);
      mapboxCongestionRef.current = data;
      setMapboxDataTimestamp(new Date());
      setUseRealTrafficData(data.size > 0);
    } catch {
      console.warn("Failed to fetch Mapbox traffic data");
    } finally {
      setIsLoadingMapbox(false);
    }
  };

  // Barricade toggle handler
  const handleBarricadeToggle = (edgeId: string) => {
    setBarricadedEdgeIds(prev => {
      const next = new Set(prev);
      if (next.has(edgeId)) {
        next.delete(edgeId);
        next.delete(edgeId + "-reverse");
      } else {
        next.add(edgeId);
        next.add(edgeId + "-reverse");
      }
      return next;
    });
  };

  // Timeline range from earliest start to latest end across all placed buildings
  const timelineRange = useMemo(() => {
    const now = new Date();
    const defaultMin = new Date(now);
    defaultMin.setMonth(now.getMonth() - 3);
    const defaultMax = new Date(now);
    defaultMax.setMonth(now.getMonth() + 6);
    if (placedBuildings.length === 0) {
      return { minDate: defaultMin, maxDate: defaultMax };
    }
    let minT = Infinity;
    let maxT = -Infinity;
    placedBuildings.forEach((b) => {
      if (b.timeline?.startDate && b.timeline.durationDays != null) {
        const start = new Date(b.timeline.startDate).getTime();
        const end = start + b.timeline.durationDays * 24 * 60 * 60 * 1000;
        minT = Math.min(minT, start);
        maxT = Math.max(maxT, end);
      }
    });
    if (minT === Infinity) minT = defaultMin.getTime();
    if (maxT === -Infinity) maxT = defaultMax.getTime();
    return { minDate: new Date(minT), maxDate: new Date(maxT) };
  }, [placedBuildings]);
  const minDateStr = timelineRange.minDate.toISOString().slice(0, 10);
  const maxDateStr = timelineRange.maxDate.toISOString().slice(0, 10);

  // Clamp timeline to range when range changes (e.g. after placing/removing buildings)
  useEffect(() => {
    setTimelineDate((d) => {
      if (d < minDateStr) return minDateStr;
      if (d > maxDateStr) return maxDateStr;
      return d;
    });
  }, [minDateStr, maxDateStr]);

  // Timeline play: advance by one week
  useEffect(() => {
    if (!isTimelinePlaying) return;
    const interval = setInterval(() => {
      setTimelineDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        const nextStr = next.toISOString().slice(0, 10);
        if (nextStr > maxDateStr) return maxDateStr;
        return nextStr;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [isTimelinePlaying, maxDateStr]);

  const {
    score: populationHappiness,
    avgDb,
    activeCount,
  } = computeHappinessScore(placedBuildings, timelineDate);

  // Calculate dynamic environmental metrics based on buildings active at current timeline date.
  // Metrics scale with construction progress (0→1) so CO2, energy, and water ramp up as the timeline advances.
  const buildingMetrics = useMemo(() => {
    if (buildingsActiveAtTimeline.length === 0) {
      return {
        co2Emissions: 0,
        energyConsumption: 0,
        waterUsage: 0,
        totalFootprint: 0,
        materialComplexity: "N/A",
        sustainabilityScore: 100,
      };
    }

    let totalCO2 = 0;
    let totalEnergy = 0;
    let totalWater = 0;
    let totalFootprint = 0;
    let complexityScore = 0;

    buildingsActiveAtTimeline.forEach((building) => {
      // Progress 0–1: no timeline = treat as fully complete (1)
      const progress =
        building.timeline?.startDate != null &&
        building.timeline?.durationDays != null
          ? getConstructionProgress(
              building.timeline.startDate,
              building.timeline.durationDays,
              timelineDate,
            )
          : 1;

      const footprint = building.scale.x * building.scale.z * 4;
      const height = building.scale.y * 1;

      // Footprint "completed so far" grows with progress
      totalFootprint += footprint * progress;

      const constructionCO2 = footprint * 0.5 * (1 + height / 30);
      const annualOperationalCO2 = footprint * 0.02 * (1 + height / 50);
      totalCO2 += progress * (constructionCO2 + annualOperationalCO2);

      const energyPerSqM = 180 + (height / 10) * 20;
      totalEnergy += progress * ((footprint * energyPerSqM) / 1000);

      const waterPerSqM = 8 + (height / 20) * 3;
      totalWater += progress * ((footprint * waterPerSqM * 365) / 1000);

      complexityScore += footprint > 2000 ? 3 : footprint > 1000 ? 2 : 1;
    });

    const avgComplexity = complexityScore / buildingsActiveAtTimeline.length;
    const materialComplexity =
      avgComplexity >= 2.5
        ? "High (Steel/Glass)"
        : avgComplexity >= 1.5
          ? "Medium (Concrete)"
          : "Low (Wood/Brick)";

    const impactFactor = totalCO2 / 100 + totalEnergy / 50 + totalWater / 500;
    const sustainabilityScore = Math.max(0, Math.min(100, 100 - impactFactor));

    return {
      co2Emissions: totalCO2,
      energyConsumption: totalEnergy,
      waterUsage: totalWater,
      totalFootprint,
      materialComplexity,
      sustainabilityScore,
    };
  }, [buildingsActiveAtTimeline, timelineDate]);

  // Financial metrics derived from each placed building's scale + chosen build mode.
  // Rates are approximated for Toronto commercial real estate.
  const buildingFinancials = useMemo(() => {
    const LAND_PER_M2 = 2000;           // CAD per m² of footprint (mid-Toronto, not downtown core)
    const CONSTRUCTION_PER_M2 = 1800;   // CAD per m² of gross floor area (low/mid-rise commercial)
    const DEMOLITION_PER_M2 = 80;       // CAD per m² of existing footprint
    const FITOUT_PER_M2 = 1500;         // CAD per m² for restaurant interior fit-out
    const LEASE_PER_M2_PER_YEAR_LONG = 350;   // CAD per m² per year (5-yr lease)
    const SHORT_TERM_PREMIUM = 1.25;    // 25% premium for short-term lease

    type Breakdown = {
      id: string;
      mode: BuildMode;
      footprint: number;
      gfa: number;
      land: number;
      construction: number;
      demolition: number;
      fitOut: number;
      lease: number;        // total lease cost over the chosen term
      annualLease: number;  // annualized lease for ongoing cost view
      materialsCost: number; // from parsed GLB materials, if available
      embodiedCo2Kg: number; // from parsed GLB materials, if available
      total: number;
    };

    const breakdown: Breakdown[] = placedBuildings.map((b) => {
      const footprint = b.scale.x * b.scale.z * 4;
      const height = b.scale.y * 1;
      const floors = Math.max(1, Math.round(height / 3.5));
      const gfa = footprint * floors;
      const mode: BuildMode = b.buildMode ?? "new-build";

      let land = 0;
      let construction = 0;
      let demolition = 0;
      let fitOut = 0;
      let lease = 0;
      let annualLease = 0;
      let materialsCost = 0;
      let embodiedCo2Kg = 0;

      if (mode === "new-build") {
        land = footprint * LAND_PER_M2;
        construction = gfa * CONSTRUCTION_PER_M2;
      } else if (mode === "demolish-rebuild") {
        land = footprint * LAND_PER_M2;
        construction = gfa * CONSTRUCTION_PER_M2;
        // assume the existing structure has comparable footprint and ~2 stories worth of debris
        demolition = footprint * 2 * DEMOLITION_PER_M2;
      } else if (mode === "move-in") {
        const months = b.leaseMonths ?? 60;
        const rateMultiplier = b.leaseTerm === "short" ? SHORT_TERM_PREMIUM : 1;
        const annualRate = LEASE_PER_M2_PER_YEAR_LONG * rateMultiplier;
        annualLease = gfa * annualRate;
        lease = (annualLease * months) / 12;
        fitOut = gfa * FITOUT_PER_M2;
      }

      // Replace the generic per-m² construction cost with the GLB material
      // breakdown when one is available (new-build / demolish-rebuild only).
      if (
        b.uploadedModelMaterials &&
        (mode === "new-build" || mode === "demolish-rebuild")
      ) {
        const targetVolumeM3 = footprint * height;
        const normalized = normalizeBreakdownToVolume(
          b.uploadedModelMaterials,
          targetVolumeM3,
        );
        materialsCost = normalized.totalCost;
        embodiedCo2Kg = normalized.totalEmbodiedCo2Kg;
        construction = materialsCost; // override the generic estimate
      }

      const total = land + construction + demolition + fitOut + lease;
      return {
        id: b.id,
        mode,
        footprint,
        gfa,
        land,
        construction,
        demolition,
        fitOut,
        lease,
        annualLease,
        materialsCost,
        embodiedCo2Kg,
        total,
      };
    });

    const acquisition = breakdown.reduce((s, x) => s + x.land + x.lease, 0);
    const buildCost = breakdown.reduce(
      (s, x) => s + x.construction + x.demolition + x.fitOut,
      0,
    );
    const annualLeaseTotal = breakdown.reduce((s, x) => s + x.annualLease, 0);
    const totalProjectCost = breakdown.reduce((s, x) => s + x.total, 0);
    const totalGfa = breakdown.reduce((s, x) => s + x.gfa, 0);
    const costPerSqM = totalGfa > 0 ? totalProjectCost / totalGfa : 0;

    const modeCount = breakdown.reduce(
      (acc, x) => {
        acc[x.mode] = (acc[x.mode] || 0) + 1;
        return acc;
      },
      {} as Record<BuildMode, number>,
    );

    return {
      breakdown,
      acquisition,
      buildCost,
      annualLeaseTotal,
      totalProjectCost,
      costPerSqM,
      totalGfa,
      modeCount,
    };
  }, [placedBuildings]);

  // Local money formatter the strategyCosts memo needs before the outer
  // formatCurrency is declared. Same rules.
  const formatCurrencyLocal = (n: number) => {
    if (n === 0) return "$0";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  // Strategy-aware merge of buildingFinancials (per-building scale-based cost)
  // and planCosts (capital + Y1 operating from the wizard). Each strategy
  // frames its three cards differently:
  //   move-in        : Lease (Annual)  | Fit-out (plan capital)
  //   new-build      : Land Acquisition | Construction + Fit-out
  //   demolish-rebuild : Land + Demolition | Construction + Fit-out
  // Total = sum of the two cards above + first-year operating cost.
  const strategyCosts = useMemo(() => {
    const latest = placedBuildings[placedBuildings.length - 1];
    // Determine the active strategy: prefer the just-placed building's mode,
    // otherwise (URL-only analysis stage) infer from the URL / fallback to
    // move-in since that's the only path that lands here without a placed
    // building.
    const strategy: BuildMode =
      latest?.buildMode ?? (analysisOsmBuildingId ? "move-in" : "new-build");

    // Per-strategy scale-derived numbers come from buildingFinancials when a
    // building is placed; otherwise zero (no shape to scale from).
    const scaleLand = latest ? buildingFinancials.acquisition : 0;
    const scaleBuild = latest ? buildingFinancials.buildCost : 0;

    // Plan contributions — capital is the up-front fit-out / equipment,
    // annualLease is the rent commitment (move-in only), Y1 operating folds
    // into the total to give a year-one all-in figure.
    const planCapital = planCosts?.capital ?? 0;
    const planAnnualLease = planCosts?.annualLease ?? 0;
    const planAnnualOperating = planCosts?.annualOperating ?? 0;

    if (strategy === "move-in") {
      const acquisition = planAnnualLease;
      const build = planCapital;
      return {
        strategy,
        acquisition,
        build,
        totalProjectCost: acquisition + build + planAnnualOperating,
        acquisitionLabel: "Lease (Annual)",
        buildLabel: "Fit-out",
        acquisitionSub:
          planCosts != null
            ? `${formatCurrencyLocal(planCosts.monthlyRent)}/mo rent from your plan`
            : "Annual rent from plan",
        buildSub: planCosts
          ? "Capital from your plan (own + loan + grants)"
          : "Fit-out capital",
        totalSub: planCosts
          ? `Fit-out + Y1 operating (${formatCurrencyLocal(planCosts.monthlyOperating)}/mo)`
          : "Year-one all-in (lease + capital + operating)",
      };
    }

    // Demolish-rebuild and new-build share the same card structure; demolish
    // just folds demolition into "Land + Demolition".
    const isDemolish = strategy === "demolish-rebuild";
    const acquisition = scaleLand; // already includes lease overlap if mixed modes
    const build = scaleBuild + planCapital;
    return {
      strategy,
      acquisition,
      build,
      totalProjectCost: acquisition + build + planAnnualOperating,
      acquisitionLabel: isDemolish ? "Land + Demolition" : "Land Acquisition",
      buildLabel: planCapital > 0 ? "Construction + Fit-out" : "Construction Cost",
      acquisitionSub: isDemolish
        ? "One-time land + demolition"
        : "One-time land purchase",
      buildSub:
        planCapital > 0
          ? `Building shell + ${formatCurrencyLocal(planCapital)} interior fit-out from plan`
          : "Scales with building footprint & floors",
      totalSub:
        planCosts != null
          ? `Land + build + fit-out + Y1 operating (${formatCurrencyLocal(planCosts.monthlyOperating)}/mo)`
          : `${formatCurrencyLocal(buildingFinancials.costPerSqM)}/m² avg · ${buildingFinancials.totalGfa.toFixed(0)} m² GFA`,
    };
  }, [
    placedBuildings,
    buildingFinancials,
    planCosts,
    analysisOsmBuildingId,
    // formatCurrencyLocal is declared below but never reassigned; it's stable
    // for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  const formatCurrency = (n: number) => {
    if (n === 0) return "$0";
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  };

  // Snapshot the same labels and dollar values the right-sidebar Financial
  // Metrics cards display, so the Ask AI feature can quote exact field
  // names ("Fit-out", "Lease (Annual)") + values when the user highlights a
  // number in that section. Mirrors the IIFE inside the JSX at ~line 2400.
  const financialAskData = useMemo(() => {
    const hasBuildings = placedBuildings.length > 0;
    const usePlanCosts = !hasBuildings && planCosts !== null;
    return {
      source: usePlanCosts ? "business-plan" : hasBuildings ? "placed-buildings" : "empty",
      strategy: strategyCosts.strategy,
      totalProjectCost: { label: "Total Project Cost", valueCad: strategyCosts.totalProjectCost, display: formatCurrency(strategyCosts.totalProjectCost) },
      acquisition: { label: strategyCosts.acquisitionLabel, valueCad: strategyCosts.acquisition, display: formatCurrency(strategyCosts.acquisition) },
      buildOrFitOut: { label: strategyCosts.buildLabel, valueCad: strategyCosts.build, display: formatCurrency(strategyCosts.build) },
      monthlyOperating: planCosts ? planCosts.monthlyOperating : null,
      monthlyRent: planCosts ? planCosts.monthlyRent : null,
      planName: activePlan?.concept.name ?? null,
      planCategory: activePlan?.concept.category ?? null,
      capitalOwn: activePlan?.financials.capitalOwn ?? null,
      capitalLoan: activePlan?.financials.capitalLoan ?? null,
      capitalGrants: activePlan?.financials.capitalGrants ?? null,
      totalGfaSqm: buildingFinancials.totalGfa,
      costPerSqM: buildingFinancials.costPerSqM,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedBuildings, planCosts, buildingFinancials, activePlan]);

  useAskScopeData({
    id: "financials",
    title: "Financial Metrics",
    data: financialAskData,
  });

  const BUILD_MODE_LABELS: Record<BuildMode, string> = {
    "new-build": "Ground-up",
    "demolish-rebuild": "Demolish + Build",
    "move-in": "Move-in",
  };

  // Aggregate signals from every panel into the reasonableness review payload.
  // Uses the most recently placed building as the focal proposal.
  const buildReasonablenessPayload = () => {
    const latest = placedBuildings[placedBuildings.length - 1];
    if (!latest) return {};
    const fin = buildingFinancials.breakdown.find((b) => b.id === latest.id);
    const stakeholderSummary = stakeholderAnalysis
      ? `Affected buildings: ${stakeholderAnalysis.impacts?.length ?? 0}, radius: ${stakeholderRadius}m`
      : undefined;
    const trafficSummary = trafficImpactResult
      ? `Estimated daily added trips: ${Math.round(trafficImpactResult.totalDailyTrips ?? 0)}`
      : undefined;
    return {
      building: {
        mode: latest.buildMode ?? "new-build",
        lat: latest.lat,
        lng: latest.lng,
        zoneType: latest.timeline?.zoneType,
        footprintM2: fin?.footprint,
        gfaM2: fin?.gfa,
        floors: fin?.gfa && fin.footprint ? Math.round(fin.gfa / fin.footprint) : undefined,
      },
      finance: {
        landCost: fin?.land ?? 0,
        constructionCost: fin?.construction ?? 0,
        demolitionCost: fin?.demolition ?? 0,
        fitOutCost: fin?.fitOut ?? 0,
        leaseCostTotal: fin?.lease ?? 0,
        totalProjectCost: fin?.total ?? 0,
        annualLease: fin?.annualLease ?? 0,
        materialsCost: fin?.materialsCost,
        embodiedCo2Kg: fin?.embodiedCo2Kg,
      },
      context: {
        officialPlanZone: latest.timeline?.zoneType ?? null,
        zoneWarning: null,
        trafficSummary,
        stakeholderSummary,
        co2TonnesPerYear: buildingMetrics.co2Emissions / 1000,
        avgConstructionDb: avgDb,
      },
    };
  };

  // Keyboard controls for selected building
  useEffect(() => {
    if (!selectedBuildingId || !selectedBuilding) return;

    function handleKeyPress(event: KeyboardEvent) {
      // Don't interfere with browser shortcuts
      if (event.metaKey || event.ctrlKey) return;
      // Don't interfere with text inputs
      if ((event.target as HTMLElement).tagName === "INPUT") return;

      if (!selectedBuilding) return;

      const step = event.shiftKey ? 10 : 1;
      const rotationStep = event.shiftKey ? 15 : 5; // degrees
      const scaleStep = event.shiftKey ? -0.5 : 0.5;

      let updated = false;
      const newBuilding = { ...selectedBuilding };

      switch (event.key) {
        case "ArrowLeft":
          newBuilding.position.x -= step;
          updated = true;
          break;
        case "ArrowRight":
          newBuilding.position.x += step;
          updated = true;
          break;
        case "ArrowUp":
          newBuilding.position.z -= step;
          updated = true;
          break;
        case "ArrowDown":
          newBuilding.position.z += step;
          updated = true;
          break;
        case "PageUp":
          newBuilding.position.y += step;
          updated = true;
          break;
        case "PageDown":
          newBuilding.position.y -= step;
          updated = true;
          break;
        case "r":
        case "R":
          newBuilding.rotation.y += (rotationStep * Math.PI) / 180;
          updated = true;
          break;
        case "s":
          newBuilding.scale.x += scaleStep;
          newBuilding.scale.y += scaleStep;
          newBuilding.scale.z += scaleStep;
          updated = true;
          break;
        case "S":
          newBuilding.scale.x = Math.max(0.1, newBuilding.scale.x + scaleStep);
          newBuilding.scale.y = Math.max(0.1, newBuilding.scale.y + scaleStep);
          newBuilding.scale.z = Math.max(0.1, newBuilding.scale.z + scaleStep);
          updated = true;
          break;
        default:
          return;
      }

      if (updated) {
        setPlacedBuildings(
          placedBuildings.map((b) =>
            b.id === selectedBuildingId ? newBuilding : b,
          ),
        );
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedBuildingId, selectedBuilding, placedBuildings]);

  // Escape key exits street view
  useEffect(() => {
    if (!isStreetView) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExitStreetViewTrigger((n) => n + 1);
      }
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isStreetView]);

  return (
    <HighlightAskProvider
      getPageState={() => ({
        rawBuildings: placedBuildings.map((b) => ({
          id: b.id,
          lat: b.lat,
          lng: b.lng,
          scale: b.scale,
          rotation: b.rotation,
          buildMode: b.buildMode,
          timeline: b.timeline,
          existingBuildingId: b.existingBuildingId,
          businessPlanId: b.businessPlanId,
        })),
        trafficImpactResult,
        stakeholderAnalysis,
        shadowResults,
        competitorState: showCompetitorPanel
          ? { radius: competitorRadius, markers: competitorMarkers }
          : null,
        fallbackAnchor:
          placedBuildings.length === 0 ? { lat: 43.6532, lng: -79.3832 } : null,
      })}
    >
    <div className="relative min-h-screen w-full bg-slate-100 text-slate-900 overflow-hidden">
      {/* MAP BACKGROUND (3D Simulation) */}
      <div className="absolute inset-0 z-0">
        <ThreeMap
          className="w-full h-full"
          onCoordinateClick={handleMapClick}
          placedBuildings={placedBuildings}
          isPlacementMode={isPlacementMode}
          selectExistingMode={guidedBuildMode === "move-in"}
          highlightBuildable={
            isPlacementMode &&
            guidedBuildMode !== "move-in" &&
            !pendingPlacement
          }
          buildingScale={buildingScale}
          selectedBuildingId={selectedBuildingId}
          onBuildingSelect={setSelectedBuildingId}
          customModelPath={customModelPath}
          timelineDate={timelineDate}
          showNoiseRipple={showNoiseRipple}
          showZoningLayer={showZoningLayer}
          showParksLayer={showParksLayer}
          showWaterLayer={showWaterLayer}
          showTorontoTreesLayer={showTorontoTreesLayer}
          showTrafficDensityLayer={showTrafficDensityLayer}
          showWindLayer={showWindLayer}
          windData={showWindLayer ? windData : null}
          zoningOffset={zoningOffset}
          zoningRotationY={zoningRotationY}
          zoningFlipH={zoningFlipH}
          debugOverlayVisible={debugOverlayVisible}
          onDebugOverlayChange={setDebugOverlayVisible}
          dashboardVisible={dashboardVisible}
          onDashboardVisibleChange={setDashboardVisible}
          panelsPortalRef={panelsPortalRef}
          flyToTarget={flyToTarget}
          timeOfDayHour={timeOfDayHour}
          streetViewTarget={streetViewTarget}
          onStreetViewChange={setIsStreetView}
          exitStreetViewTrigger={exitStreetViewTrigger}
          dayOfYear={shadowEnabled ? shadowDayOfYear : undefined}
          showProposedBuilding={showProposedBuilding}
          shadowAnalysisRef={shadowAnalysisRef}
          onOsmBuildingsLoaded={(buildings) => { osmBuildingsDataRef.current = buildings; }}
          onOsmClustersComputed={(idx) => { setOsmClusterIndex(idx); setRegistryRefreshTick((n) => n + 1); }}
          stakeholderImpactAnalysis={null}
          showTrafficHeatmap={showTrafficImpact}
          trafficImpactResult={showTrafficImpact ? trafficImpactResult : null}
          onRoadNetworkLoaded={(rn) => { roadNetworkRef.current = rn; setRoadNetworkReady(true); }}
          isBarricadeMode={isBarricadeMode}
          barricadedEdgeIds={barricadedEdgeIds}
          onBarricadeToggle={handleBarricadeToggle}
          isStreetViewSelectionMode={isStreetViewSelectionMode}
          isBuildingViewSelectionMode={isBuildingViewSelectionMode}
          onBuildingViewPick={(info) => {
            const buildings = osmBuildingsDataRef.current;
            const b = buildings.find((x) => x.id === info.buildingId);
            if (!b) {
              setIsBuildingViewSelectionMode(false);
              return;
            }
            const summary = summarizeFootprintForWallView(b.footprint);
            // The hit point tells us which side of the building the user
            // actually clicked — snap to the nearest cardinal so the view
            // looks out through that wall.
            const dx = info.hitWorldX - summary.worldX;
            const dz = info.hitWorldZ - summary.worldZ;
            let facingDeg = (Math.atan2(dx, -dz) * 180) / Math.PI;
            if (facingDeg < 0) facingDeg += 360;
            const snapped = (Math.round(facingDeg / 90) * 90) % 360;
            const heightM = b.height;
            const isHouse = heightM < 6;
            setPickedBuildingForView({
              buildingId: info.buildingId,
              centroidLng: summary.centroidLng,
              centroidLat: summary.centroidLat,
              worldX: summary.worldX,
              worldZ: summary.worldZ,
              heightM,
              radiusM: summary.radiusM,
              wallOffsetByDirM: summary.wallOffsetByDirM,
              defaultFacingDeg: snapped,
              isHouse,
            });
            setBuildingViewFacingDeg(snapped);
            const floors = Math.max(1, Math.floor(heightM / 3.5));
            setBuildingViewFloor(isHouse ? 1 : floors);
            setIsBuildingViewSelectionMode(false);
          }}
          buildingViewTarget={buildingViewTarget}
          hideExistingBuildingHud={
            guidedBuildMode === "move-in" || analysisOsmBuildingId !== null
          }
          analysisLockedBuildingId={analysisOsmBuildingId}
          competitorMarkers={
            showCompetitorPanel
              ? competitorMarkers.map((m) => ({
                  name: m.name,
                  lat: m.lat,
                  lng: m.lng,
                  analyzed: analyzedCompetitorKeys.has(
                    competitorCacheKey({
                      planId: activePlan?.id ?? null,
                      competitorName: m.name,
                      lat: m.lat,
                      lng: m.lng,
                    }),
                  ),
                }))
              : []
          }
          onCompetitorPinClick={(idx) => {
            if (!showCompetitorPanel) return;
            setOpenCompetitorIndex(idx);
          }}
          mapStyle={mapStyle}
        />
        {openCompetitorIndex >= 0 &&
          competitorMarkers[openCompetitorIndex] &&
          showCompetitorPanel && (
            <CompetitorAnalysisPopup
              competitor={{
                name: competitorMarkers[openCompetitorIndex].name,
                category: competitorMarkers[openCompetitorIndex].cat,
                lat: competitorMarkers[openCompetitorIndex].lat,
                lng: competitorMarkers[openCompetitorIndex].lng,
              }}
              plan={activePlan}
              buildingLatLng={
                placedBuildings.length > 0
                  ? {
                      lat: placedBuildings[0].lat,
                      lng: placedBuildings[0].lng,
                    }
                  : null
              }
              onClose={() => setOpenCompetitorIndex(-1)}
              onAnalyzed={() => {
                setAnalyzedCompetitorKeys(
                  listCachedCompetitorKeys(
                    activePlan?.id ?? null,
                    competitorMarkers,
                  ),
                );
              }}
            />
          )}
        {/* Map gradient overlay for better UI contrast */}
        <div className="absolute inset-0 map-gradient pointer-events-none"></div>

        {/* Street View HUD — info only, exit is in sidebar */}
        {isStreetView && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            <div className="glass rounded-lg px-4 py-2 flex items-center gap-3 border border-indigo-400/20">
              <Eye size={13} className="text-indigo-700" />
              <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-tight">Street View</span>
              <span className="text-[9px] text-slate-400">WASD to walk · Mouse to look</span>
            </div>
          </div>
        )}

        {/* Analysis Stage Indicator — names the locked building so the user
            knows which site the panels and reports are running against. */}
        {analysisAnchor && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 glass border-amber-400/30 px-6 py-3 rounded-lg shadow-lg z-50 pointer-events-auto flex items-center gap-4 max-w-2xl">
            <div className="flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700/80 mb-0.5">
                Step 3 of 3 · Analysis
              </p>
              <p className="text-sm font-black text-amber-700 uppercase tracking-tight">
                Site: {analysisAnchor.name}
              </p>
              <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                {analysisAnchor.existingBuildingId} ·{" "}
                {analysisAnchor.lat.toFixed(5)},{" "}
                {analysisAnchor.lng.toFixed(5)}
                {analysisPlanId ? ` · plan ${analysisPlanId}` : ""}
              </p>
            </div>
            <button
              onClick={() => router.push("/start")}
              className="text-[10px] font-bold uppercase tracking-tight text-slate-500 hover:text-slate-700 transition-colors"
            >
              Start over
            </button>
          </div>
        )}

        {/* Move-in Mode Indicator — placement ghost is intentionally off in
            this mode (the user is leasing space, not erecting a building) so
            this banner replaces the placement-mode one. */}
        {guidedBuildMode === "move-in" && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 glass border-emerald-400/30 px-6 py-4 rounded-lg shadow-lg z-50 pointer-events-auto max-w-2xl w-[min(36rem,calc(100vw-3rem))]">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700/80 mb-0.5">
                  Step 2 of 3 · Pick a venue
                </p>
                {selectedExistingBuilding ? (
                  <>
                    <p className="text-sm font-black text-emerald-700 uppercase tracking-tight">
                      Selected: {selectedExistingBuilding.name}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                      {selectedExistingBuilding.buildingId} ·{" "}
                      {selectedExistingBuilding.lat.toFixed(5)},{" "}
                      {selectedExistingBuilding.lng.toFixed(5)} ·{" "}
                      {Math.round(selectedExistingBuilding.heightM)}m tall
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-emerald-700 uppercase tracking-tight">
                      Pick a building to move into
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Hover to highlight, click to select.
                    </p>
                  </>
                )}
              </div>
              {selectedExistingBuilding && (
                <button
                  onClick={() => setSelectedExistingBuilding(null)}
                  className="text-[10px] font-bold uppercase tracking-tight text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Pick another
                </button>
              )}
              <button
                onClick={() => router.push("/start")}
                className="text-[10px] font-bold uppercase tracking-tight text-slate-500 hover:text-slate-700 transition-colors"
              >
                ← Change mode
              </button>
            </div>

            {/* Floor selector + Continue — appears once a building is picked */}
            {selectedExistingBuilding && (
              <div className="mt-4 pt-4 border-t border-emerald-300/40 space-y-3">
                {selectedExistingBuilding.isHouse ? (
                  <p className="text-[11px] text-slate-600">
                    This is a single-storey property — the business will sit on the ground floor.
                  </p>
                ) : (
                  <div>
                    <label className="flex items-center justify-between text-[10px] font-bold text-slate-700 mb-1.5">
                      <span>Which floor will your business be on?</span>
                      <span className="text-emerald-700">
                        {moveInFloor === 1 ? "Ground" : `Floor ${moveInFloor}`}{" "}
                        / {selectedExistingBuilding.floorCount}
                      </span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={selectedExistingBuilding.floorCount}
                      step={1}
                      value={moveInFloor}
                      onChange={(e) => setMoveInFloor(parseInt(e.target.value, 10))}
                      className="w-full accent-emerald-600"
                    />
                  </div>
                )}
                <button
                  onClick={() => {
                    const id = selectedExistingBuilding.buildingId;
                    const existing = getOsmPlanId(id);
                    const planId = existing ?? consumeNextBusinessId();
                    if (existing == null) setOsmPlanId(id, planId);
                    router.push(
                      `/plan/business-${planId}?osmBuildingId=${encodeURIComponent(id)}&floor=${moveInFloor}`,
                    );
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-tight bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                >
                  <ArrowRight size={13} />
                  Continue to business plan
                </button>
              </div>
            )}
          </div>
        )}

        {/* Placement Mode Indicator */}
        {isPlacementMode && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 glass border-blue-400/30 px-6 py-3 rounded-lg shadow-lg z-50 pointer-events-auto flex items-center gap-4">
            <div>
              {guidedBuildMode ? (
                <>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-700/80 mb-0.5">
                    Step 2 of 3
                  </p>
                  <p className="text-sm font-black text-blue-700 uppercase tracking-tight">
                    {BUILD_MODE_STEP_COPY[guidedBuildMode].label}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {BUILD_MODE_STEP_COPY[guidedBuildMode].hint}
                  </p>
                </>
              ) : (
                <p className="text-sm font-black text-blue-700 uppercase tracking-tight">
                  Move mouse over map · Click to place
                </p>
              )}
              {importedBuildingName && (
                <p className="text-xs text-slate-500 mt-1">
                  Model: {importedBuildingName}
                </p>
              )}
            </div>
            {guidedBuildMode && (
              <button
                onClick={() => router.push("/start")}
                className="text-[10px] font-bold uppercase tracking-tight text-slate-500 hover:text-slate-200 transition-colors"
              >
                ← Change mode
              </button>
            )}
            {customModelPath && (
              <button
                onClick={clearImportedBuilding}
                className="p-1.5 hover:bg-red-500/20 rounded-full transition-colors text-slate-500 hover:text-red-400"
                title="Cancel import"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {/* Street View Selection Mode Banner */}
        {isStreetViewSelectionMode && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 glass border-indigo-400/30 px-6 py-3 rounded-lg shadow-lg z-50 pointer-events-auto flex items-center gap-4">
            <Eye size={18} className="text-indigo-700" />
            <div>
              <p className="text-sm font-black text-indigo-700 uppercase tracking-tight">
                Move mouse over map · Click to enter street view
              </p>
            </div>
            <button
              onClick={() => setIsStreetViewSelectionMode(false)}
              className="p-1.5 hover:bg-red-500/20 rounded-full transition-colors text-slate-500 hover:text-red-400"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Imported Building Notification */}
        {customModelPath && !isPlacementMode && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 glass border-orange-400/30 px-6 py-3 rounded-lg shadow-lg z-50 pointer-events-auto flex items-center gap-4">
            <Upload size={18} className="text-orange-600" />
            <div>
              <p className="text-sm font-black text-orange-700 uppercase tracking-tight">
                Building imported from Editor
              </p>
              <p className="text-xs text-orange-700/70 mt-0.5">
                Click &apos;Place&apos; to position it on the map
              </p>
            </div>
            <button
              onClick={clearImportedBuilding}
              className="p-1.5 hover:bg-red-500/20 rounded-full transition-colors text-slate-500 hover:text-red-400"
              title="Discard import"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* OVERLAYS: panels and modals above sidebars (z-50) so they are visible */}
      <div className="absolute inset-0 z-50 pointer-events-none">
        <div
          ref={(el) => {
            panelsPortalRef.current = el;
          }}
          className="absolute inset-0"
          aria-hidden
        />
        {pendingPlacement && (
          <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
            <BuildingPlacementForm
              lat={pendingPlacement.lat}
              lng={pendingPlacement.lng}
              onSubmit={handlePlacementSubmit}
              onCancel={() => setPendingPlacement(null)}
              initialBuildMode={guidedBuildMode ?? undefined}
              lockBuildMode={guidedBuildMode !== null}
            />
          </div>
        )}
        {/* All analysis panels now render inline in the right sidebar */}
      </div>

      {/* SIDEBARS CONTAINER */}
      <div className="absolute inset-0 z-40 pointer-events-none">
        {/* LEFT SIDEBAR: LAYERS & PROJECTS — suppressed while the user is in the
            venue-selection pipeline (?mode=…) so they can focus on the map.
            Reappears once they come back from the business-plan wizard. */}
        {!inSelectionPipeline && !leftSidebarOpen && (
          <button
            onClick={() => setLeftSidebarOpen(true)}
            className="absolute left-6 top-6 pointer-events-auto w-10 h-10 glass rounded-lg flex items-center justify-center hover:bg-slate-900/10 transition-colors"
          >
            <ChevronRight size={18} className="text-slate-700" />
          </button>
        )}
        <aside
          className={`absolute left-6 top-6 w-72 pointer-events-auto flex flex-col gap-3 sidebar-transition ${placedBuildings.length > 0 ? "bottom-30" : "bottom-6"} ${!leftSidebarOpen || inSelectionPipeline ? "hidden" : ""}`}
        >
          {/* Municipal Branding */}

          {/* Geospatial Layers Panel */}
          <div className="flex-1 glass rounded-lg p-4 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-3">
              <span className="text-3!xl lp-nav-logo text-slate-900">TorontoView</span>
              <button
                onClick={() => setLeftSidebarOpen(false)}
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-900/10 transition-colors"
              >
                <ChevronLeft size={16} className="text-slate-500" />
              </button>
            </div>
            <div className="mb-3">
              <ProviderBadge className="w-full justify-start" />
            </div>
            {/* Map Style Toggle */}
            <div className="mb-4">
              <h3 className="ui-label mb-3">Map Style</h3>
              <div className="flex gap-1 p-1 rounded-lg border border-[#003F7C]/10 bg-[#003F7C]/[0.04]">
                {([
                  { id: "satellite" as const, label: "Satellite", svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
                  { id: "light" as const, label: "Light", svg: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/><circle cx="12" cy="12" r="4"/></svg> },
                ]).map(({ id, label, svg }) => {
                  const isActive = mapStyle === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setMapStyle(id)}
                      style={{ fontFamily: "var(--font-archivo), Archivo, system-ui, sans-serif" }}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[10px] font-bold uppercase tracking-[0.06em] leading-none transition-all ${
                        isActive
                          ? "bg-[#003F7C] text-white shadow-[0_2px_8px_-2px_rgba(0,63,124,0.45)]"
                          : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                      }`}
                    >
                      {svg}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between mb-5">
              <h3 className="ui-label">Geospatial Layers</h3>
            </div>

            {/* Geospatial Layers: Noise Ripple + Zoning */}
            <div className="space-y-2 pr-1">
              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showNoiseRipple
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() => setShowNoiseRipple(!showNoiseRipple)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showNoiseRipple
                        ? "text-blue-400"
                        : "text-slate-400 group-hover:text-blue-400"
                    }`}
                  >
                    <Volume2 size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      Construction Noise (DB)
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Ripple: {activeCount} active site
                      {activeCount !== 1 ? "s" : ""} · ~{avgDb} dB avg
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showNoiseRipple}
                      onChange={(e) => setShowNoiseRipple(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showZoningLayer
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() => setShowZoningLayer(!showZoningLayer)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showZoningLayer
                        ? "text-blue-400"
                        : "text-slate-400 group-hover:text-blue-400"
                    }`}
                  >
                    <Map size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      City Zoning
                    </p>
                    <p className="text-[9px] text-slate-400">
                      open.toronto.ca · Zoning By-law areas
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showZoningLayer}
                      onChange={(e) => setShowZoningLayer(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              {/* Road Traffic density toggle */}
              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showTrafficDensityLayer
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() =>
                  setShowTrafficDensityLayer(!showTrafficDensityLayer)
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showTrafficDensityLayer
                        ? "text-red-400"
                        : "text-slate-400 group-hover:text-red-400"
                    }`}
                  >
                    <Car size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      Road Traffic
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Green · Yellow · Red — density at{" "}
                      {formatHour(timeOfDayHour)}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showTrafficDensityLayer}
                      onChange={(e) =>
                        setShowTrafficDensityLayer(e.target.checked)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              {/* Water toggle */}
              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showWaterLayer
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() => setShowWaterLayer(!showWaterLayer)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showWaterLayer
                        ? "text-cyan-400"
                        : "text-slate-400 group-hover:text-cyan-400"
                    }`}
                  >
                    <Waves size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      Waterbodies
                    </p>
                    <p className="text-[9px] text-slate-400">
                      Lake Ontario shoreline · Inland ponds
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showWaterLayer}
                      onChange={(e) => setShowWaterLayer(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              {/* Wind Effects toggle */}
              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showWindLayer
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() => setShowWindLayer(!showWindLayer)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showWindLayer
                        ? "text-cyan-400"
                        : "text-slate-400 group-hover:text-cyan-400"
                    }`}
                  >
                    <Wind size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      Wind Effects
                    </p>
                    <p className="text-[9px] text-slate-400">
                      {showWindLayer && windData
                        ? `${windData.hourly[Math.floor(timeOfDayHour) % 24]?.speedMs.toFixed(1)} m/s · ${windData.hourly[Math.floor(timeOfDayHour) % 24]?.directionDeg.toFixed(0)}°`
                        : "Flow simulation · Venturi zones · Comfort"}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showWindLayer}
                      onChange={(e) => setShowWindLayer(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              {/* Street Trees toggle */}
              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showTorontoTreesLayer
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() =>
                  setShowTorontoTreesLayer(!showTorontoTreesLayer)
                }
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showTorontoTreesLayer
                        ? "text-emerald-400"
                        : "text-slate-400 group-hover:text-emerald-400"
                    }`}
                  >
                    <TreePine size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      Street Trees
                    </p>
                    <p className="text-[9px] text-slate-400">
                      open.toronto.ca · species &amp; trunk diameter
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showTorontoTreesLayer}
                      onChange={(e) =>
                        setShowTorontoTreesLayer(e.target.checked)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              {/* Parks toggle — drawn LAST in the list and assigned the
                  lowest renderOrder so zoning + traffic overlays sit on
                  top where they overlap. */}
              <div
                className={`p-2.5 rounded-md border transition-all cursor-pointer group ${
                  showParksLayer
                    ? "border-slate-900/15 bg-slate-900/8"
                    : "border-slate-900/8 hover:border-slate-900/15 bg-slate-900/5"
                }`}
                onClick={() => setShowParksLayer(!showParksLayer)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded bg-slate-900/5 border border-slate-900/10 flex items-center justify-center transition-colors ${
                      showParksLayer
                        ? "text-green-400"
                        : "text-slate-400 group-hover:text-green-400"
                    }`}
                  >
                    <Trees size={14} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-bold text-slate-800">
                      Parks &amp; Green Spaces
                    </p>
                    <p className="text-[9px] text-slate-400">
                      City of Toronto · Green Spaces dataset
                    </p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showParksLayer}
                      onChange={(e) => setShowParksLayer(e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-accent-blue h-3.5 w-3.5"
                    />
                  </div>
                </div>
              </div>

              {/* Zoning alignment controls - commented out (correct config: flipH=true, rotationY=180) */}
              {/* {showZoningLayer && (
                <div
                  className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-[9px] font-bold text-slate-500 uppercase">
                    Align Zone Position
                  </p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">X</label>
                      <input
                        type="number"
                        value={zoningOffset.x}
                        onChange={(e) =>
                          setZoningOffset((o) => ({
                            ...o,
                            x: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-2 py-1 text-[10px] font-mono bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Z</label>
                      <input
                        type="number"
                        value={zoningOffset.z}
                        onChange={(e) =>
                          setZoningOffset((o) => ({
                            ...o,
                            z: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-full px-2 py-1 text-[10px] font-mono bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-slate-500 block mb-0.5">Rotation Y (°)</label>
                      <input
                        type="number"
                        value={zoningRotationY}
                        onChange={(e) =>
                          setZoningRotationY(parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1 text-[10px] font-mono bg-white border border-slate-200 rounded"
                      />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={zoningFlipH}
                        onChange={(e) => setZoningFlipH(e.target.checked)}
                        className="accent-accent-blue h-3.5 w-3.5"
                      />
                      <span className="text-[10px] font-medium text-slate-700">
                        Flip horizontally
                      </span>
                    </label>
                  </div>
                </div>
              )} */}
            </div>

            {/* Time of Day */}
            <div className="mt-6">
              <h3 className="ui-label mb-3">Time of Day</h3>
              <div className="rounded-xl p-3 space-y-3 border border-[#003F7C]/10 bg-[#003F7C]/[0.04]">
                {/* Preset buttons */}
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { preset: "sunrise" as TimePreset, icon: <Sunrise size={13} />, label: "Rise" },
                    { preset: "noon" as TimePreset, icon: <Sun size={13} />, label: "Noon" },
                    { preset: "sunset" as TimePreset, icon: <Sunset size={13} />, label: "Set" },
                    { preset: "night" as TimePreset, icon: <Moon size={13} />, label: "Night" },
                  ]).map(({ preset, icon, label }) => {
                    const presetHour = getPresetHour(preset);
                    const isActive = Math.abs(timeOfDayHour - presetHour) < 0.5;
                    return (
                      <button
                        key={preset}
                        onClick={() => setTimeOfDayHour(presetHour)}
                        style={{ fontFamily: "var(--font-archivo), Archivo, system-ui, sans-serif" }}
                        className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-md text-[9px] font-bold uppercase tracking-[0.06em] leading-none transition-all ${
                          isActive
                            ? "bg-[#003F7C] text-white shadow-[0_2px_8px_-2px_rgba(0,63,124,0.45)]"
                            : "bg-white/55 text-slate-600 border border-[#003F7C]/10 hover:bg-white/80 hover:text-slate-900 hover:border-[#003F7C]/20"
                        }`}
                      >
                        {icon}
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Time slider */}
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="ui-label">Time</span>
                    <span
                      style={{ fontFamily: "var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace" }}
                      className="text-[11px] font-bold text-slate-800 tabular-nums leading-none"
                    >
                      {formatHour(timeOfDayHour)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    step="0.25"
                    value={timeOfDayHour}
                    onChange={(e) => setTimeOfDayHour(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[#003F7C]/15 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#003F7C] [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,63,124,0.3)] [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                  />
                  <div
                    style={{ fontFamily: "var(--font-ibm-plex-mono), ui-monospace, SFMono-Regular, Menlo, monospace" }}
                    className="flex justify-between text-[8px] text-slate-400 mt-1.5 tracking-wide"
                  >
                    <span>12 AM</span>
                    <span>6 AM</span>
                    <span>12 PM</span>
                    <span>6 PM</span>
                    <span>12 AM</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Street View + Interior View Selectors */}
            <div className="mt-8 pt-6 border-t border-slate-900/10">
              <h3 className="ui-label mb-3">First-Person View</h3>
              {isStreetView ? (
                <button
                  onClick={() => {
                    setExitStreetViewTrigger((n) => n + 1);
                    setBuildingViewTarget(null);
                    setPickedBuildingForView(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-all bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
                >
                  <ArrowUp size={13} />
                  Exit View
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsStreetViewSelectionMode(!isStreetViewSelectionMode);
                      setIsBuildingViewSelectionMode(false);
                    }}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-all ${
                      isStreetViewSelectionMode
                        ? "bg-indigo-600 text-white"
                        : "bg-indigo-600/20 border border-indigo-400/30 hover:border-indigo-400/50 hover:bg-indigo-600/30 text-indigo-700"
                    }`}
                  >
                    <Eye size={13} />
                    {isStreetViewSelectionMode ? "Cancel Selection" : "Pick Street View Point"}
                  </button>
                  {isStreetViewSelectionMode && (
                    <p className="text-[9px] text-indigo-700/70 text-center mt-2">
                      Move mouse over the map · Click to enter street view
                    </p>
                  )}

                  <button
                    onClick={() => {
                      setIsBuildingViewSelectionMode(!isBuildingViewSelectionMode);
                      setIsStreetViewSelectionMode(false);
                      setPickedBuildingForView(null);
                    }}
                    className={`mt-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-all ${
                      isBuildingViewSelectionMode
                        ? "bg-purple-600 text-white"
                        : "bg-purple-600/20 border border-purple-400/30 hover:border-purple-400/50 hover:bg-purple-600/30 text-purple-700"
                    }`}
                  >
                    <Building2 size={13} />
                    {isBuildingViewSelectionMode
                      ? "Cancel Selection"
                      : pickedBuildingForView
                        ? "Pick Another Building"
                        : "View From a Building"}
                  </button>
                  {isBuildingViewSelectionMode && (
                    <p className="text-[9px] text-purple-700/70 text-center mt-2">
                      Click a building on the map to set up the interior view
                    </p>
                  )}

                  {pickedBuildingForView && !isBuildingViewSelectionMode && (() => {
                    const floors = Math.max(
                      1,
                      Math.floor(pickedBuildingForView.heightM / 3.5),
                    );
                    const floorHeightM =
                      buildingViewFloor === 1
                        ? 1.7 // eye height on the ground floor
                        : (buildingViewFloor - 1) * 3.5 + 1.7;
                    return (
                      <div className="mt-3 p-3 rounded-md border border-purple-300/40 bg-purple-50">
                        <p className="text-[9px] font-bold text-purple-800 uppercase tracking-wide mb-2">
                          {pickedBuildingForView.isHouse
                            ? "House view"
                            : "Building view"}
                          {" · "}
                          {Math.round(pickedBuildingForView.heightM)}m tall
                        </p>

                        {!pickedBuildingForView.isHouse && (
                          <div className="mb-3">
                            <label className="flex items-center justify-between text-[10px] font-bold text-slate-700 mb-1">
                              <span>Floor</span>
                              <span className="text-purple-700">
                                {buildingViewFloor === 1
                                  ? "Ground"
                                  : `Floor ${buildingViewFloor}`}{" "}
                                / {floors}
                              </span>
                            </label>
                            <input
                              type="range"
                              min={1}
                              max={floors}
                              step={1}
                              value={buildingViewFloor}
                              onChange={(e) =>
                                setBuildingViewFloor(parseInt(e.target.value, 10))
                              }
                              className="w-full accent-purple-600"
                            />
                          </div>
                        )}

                        <div className="mb-3">
                          <label className="text-[10px] font-bold text-slate-700 mb-1 block">
                            Wall facing
                          </label>
                          <div className="grid grid-cols-4 gap-1">
                            {[
                              { d: 0, l: "N" },
                              { d: 90, l: "E" },
                              { d: 180, l: "S" },
                              { d: 270, l: "W" },
                            ].map((opt) => (
                              <button
                                key={opt.d}
                                onClick={() => setBuildingViewFacingDeg(opt.d)}
                                className={`px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${
                                  buildingViewFacingDeg === opt.d
                                    ? "bg-purple-600 text-white"
                                    : "bg-white border border-slate-200 text-slate-700 hover:bg-purple-50"
                                }`}
                              >
                                {opt.l}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const dirKey = buildingViewFacingDeg as 0 | 90 | 180 | 270;
                            // Use the actual wall distance along the chosen
                            // direction, not the bounding-circle radius.
                            const wallOffsetM =
                              pickedBuildingForView.wallOffsetByDirM[dirKey] ??
                              pickedBuildingForView.radiusM;
                            setBuildingViewTarget({
                              worldX: pickedBuildingForView.worldX,
                              worldZ: pickedBuildingForView.worldZ,
                              floorHeightM,
                              facingDeg: buildingViewFacingDeg,
                              footprintRadiusM: wallOffsetM,
                              id: Date.now(),
                            });
                          }}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded text-[11px] font-bold uppercase tracking-tight bg-purple-600 text-white hover:bg-purple-700 transition-colors"
                        >
                          <Eye size={12} />
                          Show View From Wall
                        </button>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </aside>

        {/* RIGHT SIDEBAR: METRIC ANALYSIS — also suppressed during venue
            selection so we don't show drainage / demographics analyses for a
            site that isn't locked in yet. */}
        {!inSelectionPipeline && !rightSidebarOpen && (
          <button
            onClick={() => setRightSidebarOpen(true)}
            className="absolute right-6 top-6 pointer-events-auto w-10 h-10 glass rounded-lg flex items-center justify-center hover:bg-slate-900/10 transition-colors"
          >
            <ChevronLeft size={18} className="text-slate-700" />
          </button>
        )}
        <aside
          className={`absolute right-6 top-6 w-80 pointer-events-auto sidebar-transition ${placedBuildings.length > 0 ? "bottom-30" : "bottom-6"} ${!rightSidebarOpen || inSelectionPipeline ? "hidden" : ""}`}
        >
          <div data-ask-scope="metric-analysis" data-ask-title="Metric Analysis" className="glass rounded-lg p-5 h-full overflow-y-auto custom-scrollbar">

            {/* ── INLINE ANALYSIS PANELS ── */}
            {/* When an analysis panel is active, it replaces the normal sidebar content */}
            {showDemographicsPanel ? (
              <DemographicsPanel
                visible={showDemographicsPanel}
                onClose={() => setShowDemographicsPanel(false)}
                buildings={analysisBuildings}
              />
            ) : showZoningPanel ? (
              <ZoningPermitsPanel
                visible={showZoningPanel}
                onClose={() => setShowZoningPanel(false)}
                buildings={analysisBuildings}
              />
            ) : showGrantsPanel ? (
              <GrantsPanel
                visible={showGrantsPanel}
                onClose={() => setShowGrantsPanel(false)}
                buildings={analysisBuildings}
              />
            ) : showCompetitorPanel ? (
              <CompetitorPanel
                visible={showCompetitorPanel}
                onClose={() => setShowCompetitorPanel(false)}
                buildings={analysisBuildings}
                radius={competitorRadius}
                onRadiusChange={setCompetitorRadius}
                onMarkersChange={setCompetitorMarkers}
              />
            ) : showTrafficImpact ? (
              <TrafficImpactPanel
                impactResult={trafficImpactResult}
                visible={true}
                onClose={() => setShowTrafficImpact(false)}
                isBarricadeMode={isBarricadeMode}
                onBarricadeModeToggle={() => setIsBarricadeMode(!isBarricadeMode)}
                barricadedEdgeIds={barricadedEdgeIds}
                onRemoveBarricade={(edgeId) => {
                  setBarricadedEdgeIds((prev) => {
                    const next = new Set(prev);
                    next.delete(edgeId);
                    next.delete(edgeId + "-reverse");
                    return next;
                  });
                }}
                useRealTrafficData={useRealTrafficData}
                mapboxDataTimestamp={mapboxDataTimestamp}
                isLoadingMapbox={isLoadingMapbox}
                onFetchMapboxData={handleFetchMapboxData}
                siteAnchor={
                  analysisAnchor
                    ? { lat: analysisAnchor.lat, lng: analysisAnchor.lng }
                    : placedBuildings[placedBuildings.length - 1]
                      ? {
                          lat: placedBuildings[placedBuildings.length - 1].lat,
                          lng: placedBuildings[placedBuildings.length - 1].lng,
                        }
                      : null
                }
                roadNetwork={roadNetworkRef.current}
              />
            ) : (<>

            {/* ── NORMAL SIDEBAR CONTENT ── */}
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-900/10">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <FileText className="text-slate-500" size={20} />
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                    Metric Analysis
                  </h2>
                </div>
                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                  As of{" "}
                  {new Date(timelineDate).toLocaleDateString("en-US", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {buildingsActiveAtTimeline.length > 0 && (
                    <span className="ml-1">
                      · {buildingsActiveAtTimeline.length} active site
                      {buildingsActiveAtTimeline.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setRightSidebarOpen(false)}
                className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-900/10 transition-colors"
              >
                <ChevronRight size={16} className="text-slate-500" />
              </button>
            </div>

            {/* Always-visible affordance to jump back to the business-plan
                wizard. The metrics below are derived from activePlan via
                computePlanMetrics — editing the plan and returning here will
                regenerate Total Project Cost / Lease / Fit-out automatically
                because the localStorage read effect re-fires on remount. */}
            {activePlan && (
              <div className="mb-4 rounded-md border border-blue-400/30 bg-blue-50/80 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-blue-700">
                      From your business plan
                    </p>
                    <p className="text-[11px] font-semibold text-slate-800 truncate">
                      {activePlan.concept.name?.trim() ||
                        `Plan ${activePlan.id}`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const qs = activePlan.buildingId
                        ? `?buildingId=${activePlan.buildingId}`
                        : "";
                      router.push(`/plan/${activePlan.id}${qs}`);
                    }}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wide bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    <Pencil size={11} />
                    Edit plan
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 mt-1.5 leading-snug">
                  Changing inputs there will update the projections below the
                  next time you open this map.
                </p>
              </div>
            )}

            {/* Financial Metrics — strategy-aware. New-build folds plan
                capital (fit-out) into Construction; move-in replaces Land
                with annual Lease and Construction with plan-capital Fit-out;
                Total adds first-year operating cost on top. */}
            <div data-ask-scope="financials" data-ask-title="Financial Metrics" className="grid grid-cols-1 gap-3 mb-6">
              {(() => {
                const hasBuildings = placedBuildings.length > 0;
                const hasValues = hasBuildings || planCosts !== null;
                const modes = buildingFinancials.modeCount;
                return (
                  <>
                    <div
                      className={`rounded-md p-3 border ${hasValues ? "bg-emerald-500/10 border-emerald-400/20" : "bg-slate-900/5 border-slate-900/10"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <DollarSign
                          size={14}
                          className={hasValues ? "text-emerald-500" : "text-slate-400"}
                        />
                        <p className="ui-label">Total Project Cost</p>
                      </div>
                      <p
                        className={`text-lg font-bold font-serif ${hasValues ? "text-emerald-700" : "text-slate-400"}`}
                      >
                        {formatCurrency(strategyCosts.totalProjectCost)}
                        <span className="text-[10px] text-slate-400 font-sans uppercase ml-1">
                          CAD
                        </span>
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">
                        {hasValues
                          ? strategyCosts.totalSub
                          : "Place a building to estimate cost"}
                      </p>
                    </div>
                    <div
                      className={`rounded-md p-3 border ${hasValues ? "bg-blue-500/10 border-blue-400/20" : "bg-slate-900/5 border-slate-900/10"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Landmark
                          size={14}
                          className={hasValues ? "text-blue-500" : "text-slate-400"}
                        />
                        <p className="ui-label">
                          {strategyCosts.acquisitionLabel}
                        </p>
                      </div>
                      <p
                        className={`text-lg font-bold font-serif ${hasValues ? "text-blue-700" : "text-slate-400"}`}
                      >
                        {formatCurrency(strategyCosts.acquisition)}
                        <span className="text-[10px] text-slate-400 font-sans uppercase ml-1">
                          CAD
                        </span>
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">
                        {strategyCosts.acquisitionSub}
                      </p>
                    </div>
                    <div
                      className={`rounded-md p-3 border ${hasValues ? "bg-orange-500/10 border-orange-400/20" : "bg-slate-900/5 border-slate-900/10"}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Hammer
                          size={14}
                          className={hasValues ? "text-orange-500" : "text-slate-400"}
                        />
                        <p className="ui-label">{strategyCosts.buildLabel}</p>
                      </div>
                      <p
                        className={`text-lg font-bold font-serif ${hasValues ? "text-orange-700" : "text-slate-400"}`}
                      >
                        {formatCurrency(strategyCosts.build)}
                        <span className="text-[10px] text-slate-400 font-sans uppercase ml-1">
                          CAD
                        </span>
                      </p>
                      <p className="text-[9px] text-slate-400 mt-1">
                        {strategyCosts.buildSub}
                      </p>
                    </div>

                    {/* Mode breakdown chips */}
                    {hasBuildings && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(Object.keys(modes) as BuildMode[]).map((m) => (
                          <span
                            key={m}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900/5 border border-slate-900/10 text-[9px] font-bold text-slate-600 uppercase"
                          >
                            {m === "new-build" && <Building2 size={10} />}
                            {m === "demolish-rebuild" && <Hammer size={10} />}
                            {m === "move-in" && <Store size={10} />}
                            {BUILD_MODE_LABELS[m]} · {modes[m]}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Analysis Panels */}
            <div className="space-y-4 text-xs">
              <div className="pt-6 mt-6 border-t border-slate-900/10">
                <button
                  onClick={() => {
                    const next = !showDemographicsPanel;
                    setShowDemographicsPanel(next);
                    if (next) {
                      setShowCompetitorPanel(false);
                      setShowTrafficImpact(false);
                      setShowZoningPanel(false);
                      setShowGrantsPanel(false);
                    }
                  }}
                  disabled={analysisBuildings.length === 0}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all ${
                    showDemographicsPanel
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                      : analysisBuildings.length > 0
                      ? "bg-blue-600/20 border border-blue-400/30 hover:border-blue-400/50 hover:bg-blue-600/30 text-blue-700"
                      : "bg-slate-900/5 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <Users size={18} />
                  <span>Demographic</span>
                </button>
                <button
                  onClick={() => {
                    const next = !showCompetitorPanel;
                    setShowCompetitorPanel(next);
                    if (next) {
                      setShowDemographicsPanel(false);
                      setShowTrafficImpact(false);
                      setShowZoningPanel(false);
                      setShowGrantsPanel(false);
                    }
                  }}
                  disabled={analysisBuildings.length === 0}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all mt-3 ${
                    showCompetitorPanel
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
                      : analysisBuildings.length > 0
                      ? "bg-indigo-600/20 border border-indigo-400/30 hover:border-indigo-400/50 hover:bg-indigo-600/30 text-indigo-700"
                      : "bg-slate-900/5 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <Store size={18} />
                  <span>Competitor Analysis</span>
                </button>
                <button
                  onClick={() => {
                    const next = !showTrafficImpact;
                    setShowTrafficImpact(next);
                    if (next) {
                      setShowDemographicsPanel(false);
                      setShowCompetitorPanel(false);
                      setShowZoningPanel(false);
                      setShowGrantsPanel(false);
                    }
                  }}
                  disabled={analysisBuildings.length === 0}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all mt-3 ${
                    showTrafficImpact
                      ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md"
                      : analysisBuildings.length > 0
                      ? "bg-orange-600/20 border border-orange-400/30 hover:border-orange-400/50 hover:bg-orange-600/30 text-orange-700"
                      : "bg-slate-900/5 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <Car size={18} />
                  <span>Foot &amp; Vehicle Traffic</span>
                </button>

                <button
                  onClick={() => {
                    const next = !showZoningPanel;
                    setShowZoningPanel(next);
                    if (next) {
                      setShowDemographicsPanel(false);
                      setShowCompetitorPanel(false);
                      setShowTrafficImpact(false);
                      setShowGrantsPanel(false);
                    }
                  }}
                  disabled={analysisBuildings.length === 0}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all mt-3 ${
                    showZoningPanel
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                      : analysisBuildings.length > 0
                      ? "bg-emerald-600/20 border border-emerald-400/30 hover:border-emerald-400/50 hover:bg-emerald-600/30 text-emerald-700"
                      : "bg-slate-900/5 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <ShieldAlert size={18} />
                  <span>Zoning &amp; Permits</span>
                </button>

                <button
                  onClick={() => {
                    const next = !showGrantsPanel;
                    setShowGrantsPanel(next);
                    if (next) {
                      setShowDemographicsPanel(false);
                      setShowCompetitorPanel(false);
                      setShowTrafficImpact(false);
                      setShowZoningPanel(false);
                    }
                  }}
                  disabled={analysisBuildings.length === 0}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-black uppercase tracking-tight transition-all mt-3 ${
                    showGrantsPanel
                      ? "bg-amber-600 hover:bg-amber-700 text-white shadow-md"
                      : analysisBuildings.length > 0
                      ? "bg-amber-600/20 border border-amber-400/30 hover:border-amber-400/50 hover:bg-amber-600/30 text-amber-700"
                      : "bg-slate-900/5 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  <Coins size={18} />
                  <span>Grants &amp; Funding</span>
                </button>

              </div>

              {/* Placed Buildings — pipeline mode and model selection live on /start now */}
              <div className="pt-6 mt-6 border-t border-slate-900/10">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="ui-label">Placed Buildings ({placedBuildings.length})</h3>
                  <Link
                    href="/start"
                    className="text-[9px] font-black uppercase tracking-tight px-2 py-1 rounded bg-indigo-500/15 text-indigo-700 hover:bg-indigo-500/25 transition-colors"
                  >
                    + Add another
                  </Link>
                </div>

                <div className="rounded-md p-3 border bg-slate-900/5 border-slate-900/10 space-y-3">
                  <div>
                    {placedBuildings.length === 0 ? (
                      <Link
                        href="/start"
                        className="block text-[10px] text-slate-500 text-center py-3 bg-slate-900/5 rounded border border-dashed border-slate-900/10 hover:border-slate-900/20 hover:text-slate-700 transition-colors"
                      >
                        Start a new business on /start to place a building
                      </Link>
                    ) : (
                      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                        {placedBuildings.map((building) => {
                          const fin = buildingFinancials.breakdown.find(
                            (f) => f.id === building.id,
                          );
                          const mode = building.buildMode ?? "new-build";
                          const modeColor =
                            mode === "new-build"
                              ? "text-blue-600 bg-blue-500/10"
                              : mode === "demolish-rebuild"
                                ? "text-orange-600 bg-orange-500/10"
                                : "text-emerald-600 bg-emerald-500/10";
                          return (
                          <div
                            key={building.id}
                            onClick={() => setSelectedBuildingId(building.id)}
                            className={`flex items-center justify-between rounded p-2 border cursor-pointer transition-all ${
                              selectedBuildingId === building.id
                                ? "border-blue-400/30 bg-blue-500/10"
                                : "border-slate-900/10 hover:border-slate-900/20 bg-slate-900/5"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p
                                className={`text-[10px] font-bold truncate ${
                                  selectedBuildingId === building.id
                                    ? "text-accent-blue"
                                    : "text-slate-800"
                                }`}
                              >
                                {building.timeline?.zoneType
                                  ? `${building.timeline.zoneType} – ${building.lat.toFixed(4)}°`
                                  : `${building.lat.toFixed(5)}°, ${building.lng.toFixed(5)}°`}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tight ${modeColor}`}>
                                  {BUILD_MODE_LABELS[mode]}
                                </span>
                                {fin && (
                                  <span className="text-[8px] font-mono font-bold text-slate-600">
                                    {formatCurrency(fin.total)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openBusinessPlan(building);
                                }}
                                title={
                                  building.businessPlanId != null
                                    ? `Open business plan #${building.businessPlanId}`
                                    : `Add business plan #${nextBusinessIdPreview}`
                                }
                                className="flex items-center gap-1 px-1.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-700 hover:text-emerald-600 transition-colors"
                              >
                                <Briefcase size={11} />
                                <span className="text-[9px] font-mono font-bold">
                                  #{building.businessPlanId ?? nextBusinessIdPreview}
                                </span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeBuilding(building.id);
                                }}
                                className="p-1 hover:bg-red-500/20 rounded transition-colors text-slate-500 hover:text-red-400"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Reasonableness Review (LLM-backed) */}
              <div className="pt-6 mt-6 border-t border-slate-900/10">
                <ReasonablenessPanel
                  enabled={placedBuildings.length > 0}
                  payloadBuilder={buildReasonablenessPayload}
                />
              </div>

              {/* Business Plans Registry */}
              {(() => {
                const osmPlans = registryRefreshTick >= 0 ? listOsmPlans() : [];
                const hasAny = osmPlans.length > 0 || placedBuildings.some((b) => b.businessPlanId != null);
                if (!hasAny) return null;
                return (
                  <div className="pt-6 mt-6 border-t border-slate-900/10">
                    <h3 className="ui-label text-emerald-700 mb-3">
                      Business Plans ({osmPlans.length + placedBuildings.filter((b) => b.businessPlanId != null).length})
                    </h3>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                      {/* Placed-building plans */}
                      {placedBuildings
                        .filter((b) => b.businessPlanId != null)
                        .map((b) => (
                          <div
                            key={`placed-${b.id}`}
                            className="flex items-center gap-2 rounded p-2 border border-slate-900/10 bg-slate-900/5 hover:border-emerald-400/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-800 truncate">
                                Plan #{b.businessPlanId} · Placed
                              </p>
                              <p className="text-[8px] text-slate-400 truncate">
                                {b.lat.toFixed(5)}°, {b.lng.toFixed(5)}°
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                setFlyToTarget({ lngLat: [b.lng, b.lat], id: Date.now() })
                              }
                              title="Go to building"
                              className="p-1 rounded hover:bg-blue-500/20 text-blue-700 transition-colors"
                            >
                              <MapPin size={11} />
                            </button>
                            <button
                              onClick={() =>
                                router.push(`/plan/business-${b.businessPlanId}?buildingId=${b.id}`)
                              }
                              title="Open business plan"
                              className="p-1 rounded hover:bg-emerald-500/20 text-emerald-700 transition-colors"
                            >
                              <Briefcase size={11} />
                            </button>
                          </div>
                        ))}
                      {/* OSM-cluster plans */}
                      {osmPlans.map((entry) => {
                        const cluster = osmClusterIndex?.clusterById.get(entry.osmBuildingId);
                        const lngLat = cluster?.center;
                        const partsLabel = cluster && cluster.buildingIds.length > 1
                          ? ` · ${cluster.buildingIds.length} parts`
                          : "";
                        return (
                          <div
                            key={`osm-${entry.osmBuildingId}`}
                            className="flex items-center gap-2 rounded p-2 border border-slate-900/10 bg-slate-900/5 hover:border-emerald-400/30 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-800 truncate">
                                Plan #{entry.planId} · Existing{partsLabel}
                              </p>
                              <p className="text-[8px] text-slate-400 truncate">
                                {lngLat
                                  ? `${lngLat[1].toFixed(5)}°, ${lngLat[0].toFixed(5)}°`
                                  : entry.osmBuildingId}
                              </p>
                            </div>
                            <button
                              onClick={() =>
                                lngLat && setFlyToTarget({ lngLat, id: Date.now() })
                              }
                              disabled={!lngLat}
                              title="Go to building"
                              className="p-1 rounded hover:bg-blue-500/20 text-blue-700 disabled:opacity-30 transition-colors"
                            >
                              <MapPin size={11} />
                            </button>
                            <button
                              onClick={() =>
                                router.push(`/plan/business-${entry.planId}?osmBuildingId=${encodeURIComponent(entry.osmBuildingId)}`)
                              }
                              title="Open business plan"
                              className="p-1 rounded hover:bg-emerald-500/20 text-emerald-700 transition-colors"
                            >
                              <Briefcase size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Selected Building Transform Controls */}
              {selectedBuilding && (
                <div className="pt-6 mt-6 border-t border-slate-900/10">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="ui-label text-accent-blue">
                      Selected Building Transform
                    </h3>
                    <button
                      onClick={() => setSelectedBuildingId(null)}
                      className="p-1 hover:bg-slate-900/10 rounded transition-colors text-slate-500"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* View from Street button */}
                  <button
                    onClick={() => {
                      if (selectedBuilding) {
                        setStreetViewTarget({
                          worldX: selectedBuilding.position.x,
                          worldZ: selectedBuilding.position.z,
                          id: Date.now(),
                        });
                      }
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 mb-3 rounded-lg text-xs font-bold uppercase tracking-tight transition-all bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg"
                  >
                    <Eye size={14} />
                    <span>View from Street</span>
                  </button>

                  <div className="bg-blue-50 rounded-md p-3 border border-accent-blue space-y-3">
                    {/* Position Controls */}
                    <div>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">
                        Position (Arrow Keys)
                      </p>
                      <div className="space-y-2.5 text-[10px]">
                        {/* X Position */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">X</label>
                            <input
                              type="number"
                              value={selectedBuilding.position.x.toFixed(1)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  position: {
                                    ...selectedBuilding.position,
                                    x: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="1"
                            />
                          </div>
                          <input
                            type="range"
                            min={selectedBuilding.position.x - 50}
                            max={selectedBuilding.position.x + 50}
                            step="0.5"
                            value={selectedBuilding.position.x}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                position: {
                                  ...selectedBuilding.position,
                                  x: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>

                        {/* Y Position */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">Y</label>
                            <input
                              type="number"
                              value={selectedBuilding.position.y.toFixed(1)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  position: {
                                    ...selectedBuilding.position,
                                    y: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="1"
                            />
                          </div>
                          <input
                            type="range"
                            min={selectedBuilding.position.y - 20}
                            max={selectedBuilding.position.y + 20}
                            step="0.5"
                            value={selectedBuilding.position.y}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                position: {
                                  ...selectedBuilding.position,
                                  y: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>

                        {/* Z Position */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">Z</label>
                            <input
                              type="number"
                              value={selectedBuilding.position.z.toFixed(1)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  position: {
                                    ...selectedBuilding.position,
                                    z: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="1"
                            />
                          </div>
                          <input
                            type="range"
                            min={selectedBuilding.position.z - 50}
                            max={selectedBuilding.position.z + 50}
                            step="0.5"
                            value={selectedBuilding.position.z}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                position: {
                                  ...selectedBuilding.position,
                                  z: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Rotation Controls */}
                    <div className="pt-2 border-t border-blue-200">
                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">
                        Rotation (R Key)
                      </p>
                      <div className="space-y-2.5 text-[10px]">
                        {/* X Rotation */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">X (deg)</label>
                            <input
                              type="number"
                              value={(
                                (selectedBuilding.rotation.x * 180) /
                                Math.PI
                              ).toFixed(1)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  rotation: {
                                    ...selectedBuilding.rotation,
                                    x:
                                      ((parseFloat(e.target.value) || 0) *
                                        Math.PI) /
                                      180,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="5"
                            />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="5"
                            value={
                              (selectedBuilding.rotation.x * 180) / Math.PI
                            }
                            onChange={(e) =>
                              updateSelectedBuilding({
                                rotation: {
                                  ...selectedBuilding.rotation,
                                  x:
                                    (parseFloat(e.target.value) * Math.PI) /
                                    180,
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>

                        {/* Y Rotation */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">Y (deg)</label>
                            <input
                              type="number"
                              value={(
                                (selectedBuilding.rotation.y * 180) /
                                Math.PI
                              ).toFixed(1)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  rotation: {
                                    ...selectedBuilding.rotation,
                                    y:
                                      ((parseFloat(e.target.value) || 0) *
                                        Math.PI) /
                                      180,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="5"
                            />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="5"
                            value={
                              (selectedBuilding.rotation.y * 180) / Math.PI
                            }
                            onChange={(e) =>
                              updateSelectedBuilding({
                                rotation: {
                                  ...selectedBuilding.rotation,
                                  y:
                                    (parseFloat(e.target.value) * Math.PI) /
                                    180,
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>

                        {/* Z Rotation */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">Z (deg)</label>
                            <input
                              type="number"
                              value={(
                                (selectedBuilding.rotation.z * 180) /
                                Math.PI
                              ).toFixed(1)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  rotation: {
                                    ...selectedBuilding.rotation,
                                    z:
                                      ((parseFloat(e.target.value) || 0) *
                                        Math.PI) /
                                      180,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="5"
                            />
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="360"
                            step="5"
                            value={
                              (selectedBuilding.rotation.z * 180) / Math.PI
                            }
                            onChange={(e) =>
                              updateSelectedBuilding({
                                rotation: {
                                  ...selectedBuilding.rotation,
                                  z:
                                    (parseFloat(e.target.value) * Math.PI) /
                                    180,
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Scale Controls */}
                    <div className="pt-2 border-t border-blue-200">
                      <p className="text-[9px] font-bold text-slate-500 uppercase mb-2">
                        Scale (S Key)
                      </p>
                      <div className="space-y-2.5 text-[10px]">
                        {/* X Scale */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">X</label>
                            <input
                              type="number"
                              value={selectedBuilding.scale.x.toFixed(2)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  scale: {
                                    ...selectedBuilding.scale,
                                    x: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="0.5"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="30"
                            step="0.5"
                            value={selectedBuilding.scale.x}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                scale: {
                                  ...selectedBuilding.scale,
                                  x: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>

                        {/* Y Scale */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">Y</label>
                            <input
                              type="number"
                              value={selectedBuilding.scale.y.toFixed(2)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  scale: {
                                    ...selectedBuilding.scale,
                                    y: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="0.5"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="30"
                            step="0.5"
                            value={selectedBuilding.scale.y}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                scale: {
                                  ...selectedBuilding.scale,
                                  y: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>

                        {/* Z Scale */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500">Z</label>
                            <input
                              type="number"
                              value={selectedBuilding.scale.z.toFixed(2)}
                              onChange={(e) =>
                                updateSelectedBuilding({
                                  scale: {
                                    ...selectedBuilding.scale,
                                    z: parseFloat(e.target.value) || 0,
                                  },
                                })
                              }
                              className="w-20 px-2 py-1 text-[10px] font-mono text-slate-800 bg-slate-900/5 border border-slate-900/10 rounded text-right"
                              step="0.5"
                            />
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="30"
                            step="0.5"
                            value={selectedBuilding.scale.z}
                            onChange={(e) =>
                              updateSelectedBuilding({
                                scale: {
                                  ...selectedBuilding.scale,
                                  z: parseFloat(e.target.value),
                                },
                              })
                            }
                            className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-10 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Keyboard Hints */}
                    <div className="pt-2 border-t border-blue-400/20 text-[9px] text-slate-500">
                      <p className="font-bold mb-1">Keyboard Controls:</p>
                      <div className="space-y-0.5">
                        <p>← → : Move X • ↑ ↓ : Move Z</p>
                        <p>PgUp/Dn : Move Y</p>
                        <p>R : Rotate Y • Shift+R : Rotate faster</p>
                        <p>S : Scale up • Shift+S : Scale down</p>
                      </div>
                    </div>

                    {/* Add / open business plan */}
                    <div className="pt-2 border-t border-blue-200">
                      <button
                        onClick={() => openBusinessPlan(selectedBuilding)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded text-[10px] font-bold uppercase tracking-tight transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                      >
                        <span className="flex items-center gap-2">
                          <Briefcase size={12} />
                          {selectedBuilding.businessPlanId != null
                            ? "Open business plan"
                            : "Add business plan"}
                        </span>
                        <span className="font-mono opacity-80">
                          #{selectedBuilding.businessPlanId ?? nextBusinessIdPreview}
                        </span>
                      </button>
                    </div>

                    {/* Delete button */}
                    <div className="pt-2">
                      <button
                        onClick={() => removeBuilding(selectedBuilding.id)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 border border-red-200 hover:bg-red-100 rounded text-[10px] font-bold text-red-700 transition-colors uppercase"
                      >
                        <Trash2 size={12} />
                        Delete Building
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Fly to Downtown */}
            <div className="mt-4 pt-4 border-t border-slate-900/10">
              <button
                onClick={() =>
                  setFlyToTarget({ lngLat: [-79.3800, 43.6500], id: Date.now() })
                }
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-accent-blue/20 border border-accent-blue/30 hover:bg-accent-blue/30 hover:border-accent-blue/50 transition-colors text-accent-blue"
                title="Fly to 43.6500°, -79.3800°"
              >
                <Navigation size={14} />
                <span className="text-[11px] font-black uppercase tracking-tight">Fly to Downtown</span>
              </button>
            </div>
            </>)}
          </div>
        </aside>
      </div>

      {/* FIXED BOTTOM PANEL: INTEGRATED TIMELINE - only show when at least one building is placed */}
      {placedBuildings.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 z-50 glass border-t border-slate-900/10 px-8 py-4 flex items-center gap-10 shadow-lg">
          {/* Simulation Controls */}
          <div className="flex items-center gap-4 shrink-0 border-r border-slate-900/10 pr-10">
            <button
              onClick={() => setIsTimelinePlaying((p) => !p)}
              className={`w-10 h-10 rounded flex items-center justify-center transition-colors shadow-sm ${
                isTimelinePlaying
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-accent-blue text-white hover:opacity-90"
              }`}
              title={isTimelinePlaying ? "Pause" : "Play timeline"}
            >
              {isTimelinePlaying ? (
                <Pause size={20} />
              ) : (
                <PlayCircle size={20} />
              )}
            </button>
            <div>
              <p className="text-xs font-black text-slate-900 uppercase tracking-tight font-serif">
                Construction Timeline
              </p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                View building progress
              </p>
            </div>
          </div>

          {/* Timeline Slider - week-based, dynamic range */}
          <div className="flex-1 flex flex-col gap-3">
            {(() => {
              const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
              const minT = timelineRange.minDate.getTime();
              const maxT = timelineRange.maxDate.getTime();
              const rangeMs = maxT - minT || 1;
              const currentVal = new Date(timelineDate).getTime();
              const clampedVal = Math.max(minT, Math.min(maxT, currentVal));
              const pct = ((clampedVal - minT) / rangeMs) * 100;

              const weekCount = Math.ceil(rangeMs / WEEK_MS);
              const tickStep = Math.max(1, Math.floor(weekCount / 8));
              const ticks: { t: number; label: string }[] = [];
              for (let i = 0; i <= weekCount; i += tickStep) {
                const t = minT + i * WEEK_MS;
                if (t <= maxT) {
                  const d = new Date(t);
                  ticks.push({
                    t,
                    label: `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`,
                  });
                }
              }
              if (ticks[ticks.length - 1]?.t !== maxT) {
                const d = new Date(maxT);
                ticks.push({
                  t: maxT,
                  label: `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`,
                });
              }

              return (
                <>
                  <div className="relative">
                    <input
                      type="range"
                      min={minT}
                      max={maxT}
                      step={WEEK_MS}
                      value={clampedVal}
                      onChange={(e) => {
                        const t = parseInt(e.target.value, 10);
                        setTimelineDate(new Date(t).toISOString().slice(0, 10));
                      }}
                      className="w-full h-3 bg-slate-900/8 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-blue [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-300 [&::-webkit-slider-thumb]:cursor-grab"
                      style={{
                        background: `linear-gradient(to right, #003F7C 0%, #003F7C ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
                      }}
                    />
                    <div className="absolute top-6 left-0 right-0 h-4 pointer-events-none">
                      {ticks.map(({ t, label }) => {
                        const tickPct = ((t - minT) / rangeMs) * 100;
                        return (
                          <span
                            key={t}
                            className="absolute text-[8px] text-slate-400 font-mono whitespace-nowrap"
                            style={{
                              left: `calc(${tickPct}% - 1px)`,
                              transform: "translateX(-50%)",
                            }}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-between px-0.5 text-[8px] text-slate-400 font-bold uppercase">
                    <span>Wk 1</span>
                    <span>Week {weekCount}</span>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Timestamp & Settings */}
          <div className="flex items-center gap-4 shrink-0 border-l border-slate-900/10 pl-10">
            <div className="flex flex-col items-end">
              <span className="ui-label mb-1">Active Timestamp</span>
              <div className="flex items-center gap-2 bg-slate-900/5 px-3 py-1.5 rounded border border-slate-900/10">
                <Clock className="text-slate-400" size={14} />
                <span className="text-[10px] font-black text-slate-700 uppercase">
                  {new Date(timelineDate)
                    .toLocaleDateString("en-US", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                    .toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10);
                  if (today >= minDateStr && today <= maxDateStr) {
                    setTimelineDate(today);
                  } else {
                    setTimelineDate(minDateStr);
                  }
                }}
                className="text-[9px] font-bold text-accent-blue border border-accent-blue px-2 py-1 rounded hover:bg-blue-50 transition-colors uppercase"
                title="Go to today, or start of project if today is outside range"
              >
                Today
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </HighlightAskProvider>
  );
}

// Wrap with Suspense for useSearchParams
export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-slate-100 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-accent-blue border-r-transparent mb-4" />
            <p className="text-slate-500">Loading map...</p>
          </div>
        </div>
      }
    >
      <MapPageContent />
    </Suspense>
  );
}
