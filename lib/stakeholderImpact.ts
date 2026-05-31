/**
 * Stakeholder Impact Analysis System
 *
 * When a building is placed, identify all residential/commercial buildings within a
 * configurable radius and calculate per-building impacts: shadow, distance, noise,
 * and view obstruction. Color-code surrounding buildings by impact severity.
 */

import * as THREE from "three";
import { Building } from "./buildingData";
import { CityProjection } from "./projection";
import { getRepresentativeSourceDb, dbAtDistanceMeters } from "./constructionNoise";
import type { BuildMode } from "./buildMode";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ImpactRadius = 100 | 250 | 500;

export type ImpactSeverity = "none" | "low" | "medium" | "high";

export interface BuildingImpactResult {
  buildingId: string;
  type: string | undefined;
  distanceMeters: number;
  shadowImpact: number;       // 0–1  (fraction of daylight hours with new shadow)
  noiseImpact: number;        // 0–1
  viewObstruction: number;    // 0–1
  overallSeverity: ImpactSeverity;
  overallScore: number;       // 0–1 composite
  centroid: [number, number]; // [lng, lat]
  height: number;
}

export interface StakeholderSummary {
  radiusMeters: ImpactRadius;
  totalAffected: number;
  residentialAffected: number;
  commercialAffected: number;
  institutionalAffected: number;
  otherAffected: number;
  significantSunlightLoss: number;  // buildings losing > 30% sunlight
  highNoiseExposure: number;        // buildings with noise > 0.6
  highViewObstruction: number;      // buildings with view obstruction > 0.6
  averageImpactScore: number;
  impactByCategory: { low: number; medium: number; high: number };
}

export interface StakeholderAnalysis {
  placedBuildingId: string;
  placedBuildingPosition: [number, number]; // [lng, lat]
  placedBuildingHeight: number;
  summary: StakeholderSummary;
  impacts: BuildingImpactResult[];
}

// ─── Classification helpers ──────────────────────────────────────────────────

const RESIDENTIAL_TYPES = new Set([
  "residential", "house", "detached", "semidetached_house",
  "terrace", "bungalow", "apartments",
]);

const COMMERCIAL_TYPES = new Set([
  "commercial", "retail", "shop", "office",
  "industrial", "warehouse",
]);

const INSTITUTIONAL_TYPES = new Set([
  "school", "university", "college", "hospital", "clinic",
  "church", "cathedral", "chapel", "civic", "public", "government",
]);

function classifyBuilding(type: string | undefined): "residential" | "commercial" | "institutional" | "other" {
  if (!type) return "other";
  if (RESIDENTIAL_TYPES.has(type)) return "residential";
  if (COMMERCIAL_TYPES.has(type)) return "commercial";
  if (INSTITUTIONAL_TYPES.has(type)) return "institutional";
  return "other";
}

// ─── Geo helpers ─────────────────────────────────────────────────────────────

/** Haversine distance in meters between two [lng, lat] points */
function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Compute centroid of a polygon footprint as [lng, lat] */
function footprintCentroid(footprint: [number, number][]): [number, number] {
  let lngSum = 0, latSum = 0;
  for (const [lng, lat] of footprint) {
    lngSum += lng;
    latSum += lat;
  }
  return [lngSum / footprint.length, latSum / footprint.length];
}

// ─── Impact Calculations ─────────────────────────────────────────────────────

/**
 * Shadow impact: based on placed building height, distance, and relative position.
 * Higher buildings cast longer shadows; closer buildings are more affected.
 * Simplified model: shadow length ≈ height × 2 (average sun angle ≈ 27°).
 */
function calculateShadowImpact(
  placedHeight: number,
  targetHeight: number,
  distanceMeters: number,
): number {
  // Max shadow reach at low sun angle (morning/evening) ≈ height * 3
  const maxShadowReach = placedHeight * 3;
  if (distanceMeters >= maxShadowReach) return 0;

  // The fraction of day affected by shadow depends on how close the building is
  // relative to the shadow reach
  const distanceRatio = distanceMeters / maxShadowReach;

  // Buildings taller than the placed one are less affected by shadow
  const heightFactor = Math.max(0, 1 - targetHeight / (placedHeight * 1.5));

  // Combine: closer distance + shorter target building = more shadow impact
  const impact = (1 - distanceRatio) * (0.4 + 0.6 * heightFactor);
  return Math.min(1, Math.max(0, impact));
}

/**
 * Noise impact from construction activity.
 * Uses FHWA equipment-based source levels and inverse-square propagation.
 * WHO-aligned thresholds: 45 dB = 0 impact, 85 dB = 1.0 impact.
 */
function calculateNoiseImpact(distanceMeters: number, placedHeight: number): number {
  // Use representative peak source dB from equipment model (no zoneType available here)
  const sourceDb = getRepresentativeSourceDb(undefined, placedHeight);
  const receivedDb = dbAtDistanceMeters(Math.max(1, distanceMeters), sourceDb);

  // Normalize: 45 dB = 0 impact, 85 dB = 1.0 impact (WHO-aligned)
  const impact = (receivedDb - 45) / 40;
  return Math.min(1, Math.max(0, impact));
}

/**
 * View obstruction: raycasting-inspired calculation.
 * Based on the solid angle subtended by the placed building as seen from the target.
 */
function calculateViewObstruction(
  placedHeight: number,
  placedWidth: number,
  distanceMeters: number,
  targetHeight: number,
): number {
  if (distanceMeters < 1) return 1;

  // Visible height of the placed building from the target's average window
  const viewerEyeHeight = targetHeight * 0.6; // average floor height
  const visibleHeight = Math.max(0, placedHeight - viewerEyeHeight);

  if (visibleHeight <= 0) return 0;

  // Solid angle approximation (width × visible height / distance²)
  const effectiveWidth = Math.max(10, placedWidth);
  const solidAngle = (effectiveWidth * visibleHeight) / (distanceMeters * distanceMeters);

  // Normalize: 0.1 sr = full obstruction (very close large building)
  const impact = solidAngle / 0.05;
  return Math.min(1, Math.max(0, impact));
}

function computeOverallScore(shadow: number, noise: number, view: number): number {
  // Weighted average: shadow and noise are most impactful for quality of life
  return shadow * 0.35 + noise * 0.35 + view * 0.30;
}

function scoreToSeverity(score: number): ImpactSeverity {
  if (score < 0.15) return "none";
  if (score < 0.35) return "low";
  if (score < 0.60) return "medium";
  return "high";
}

// ─── Color coding ────────────────────────────────────────────────────────────

const IMPACT_COLORS: Record<ImpactSeverity, number> = {
  none: 0x888888,    // neutral gray (not in radius)
  low: 0x22c55e,     // green
  medium: 0xeab308,  // yellow
  high: 0xef4444,    // red
};

export function getImpactColor(severity: ImpactSeverity): number {
  return IMPACT_COLORS[severity];
}

// ─── Main analysis function ──────────────────────────────────────────────────

/**
 * Analyze stakeholder impact of a newly placed building on surrounding OSM buildings.
 *
 * @param placedPosition  [lng, lat] of the placed building
 * @param placedHeight    Height of the placed building in meters
 * @param placedWidth     Approximate width of the placed building in meters
 * @param osmBuildings    All OSM buildings in the dataset
 * @param radius          Impact radius in meters (100, 250, or 500)
 */
export function analyzeStakeholderImpact(
  placedPosition: [number, number],
  placedHeight: number,
  placedWidth: number,
  osmBuildings: Building[],
  radius: ImpactRadius = 250,
  buildMode: BuildMode = "new-build",
): StakeholderAnalysis {
  const impacts: BuildingImpactResult[] = [];

  // Noise from a fit-out is order-of-magnitude smaller than from new
  // construction: indoor demo and finishing work, mostly during the day, and
  // no heavy equipment. Scale the modelled noise field accordingly. Shadow
  // and view impacts are massing-driven, so when we're moving into an
  // existing building (no new massing) we suppress them entirely — the
  // surrounding context already sees the building that's there today.
  const noiseScale = buildMode === "move-in" ? 0.15 : 1.0;
  const massingActive = buildMode !== "move-in";

  for (const building of osmBuildings) {
    if (building.footprint.length < 3) continue;

    const centroid = footprintCentroid(building.footprint);
    const dist = haversineMeters(placedPosition, centroid);

    if (dist > radius) continue;

    const shadow = massingActive
      ? calculateShadowImpact(placedHeight, building.height, dist)
      : 0;
    const noise = calculateNoiseImpact(dist, placedHeight) * noiseScale;
    const view = massingActive
      ? calculateViewObstruction(placedHeight, placedWidth, dist, building.height)
      : 0;
    const score = computeOverallScore(shadow, noise, view);

    impacts.push({
      buildingId: building.id,
      type: building.type,
      distanceMeters: dist,
      shadowImpact: shadow,
      noiseImpact: noise,
      viewObstruction: view,
      overallSeverity: scoreToSeverity(score),
      overallScore: score,
      centroid,
      height: building.height,
    });
  }

  // Sort by severity (highest first)
  impacts.sort((a, b) => b.overallScore - a.overallScore);

  // Compute summary
  let residential = 0, commercial = 0, institutional = 0, other = 0;
  let sunlightLoss = 0, highNoise = 0, highView = 0;
  let totalScore = 0;
  const categories = { low: 0, medium: 0, high: 0 };

  for (const imp of impacts) {
    const cat = classifyBuilding(imp.type);
    if (cat === "residential") residential++;
    else if (cat === "commercial") commercial++;
    else if (cat === "institutional") institutional++;
    else other++;

    if (imp.shadowImpact > 0.3) sunlightLoss++;
    if (imp.noiseImpact > 0.6) highNoise++;
    if (imp.viewObstruction > 0.6) highView++;
    totalScore += imp.overallScore;

    if (imp.overallSeverity === "low") categories.low++;
    else if (imp.overallSeverity === "medium") categories.medium++;
    else if (imp.overallSeverity === "high") categories.high++;
  }

  return {
    placedBuildingId: "placed",
    placedBuildingPosition: placedPosition,
    placedBuildingHeight: placedHeight,
    summary: {
      radiusMeters: radius,
      totalAffected: impacts.length,
      residentialAffected: residential,
      commercialAffected: commercial,
      institutionalAffected: institutional,
      otherAffected: other,
      significantSunlightLoss: sunlightLoss,
      highNoiseExposure: highNoise,
      highViewObstruction: highView,
      averageImpactScore: impacts.length > 0 ? totalScore / impacts.length : 0,
      impactByCategory: categories,
    },
    impacts,
  };
}

// ─── Three.js integration: color-code buildings by impact ────────────────────

/**
 * Apply impact color-coding to OSM building meshes in the scene.
 * Returns a cleanup function to restore original colors.
 */
export function applyImpactColors(
  analysis: StakeholderAnalysis,
  osmMeshes: Map<string, THREE.Group>,
): () => void {
  const originalMaterials = new Map<string, THREE.Material[]>();

  // Build lookup from buildingId to impact
  const impactLookup = new Map<string, BuildingImpactResult>();
  for (const imp of analysis.impacts) {
    impactLookup.set(imp.buildingId, imp);
  }

  osmMeshes.forEach((group, buildingId) => {
    const impact = impactLookup.get(buildingId);
    if (!impact || impact.overallSeverity === "none") return;

    const color = getImpactColor(impact.overallSeverity);
    const originals: THREE.Material[] = [];

    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        originals.push(child.material as THREE.Material);
        // MeshBasicMaterial ignores all scene lighting → flat, constant color
        child.material = new THREE.MeshBasicMaterial({ color });
      }
    });

    if (originals.length > 0) {
      originalMaterials.set(buildingId, originals);
    }
  });

  // Return cleanup function
  return () => {
    originalMaterials.forEach((originals, buildingId) => {
      const group = osmMeshes.get(buildingId);
      if (!group) return;

      let idx = 0;
      group.traverse((child) => {
        if (child instanceof THREE.Mesh && idx < originals.length) {
          child.material.dispose();
          child.material = originals[idx];
          idx++;
        }
      });
    });
  };
}
