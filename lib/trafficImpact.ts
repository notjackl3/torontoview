/**
 * Traffic Impact Analysis Module
 *
 * Trip generation using ITE Trip Generation Manual rates,
 * traffic density comparison, and congestion detection.
 */

import * as turf from "@turf/turf";
import { RoadNetwork, RoadEdge, RoadNode } from "./roadNetwork";
import { Pathfinder } from "./pathfinding";
import { TorontoZoneCode } from "./torontoZoning";

// ─── ITE Trip Generation Rates ───────────────────────────────────────────────

/**
 * ITE Trip Generation rates by land use category.
 * Rates expressed as daily vehicle trips per unit.
 */
export interface ITETripRate {
  label: string;
  /** Trips per unit per day */
  rate: number;
  /** What constitutes one "unit" */
  unitType: "dwelling_unit" | "1000_sqft" | "room" | "seat";
  /** Peak-hour fraction of daily trips (AM + PM peaks) */
  peakHourFraction: number;
}

const ITE_TRIP_RATES: Record<string, ITETripRate> = {
  residential: {
    label: "Residential (Single-Family)",
    rate: 9.44,
    unitType: "dwelling_unit",
    peakHourFraction: 0.10,
  },
  apartment: {
    label: "Apartment / Multi-Family",
    rate: 6.65,
    unitType: "dwelling_unit",
    peakHourFraction: 0.10,
  },
  office: {
    label: "General Office",
    rate: 10.84,
    unitType: "1000_sqft",
    peakHourFraction: 0.15,
  },
  retail: {
    label: "Retail / Shopping",
    rate: 37.75,
    unitType: "1000_sqft",
    peakHourFraction: 0.10,
  },
  industrial: {
    label: "Industrial / Warehouse",
    rate: 3.89,
    unitType: "1000_sqft",
    peakHourFraction: 0.12,
  },
  institutional: {
    label: "Institutional / School",
    rate: 12.89,
    unitType: "1000_sqft",
    peakHourFraction: 0.20,
  },
  hotel: {
    label: "Hotel",
    rate: 8.36,
    unitType: "room",
    peakHourFraction: 0.08,
  },
  mixed_use: {
    label: "Mixed Use",
    rate: 7.50,
    unitType: "1000_sqft",
    peakHourFraction: 0.12,
  },
};

/** Map Toronto zoning codes to ITE land use categories */
function zoneToLandUse(zoneCode: string): string {
  if (zoneCode.startsWith("UR") && !zoneCode.startsWith("URM")) return "residential";
  if (zoneCode.startsWith("URM")) return "apartment";
  if (zoneCode.startsWith("RU") || zoneCode.startsWith("LSR") || zoneCode === "HAM") return "residential";
  if (zoneCode.startsWith("M") && !zoneCode.startsWith("MU") && !zoneCode.startsWith("MX")) return "industrial";
  if (zoneCode.startsWith("MU") || zoneCode.startsWith("WM") || zoneCode.startsWith("DT")) return "mixed_use";
  if (zoneCode.startsWith("C") && zoneCode !== "CR") return "retail";
  if (zoneCode === "CR") return "retail";
  if (zoneCode.startsWith("IN") || zoneCode.startsWith("G")) return "institutional";
  if (zoneCode === "HB" || zoneCode === "CW") return "retail";
  return "mixed_use";
}

// ─── Building Trip Generation ────────────────────────────────────────────────

export interface BuildingTripGeneration {
  buildingId: string;
  zoneCode: string;
  landUse: string;
  iteRate: ITETripRate;
  units: number;
  dailyTrips: number;
  peakHourTrips: number;
  position: [number, number]; // [lng, lat]
}

export interface TrafficImpactResult {
  buildings: BuildingTripGeneration[];
  totalDailyTrips: number;
  totalPeakHourTrips: number;
  /** Edge ID → { before, after, delta, level } */
  edgeImpact: Map<string, EdgeImpact>;
  /** Intersection node IDs that become congested */
  congestedIntersections: string[];
  /** Maximum radius (meters) used for trip distribution / gradient rendering */
  maxImpactRadius: number;
}

export interface EdgeImpact {
  edgeId: string;
  edgeName?: string;
  /** Baseline vehicle count on this edge per hour */
  before: number;
  /** Projected vehicle count after new development */
  after: number;
  /** Absolute increase */
  delta: number;
  /** Congestion level 0-1 (0=free flow, 1=gridlock) */
  level: number;
  /** Level of Service grade A-F */
  los: string;
  /** Minimum distance (meters) from this edge to the nearest source building */
  distanceFromSource: number;
}

/** Mapbox congestion data for a single edge */
export interface MapboxCongestion {
  level: "low" | "moderate" | "heavy" | "severe";
  speed?: number;
}

/**
 * Estimate number of units for a building based on its scale/footprint.
 * For residential: assumes ~80 sqm per unit (studio/1BR apartment).
 * For office/retail: assumes 1 unit = 1000 sqft for ITE rate.
 */
export function estimateUnits(
  zoneCode: string,
  buildingScale: { x: number; y: number; z: number },
): number {
  const landUse = zoneToLandUse(zoneCode);
  const rate = ITE_TRIP_RATES[landUse];

  // Approximate building footprint in real-world meters from scale
  // Scale is applied to the GLTF model; typical model base is ~5m × 5m
  const S = 10 / 1.4; // map scale factor
  const footprintM2 = (buildingScale.x * 5 / S) * (buildingScale.z * 5 / S);
  const floors = Math.max(1, Math.round(buildingScale.y * 5 / S / 3.5)); // ~3.5m per floor
  const totalAreaM2 = footprintM2 * floors;
  const totalAreaSqft = totalAreaM2 * 10.764;

  switch (rate.unitType) {
    case "dwelling_unit":
      return Math.max(1, Math.round(totalAreaM2 / 80)); // 80 sqm per unit
    case "1000_sqft":
      return Math.max(1, Math.round(totalAreaSqft / 1000));
    case "room":
      return Math.max(1, Math.round(totalAreaM2 / 30)); // ~30 sqm per room
    case "seat":
      return Math.max(1, Math.round(totalAreaM2 / 2)); // ~2 sqm per seat
  }
}

/**
 * Generate trip counts for a single building
 */
export function generateTrips(
  buildingId: string,
  zoneCode: string,
  position: [number, number],
  buildingScale: { x: number; y: number; z: number },
): BuildingTripGeneration {
  const landUse = zoneToLandUse(zoneCode);
  const iteRate = ITE_TRIP_RATES[landUse];
  const units = estimateUnits(zoneCode, buildingScale);
  const dailyTrips = Math.round(iteRate.rate * units);
  const peakHourTrips = Math.round(dailyTrips * iteRate.peakHourFraction);

  return {
    buildingId,
    zoneCode,
    landUse,
    iteRate,
    units,
    dailyTrips,
    peakHourTrips,
    position,
  };
}

// ─── Traffic Impact Analysis ─────────────────────────────────────────────────

/** Baseline hourly traffic volume per lane by road speed limit */
function baselineVolumePerLane(speedLimit: number): number {
  if (speedLimit >= 60) return 800;  // arterial
  if (speedLimit >= 50) return 600;  // secondary
  if (speedLimit >= 40) return 400;  // tertiary
  return 200;                         // residential
}

/** Road capacity per lane per hour (vehicles) */
function laneCapacity(speedLimit: number): number {
  if (speedLimit >= 60) return 1800; // freeway-grade
  if (speedLimit >= 50) return 1200;
  if (speedLimit >= 40) return 900;
  return 600;
}

/** LOS from volume/capacity ratio */
function getLOS(vcRatio: number): string {
  if (vcRatio <= 0.35) return "A";
  if (vcRatio <= 0.55) return "B";
  if (vcRatio <= 0.75) return "C";
  if (vcRatio <= 0.90) return "D";
  if (vcRatio <= 1.00) return "E";
  return "F";
}

/**
 * Distribute generated trips across nearby road edges.
 * Trips are distributed inversely proportional to distance from the building.
 */
interface DistributionResult {
  trips: Map<string, number>;
  distances: Map<string, number>;
}

function distributeTrips(
  tripGen: BuildingTripGeneration,
  roadNetwork: RoadNetwork,
  radiusM: number = 800,
  barricadedEdgeIds?: Set<string>,
): DistributionResult {
  const trips = new Map<string, number>();
  const distances = new Map<string, number>();
  const nearEdges = roadNetwork.findEdgesNearPosition(tripGen.position, radiusM);

  if (nearEdges.length === 0) return { trips, distances };

  // Weight by inverse distance (closer roads get more trips)
  const point = turf.point(tripGen.position);
  const weighted: { edge: RoadEdge; weight: number; dist: number }[] = [];
  let totalWeight = 0;

  for (const edge of nearEdges) {
    if (!edge.geometry || edge.geometry.length < 2) continue;
    // Skip barricaded edges for trip distribution
    const baseId = edge.id.replace(/-reverse$/, "");
    if (barricadedEdgeIds?.has(edge.id) || barricadedEdgeIds?.has(baseId)) continue;

    const line = turf.lineString(edge.geometry);
    const dist = turf.pointToLineDistance(point, line, { units: "meters" });
    const weight = 1 / Math.max(dist, 10); // avoid division by very small numbers
    weighted.push({ edge, weight, dist });
    totalWeight += weight;

    // Record distance (keep minimum across all buildings)
    distances.set(edge.id, dist);
  }

  // Distribute peak hour trips (for impact analysis, use peak hour)
  for (const { edge, weight } of weighted) {
    const fraction = weight / totalWeight;
    const tripCount = Math.round(tripGen.peakHourTrips * fraction);
    if (tripCount > 0) {
      const existing = trips.get(edge.id) || 0;
      trips.set(edge.id, existing + tripCount);
    }
  }

  return { trips, distances };
}

/**
 * Run full traffic impact analysis for placed buildings.
 */
/** Map Mapbox congestion levels to volume multipliers (fraction of capacity) */
const CONGESTION_MULTIPLIERS: Record<string, number> = {
  low: 0.3,
  moderate: 0.55,
  heavy: 0.8,
  severe: 0.95,
};

export function analyzeTrafficImpact(
  buildings: Array<{
    id: string;
    position: [number, number]; // [lng, lat]
    zoneCode: string;
    scale: { x: number; y: number; z: number };
  }>,
  roadNetwork: RoadNetwork,
  options?: {
    barricadedEdgeIds?: Set<string>;
    mapboxCongestion?: Map<string, MapboxCongestion>;
  },
): TrafficImpactResult {
  const barricadedEdgeIds = options?.barricadedEdgeIds;
  const mapboxCongestion = options?.mapboxCongestion;
  const IMPACT_RADIUS = 800;

  // 1. Generate trips for each building
  const tripGenerations: BuildingTripGeneration[] = buildings.map((b) =>
    generateTrips(b.id, b.zoneCode, b.position, b.scale),
  );

  const totalDailyTrips = tripGenerations.reduce((s, t) => s + t.dailyTrips, 0);
  const totalPeakHourTrips = tripGenerations.reduce((s, t) => s + t.peakHourTrips, 0);

  // 2. Distribute trips to road edges (collecting distances)
  const edgeTrips = new Map<string, number>();
  const edgeDistances = new Map<string, number>(); // min distance to any building
  for (const tripGen of tripGenerations) {
    const { trips, distances } = distributeTrips(tripGen, roadNetwork, IMPACT_RADIUS, barricadedEdgeIds);
    trips.forEach((tripCount, edgeId) => {
      edgeTrips.set(edgeId, (edgeTrips.get(edgeId) || 0) + tripCount);
    });
    distances.forEach((dist, edgeId) => {
      const existing = edgeDistances.get(edgeId);
      if (existing === undefined || dist < existing) {
        edgeDistances.set(edgeId, dist);
      }
    });
  }

  // 2b. If barricades exist, redistribute blocked traffic to alternate routes
  if (barricadedEdgeIds && barricadedEdgeIds.size > 0) {
    redistributeBlockedTraffic(edgeTrips, edgeDistances, barricadedEdgeIds, roadNetwork, tripGenerations);
  }

  // 3. Calculate before/after for each impacted edge
  const edgeImpact = new Map<string, EdgeImpact>();
  const allEdges = roadNetwork.getEdges();

  // Also include edges within radius that have distance data (for gradient rendering)
  for (const edge of allEdges) {
    const addedTrips = edgeTrips.get(edge.id) || 0;
    const distance = edgeDistances.get(edge.id);
    const capacity = laneCapacity(edge.speedLimit) * Math.max(edge.lanes, 1);

    // Use Mapbox congestion for baseline if available
    let before: number;
    const mapboxData = mapboxCongestion?.get(edge.id);
    if (mapboxData) {
      const multiplier = CONGESTION_MULTIPLIERS[mapboxData.level] ?? 0.3;
      before = Math.round(capacity * multiplier);
    } else {
      before = baselineVolumePerLane(edge.speedLimit) * Math.max(edge.lanes, 1);
    }

    const after = before + addedTrips;
    const vcAfter = after / capacity;
    const level = Math.min(1, vcAfter); // congestion level 0-1

    // Include edges with impact OR within distance radius (for gradient)
    if (addedTrips > 0 || (distance !== undefined && distance <= IMPACT_RADIUS)) {
      edgeImpact.set(edge.id, {
        edgeId: edge.id,
        edgeName: edge.name,
        before,
        after,
        delta: addedTrips,
        level,
        los: getLOS(vcAfter),
        distanceFromSource: distance ?? IMPACT_RADIUS,
      });
    }
  }

  // 4. Find congested intersections
  const congestedIntersections: string[] = [];
  const intersections = roadNetwork.findIntersections();

  for (const node of intersections) {
    const nodeEdges = roadNetwork.getNodeEdges(node.id);
    let maxLevel = 0;

    for (const edge of nodeEdges) {
      const impact = edgeImpact.get(edge.id);
      if (impact) {
        maxLevel = Math.max(maxLevel, impact.level);
      }
    }

    // Congested if any approach road is at LOS D or worse
    if (maxLevel >= 0.75) {
      congestedIntersections.push(node.id);
    }
  }

  return {
    buildings: tripGenerations,
    totalDailyTrips,
    totalPeakHourTrips,
    edgeImpact,
    congestedIntersections,
    maxImpactRadius: IMPACT_RADIUS,
  };
}

/**
 * Redistribute trips from barricaded edges to alternate routes.
 * Uses A* pathfinding to find alternate paths around blocked roads.
 * Also redistributes baseline traffic (not just new trips) to properly
 * show the congestion increase on surrounding roads.
 */
function redistributeBlockedTraffic(
  edgeTrips: Map<string, number>,
  edgeDistances: Map<string, number>,
  barricadedEdgeIds: Set<string>,
  roadNetwork: RoadNetwork,
  tripGenerations: BuildingTripGeneration[],
): void {
  const pathfinder = new Pathfinder(roadNetwork);
  const allEdges = roadNetwork.getEdges();
  const edgeMap = new Map(allEdges.map(e => [e.id, e]));

  // Track which edges have already been processed to avoid duplicates
  const processed = new Set<string>();

  for (const blockedId of barricadedEdgeIds) {
    // Strip -reverse to get base ID, only process each physical road once
    const baseId = blockedId.replace(/-reverse$/, "");
    if (processed.has(baseId)) continue;
    processed.add(baseId);

    const blockedEdge = edgeMap.get(blockedId) || edgeMap.get(baseId);
    if (!blockedEdge) continue;

    // Calculate the total traffic that would use this road:
    // existing new trips PLUS baseline traffic that needs to reroute
    const newTrips = edgeTrips.get(blockedId) || edgeTrips.get(baseId) || 0;
    const baselineTraffic = baselineVolumePerLane(blockedEdge.speedLimit) * Math.max(blockedEdge.lanes, 1);
    // A significant portion of baseline traffic also needs to reroute
    const reroutableBaseline = Math.round(baselineTraffic * 0.6);
    const totalRedistributed = newTrips + reroutableBaseline;

    // Remove trips from blocked edge(s)
    edgeTrips.delete(blockedId);
    edgeTrips.delete(baseId);
    edgeTrips.delete(baseId + "-reverse");

    // Find alternate route around the blocked edge
    const fromNode = roadNetwork.getNode(blockedEdge.from);
    const toNode = roadNetwork.getNode(blockedEdge.to);
    if (!fromNode || !toNode) continue;

    const altRoute = pathfinder.findRoute(fromNode.position, toNode.position, { blockedEdgeIds: barricadedEdgeIds });
    if (altRoute && altRoute.edges.length > 0) {
      // Distribute rerouted traffic across alternate route edges
      // Each edge on the detour gets the full rerouted traffic (they all carry it)
      for (const altEdgeId of altRoute.edges) {
        edgeTrips.set(altEdgeId, (edgeTrips.get(altEdgeId) || 0) + totalRedistributed);
        if (!edgeDistances.has(altEdgeId)) {
          edgeDistances.set(altEdgeId, 100); // Show as nearby/impacted
        }
      }
    } else {
      // No alternate route found; spill all traffic to immediate neighbors
      const neighborEdges = [
        ...roadNetwork.getNodeEdges(blockedEdge.from),
        ...roadNetwork.getNodeEdges(blockedEdge.to),
      ];
      const validNeighbors = neighborEdges.filter(
        e => !barricadedEdgeIds.has(e.id) && e.id !== blockedId && e.id !== baseId
      );
      // Remove duplicates
      const uniqueNeighbors = [...new Map(validNeighbors.map(e => [e.id, e])).values()];
      if (uniqueNeighbors.length > 0) {
        const perEdge = Math.max(1, Math.round(totalRedistributed / uniqueNeighbors.length));
        for (const neighbor of uniqueNeighbors) {
          edgeTrips.set(neighbor.id, (edgeTrips.get(neighbor.id) || 0) + perEdge);
          if (!edgeDistances.has(neighbor.id)) {
            edgeDistances.set(neighbor.id, 50);
          }
        }
      }
    }
  }
}

/**
 * Fetch Mapbox congestion data for road edges.
 * Calls the /api/map/traffic endpoint which proxies to Mapbox Map Matching API.
 */
export async function fetchMapboxCongestion(
  roadNetwork: RoadNetwork,
): Promise<Map<string, MapboxCongestion>> {
  const edges = roadNetwork.getEdges();
  const edgeData = edges
    .filter(e => e.geometry && e.geometry.length >= 2)
    .slice(0, 200) // Limit to avoid huge payloads
    .map(e => ({
      id: e.id,
      geometry: e.geometry,
    }));

  try {
    const response = await fetch("/api/map/traffic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edges: edgeData }),
    });

    if (!response.ok) {
      console.warn("Mapbox traffic fetch failed:", response.status);
      return new Map();
    }

    const data = await response.json();
    const result = new Map<string, MapboxCongestion>();
    if (data.congestion) {
      for (const [edgeId, congestion] of Object.entries(data.congestion)) {
        result.set(edgeId, congestion as MapboxCongestion);
      }
    }
    return result;
  } catch (error) {
    console.warn("Mapbox traffic fetch error:", error);
    return new Map();
  }
}

// ─── Heatmap color helpers ───────────────────────────────────────────────────

/**
 * Get heatmap color for a congestion level (0-1).
 * 0 = green (free flow), 0.5 = yellow, 1 = red (gridlock)
 */
export function getCongestionColor(level: number): number {
  const t = Math.max(0, Math.min(1, level));
  // Green → Yellow → Red
  let r: number, g: number, b: number;
  if (t < 0.5) {
    // Green to Yellow
    const s = t * 2;
    r = Math.round(s * 255);
    g = 255;
    b = 0;
  } else {
    // Yellow to Red
    const s = (t - 0.5) * 2;
    r = 255;
    g = Math.round((1 - s) * 255);
    b = 0;
  }
  return (r << 16) | (g << 8) | b;
}

/**
 * Get LOS description text
 */
export function getLOSDescription(los: string): string {
  switch (los) {
    case "A": return "Free Flow";
    case "B": return "Reasonably Free Flow";
    case "C": return "Stable Flow";
    case "D": return "Approaching Unstable";
    case "E": return "Unstable Flow";
    case "F": return "Forced / Breakdown";
    default: return "Unknown";
  }
}

/**
 * Get all available ITE trip rates (for UI dropdowns)
 */
export function getITERates(): Record<string, ITETripRate> {
  return { ...ITE_TRIP_RATES };
}
