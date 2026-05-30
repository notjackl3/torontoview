/**
 * Shadow/Sunlight Analysis Engine
 *
 * Computes shadow impact of proposed buildings on surrounding structures.
 * Uses raycasting from sun direction to determine which buildings lose
 * direct sunlight when a new building is placed.
 */

import * as THREE from "three";
import { computeTimeOfDay } from "./timeOfDay";

/** Result of shadow analysis for a single building */
export interface BuildingShadowImpact {
  buildingId: string;
  buildingType: string | undefined;
  /** Hours of sunlight lost due to proposed building (between 6am-8pm) */
  hoursLost: number;
  /** Total hours of direct sun without proposed building */
  baselineSunHours: number;
  /** Total hours of direct sun with proposed building */
  newSunHours: number;
  /** Whether this is a residential building */
  isResidential: boolean;
  /** Estimated residential units in this building */
  estimatedUnits: number;
  /** Specific hours at which this building is newly shadowed by the proposed building */
  impactedAtHours: number[];
}

/** Summary of shadow analysis */
export interface ShadowAnalysisSummary {
  /** Total buildings affected (losing any sunlight) */
  totalAffected: number;
  /** Buildings losing >2 hours of direct sunlight */
  severelyAffected: number;
  /** Residential units losing >2 hours of direct sunlight */
  residentialUnitsAffected: number;
  /** Per-building impact details (sorted by impact, descending) */
  impacts: BuildingShadowImpact[];
  /** Day of year used for analysis */
  dayOfYear: number;
  /** Date label */
  dateLabel: string;
}

const RESIDENTIAL_TYPES = new Set([
  "residential",
  "house",
  "detached",
  "semidetached_house",
  "terrace",
  "bungalow",
  "apartments",
]);

function estimateResidentialUnits(type: string | undefined, height: number): number {
  if (!type || !RESIDENTIAL_TYPES.has(type)) return 0;
  if (type === "apartments") {
    // ~3m per floor, ~4 units per floor
    const floors = Math.max(1, Math.round(height / 3));
    return floors * 4;
  }
  // Single-family or small multi-unit
  if (type === "terrace") return 2;
  return 1;
}

/**
 * Convert a Date to day of year (1-365).
 */
export function dateToDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Get a human-readable label for a day of year.
 */
export function dayOfYearToLabel(dayOfYear: number): string {
  const date = new Date(2024, 0, dayOfYear);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Seasonal presets */
export const SEASON_PRESETS: { label: string; dayOfYear: number }[] = [
  { label: "Winter Solstice (Dec 21)", dayOfYear: 356 },
  { label: "Spring Equinox (Mar 20)", dayOfYear: 80 },
  { label: "Summer Solstice (Jun 21)", dayOfYear: 172 },
  { label: "Fall Equinox (Sep 22)", dayOfYear: 266 },
];

/**
 * Perform shadow analysis by raycasting from sun positions throughout the day.
 *
 * For each sample hour (6am → 8pm), casts rays from each surrounding building
 * toward the sun. Checks if the proposed building blocks those rays.
 *
 * Processing is chunked to avoid blocking the main thread.
 *
 * @param scene - The Three.js scene
 * @param proposedBuildings - Group(s) representing the proposed building(s)
 * @param osmBuildingMeshes - Map of existing building meshes
 * @param dayOfYear - Day of year for sun angle calculation
 * @param sampleIntervalHours - Time step between samples (default 0.5 = 30 min)
 */
export async function analyzeShadowImpact(
  scene: THREE.Scene,
  proposedBuildings: THREE.Object3D[],
  osmBuildingMeshes: Map<string, THREE.Group>,
  dayOfYear: number = 80,
  sampleIntervalHours: number = 0.5,
): Promise<ShadowAnalysisSummary> {
  const START_HOUR = 6;
  const END_HOUR = 20;
  const sampleHours: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h += sampleIntervalHours) {
    sampleHours.push(h);
  }

  const raycaster = new THREE.Raycaster();
  raycaster.far = 5000;

  // Pre-compute sun directions for each sample hour
  const sunDirections: (THREE.Vector3 | null)[] = sampleHours.map((hour) => {
    const config = computeTimeOfDay(hour, dayOfYear);
    if (!config.isAboveHorizon) return null;
    // Direction FROM building TOWARD sun
    const lightPos = sunToDirection(config.sunAltitude, config.sunAzimuth);
    return lightPos.normalize();
  });

  // Collect all meshes from proposed buildings for intersection
  const proposedMeshes: THREE.Mesh[] = [];
  for (const obj of proposedBuildings) {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        proposedMeshes.push(child);
      }
    });
  }

  if (proposedMeshes.length === 0) {
    return {
      totalAffected: 0,
      severelyAffected: 0,
      residentialUnitsAffected: 0,
      impacts: [],
      dayOfYear,
      dateLabel: dayOfYearToLabel(dayOfYear),
    };
  }

  // For each existing building, sample sunlight with and without the proposed building
  const impacts: BuildingShadowImpact[] = [];

  // Get all scene meshes EXCEPT proposed building for baseline check
  const allSceneMeshes: THREE.Mesh[] = [];
  scene.traverse((child) => {
    if (child instanceof THREE.Mesh && !proposedMeshes.includes(child)) {
      allSceneMeshes.push(child);
    }
  });

  // Compute proposed building center for distance culling
  const proposedBox = new THREE.Box3();
  for (const mesh of proposedMeshes) {
    proposedBox.expandByObject(mesh);
  }
  const proposedCenter = proposedBox.getCenter(new THREE.Vector3());
  const proposedHeight = proposedBox.max.y - proposedBox.min.y;
  // Shadow length = height / tan(sun_altitude). At ~10° (low sun): height * 5.7.
  // Use height * 6 with a floor of 1500 world units (~210m) so small buildings
  // still catch nearby neighbors, capped at raycaster.far (5000).
  const MAX_SHADOW_RADIUS = Math.max(Math.min(proposedHeight * 6 + 50, 5000), 1500);

  const buildingEntries = Array.from(osmBuildingMeshes.entries());
  const CHUNK_SIZE = 50;

  for (let chunkStart = 0; chunkStart < buildingEntries.length; chunkStart += CHUNK_SIZE) {
    const chunk = buildingEntries.slice(chunkStart, chunkStart + CHUNK_SIZE);

    for (const [buildingId, group] of chunk) {
      // Skip if this is one of the proposed buildings
      if (proposedBuildings.some((pb) => pb === group)) continue;

      // Distance culling: skip buildings that are too far to ever be shadowed
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const dx = center.x - proposedCenter.x;
      const dz = center.z - proposedCenter.z;
      if (dx * dx + dz * dz > MAX_SHADOW_RADIUS * MAX_SHADOW_RADIUS) continue;

      const userData = group.userData;
      const buildingType = userData?.type as string | undefined;
      const buildingHeight = (userData?.height as number) || 5;

      // Sample from roof center
      const samplePoints = [
        new THREE.Vector3(center.x, box.max.y - 0.5, center.z),
      ];

      let baselineSunSamples = 0;
      let newSunSamples = 0;
      const impactedAtHours: number[] = [];

      for (let si = 0; si < sampleHours.length; si++) {
        const sunDir = sunDirections[si];
        if (!sunDir) continue; // Sun below horizon

        let blockedThisHour = false;

        for (const origin of samplePoints) {
          // Baseline: check if sun is blocked by existing buildings (excluding proposed)
          raycaster.set(origin, sunDir);
          const baselineHits = raycaster.intersectObjects(allSceneMeshes, false);
          const baselineBlocked = baselineHits.some((hit) => {
            let parent: THREE.Object3D | null = hit.object;
            while (parent) {
              if (parent === group) return false;
              parent = parent.parent;
            }
            return true;
          });

          if (baselineBlocked) {
            // Already in shadow — proposed building can't take away sun it doesn't have.
            // Both baseline and new are blocked; skip the proposed raycast entirely.
            continue;
          }

          baselineSunSamples++;

          // Baseline was clear — check if proposed building now blocks the sun
          const proposedHits = raycaster.intersectObjects(proposedMeshes, false);
          if (proposedHits.length === 0) {
            // Proposed doesn't block either → no change for this sample
            newSunSamples++;
          } else {
            // Proposed blocks sun at this hour
            blockedThisHour = true;
          }
        }

        if (blockedThisHour) {
          impactedAtHours.push(sampleHours[si]);
        }
      }

      const activeSampleHours = sunDirections.filter((d) => d !== null).length;
      const totalPossibleSamples = samplePoints.length * activeSampleHours;

      if (totalPossibleSamples === 0) continue;

      const baselineSunHours =
        (baselineSunSamples / totalPossibleSamples) * (END_HOUR - START_HOUR);
      const newSunHours =
        (newSunSamples / totalPossibleSamples) * (END_HOUR - START_HOUR);
      const hoursLost = baselineSunHours - newSunHours;

      if (hoursLost > 0.1) {
        const isResidential = RESIDENTIAL_TYPES.has(buildingType || "");
        impacts.push({
          buildingId,
          buildingType,
          hoursLost: Math.round(hoursLost * 10) / 10,
          baselineSunHours: Math.round(baselineSunHours * 10) / 10,
          newSunHours: Math.round(newSunHours * 10) / 10,
          isResidential,
          estimatedUnits: estimateResidentialUnits(buildingType, buildingHeight),
          impactedAtHours,
        });
      }
    }

    // Yield to the browser between chunks to keep the UI responsive
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  // Sort by impact descending
  impacts.sort((a, b) => b.hoursLost - a.hoursLost);

  const severelyAffected = impacts.filter((i) => i.hoursLost > 2);
  const residentialUnitsAffected = severelyAffected
    .filter((i) => i.isResidential)
    .reduce((sum, i) => sum + i.estimatedUnits, 0);

  return {
    totalAffected: impacts.length,
    severelyAffected: severelyAffected.length,
    residentialUnitsAffected,
    impacts,
    dayOfYear,
    dateLabel: dayOfYearToLabel(dayOfYear),
  };
}

/**
 * Convert sun altitude/azimuth to a unit direction vector (toward the sun).
 */
function sunToDirection(altitude: number, azimuth: number): THREE.Vector3 {
  const y = Math.sin(Math.max(altitude, 0.01));
  const horizontal = Math.cos(Math.max(altitude, 0.01));
  const x = horizontal * Math.sin(azimuth);
  const z = horizontal * Math.cos(azimuth);
  return new THREE.Vector3(x, y, z);
}

/**
 * Compute a shadow "heatmap" — for each nearby building, color it by hours of sunlight lost.
 * When filterHour is provided, only highlights buildings impacted at that specific hour.
 * Returns a cleanup function to restore original materials.
 */
export function applyShadowOverlay(
  impacts: BuildingShadowImpact[],
  osmBuildingMeshes: Map<string, THREE.Group>,
  filterHour?: number,
): () => void {
  const originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  const impactMap = new Map(impacts.map((i) => [i.buildingId, i]));

  osmBuildingMeshes.forEach((group, buildingId) => {
    const impact = impactMap.get(buildingId);
    if (!impact) return;

    // When filtering by hour, skip buildings not impacted at this specific hour
    if (filterHour !== undefined) {
      const isImpactedNow = impact.impactedAtHours.some(
        (h) => Math.abs(h - filterHour) < 0.5,
      );
      if (!isImpactedNow) return;
    }

    // Color from green (low impact) → yellow → red (high impact)
    const t = Math.min(impact.hoursLost / 4, 1); // 4+ hours = max red
    const color = new THREE.Color();
    if (t < 0.5) {
      // Green → Yellow
      color.setRGB(t * 2, 1, 0);
    } else {
      // Yellow → Red
      color.setRGB(1, 1 - (t - 0.5) * 2, 0);
    }

    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        originalMaterials.set(child, child.material);
        child.material = new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 0.85,
          emissive: color,
          emissiveIntensity: 0.3,
        });
      }
    });
  });

  // Return cleanup function
  return () => {
    originalMaterials.forEach((mat, mesh) => {
      mesh.material = mat;
    });
  };
}
