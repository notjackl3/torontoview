/**
 * Construction noise (dB) and population happiness calculations.
 * Equipment-based model grounded in FHWA reference data and WHO annoyance curves.
 * Noise varies by construction category, phase, equipment selection, and distance.
 */

import { getZoneByCode } from "./torontoZoning";

// ─── FHWA Reference Data ────────────────────────────────────────────────────

/** FHWA standard reference distance: 50 ft = 15.24 m */
const REFERENCE_DISTANCE_M = 15.24;

/** Equipment dB(A) at 15m reference distance and duty cycle (FHWA RCNM) */
const EQUIPMENT_DB: Record<string, { db: number; duty: number }> = {
  pile_driver:   { db: 101, duty: 0.20 },
  jackhammer:    { db: 89,  duty: 0.20 },
  excavator:     { db: 85,  duty: 0.40 },
  bulldozer:     { db: 82,  duty: 0.40 },
  concrete_mixer:{ db: 85,  duty: 0.40 },
  concrete_pump: { db: 82,  duty: 0.20 },
  crane:         { db: 81,  duty: 0.16 },
  generator:     { db: 81,  duty: 0.50 },
  compactor:     { db: 83,  duty: 0.20 },
  saw:           { db: 76,  duty: 0.20 },
  drill:         { db: 84,  duty: 0.20 },
  welder:        { db: 73,  duty: 0.40 },
  forklift:      { db: 75,  duty: 0.40 },
  dump_truck:    { db: 76,  duty: 0.40 },
  backhoe:       { db: 78,  duty: 0.40 },
  grader:        { db: 85,  duty: 0.40 },
};

// ─── Construction Categories ────────────────────────────────────────────────

type ConstructionCategory =
  | "small_residential"
  | "large_residential"
  | "commercial"
  | "mixed_use"
  | "industrial"
  | "institutional"
  | "heritage"
  | "infrastructure";

type ConstructionPhase =
  | "excavation"
  | "foundation"
  | "structural"
  | "envelope"
  | "finishing";

/** Map Toronto zone category to construction category */
function zoneToConstructionCategory(zoneCode?: string): ConstructionCategory {
  if (!zoneCode) return "commercial"; // default fallback
  const zone = getZoneByCode(zoneCode);
  if (!zone) return "commercial";

  // Heritage zones
  if (zoneCode.startsWith("HCD")) return "heritage";
  // Urban residential (single-family)
  if (zone.category === "Urban Residential" || zone.category === "Rural")
    return "small_residential";
  // Multi-residential
  if (zone.category === "Urban Multi-Residential") return "large_residential";
  // Commercial
  if (zone.category === "Commercial") return "commercial";
  // Mixed use
  if (zone.category === "Mixed Use") return "mixed_use";
  // Industrial / Employment
  if (zone.category === "Employment" || zone.category === "Rural Industrial")
    return "industrial";
  // Institutional
  if (zone.category === "Institutional") return "institutional";
  // Transportation
  if (zone.category === "Transportation and Utilities") return "infrastructure";

  return "commercial";
}

/** Determine construction phase from progress (0–1) */
function phaseFromProgress(progress: number): ConstructionPhase {
  if (progress < 0.12) return "excavation";
  if (progress < 0.30) return "foundation";
  if (progress < 0.60) return "structural";
  if (progress < 0.85) return "envelope";
  return "finishing";
}

// ─── Phase → Equipment Mapping ──────────────────────────────────────────────

interface EquipmentEntry {
  id: string;
  count: number;
}

type PhaseEquipmentMap = Record<ConstructionPhase, EquipmentEntry[]>;

const PHASE_EQUIPMENT: Record<ConstructionCategory, PhaseEquipmentMap> = {
  small_residential: {
    excavation: [
      { id: "excavator", count: 1 },
      { id: "dump_truck", count: 1 },
      { id: "generator", count: 1 },
    ],
    foundation: [
      { id: "concrete_mixer", count: 1 },
      { id: "concrete_pump", count: 1 },
      { id: "generator", count: 1 },
    ],
    structural: [
      { id: "crane", count: 1 },
      { id: "saw", count: 1 },
      { id: "drill", count: 1 },
      { id: "generator", count: 1 },
    ],
    envelope: [
      { id: "forklift", count: 1 },
      { id: "saw", count: 1 },
      { id: "drill", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 1 },
      { id: "saw", count: 1 },
    ],
  },
  large_residential: {
    excavation: [
      { id: "excavator", count: 2 },
      { id: "bulldozer", count: 1 },
      { id: "dump_truck", count: 2 },
      { id: "generator", count: 1 },
    ],
    foundation: [
      { id: "pile_driver", count: 1 },
      { id: "concrete_mixer", count: 1 },
      { id: "concrete_pump", count: 1 },
      { id: "generator", count: 1 },
    ],
    structural: [
      { id: "crane", count: 2 },
      { id: "concrete_mixer", count: 1 },
      { id: "welder", count: 2 },
      { id: "generator", count: 1 },
    ],
    envelope: [
      { id: "crane", count: 1 },
      { id: "forklift", count: 1 },
      { id: "drill", count: 2 },
      { id: "saw", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 2 },
      { id: "saw", count: 1 },
      { id: "forklift", count: 1 },
    ],
  },
  commercial: {
    excavation: [
      { id: "excavator", count: 2 },
      { id: "bulldozer", count: 1 },
      { id: "dump_truck", count: 3 },
      { id: "generator", count: 2 },
    ],
    foundation: [
      { id: "pile_driver", count: 1 },
      { id: "concrete_mixer", count: 2 },
      { id: "concrete_pump", count: 1 },
      { id: "generator", count: 2 },
    ],
    structural: [
      { id: "crane", count: 2 },
      { id: "concrete_mixer", count: 2 },
      { id: "welder", count: 3 },
      { id: "generator", count: 2 },
    ],
    envelope: [
      { id: "crane", count: 1 },
      { id: "forklift", count: 2 },
      { id: "drill", count: 2 },
      { id: "welder", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 2 },
      { id: "saw", count: 1 },
      { id: "forklift", count: 1 },
      { id: "welder", count: 1 },
    ],
  },
  mixed_use: {
    excavation: [
      { id: "excavator", count: 2 },
      { id: "bulldozer", count: 1 },
      { id: "dump_truck", count: 2 },
      { id: "generator", count: 1 },
    ],
    foundation: [
      { id: "pile_driver", count: 1 },
      { id: "concrete_mixer", count: 1 },
      { id: "concrete_pump", count: 1 },
      { id: "generator", count: 1 },
    ],
    structural: [
      { id: "crane", count: 2 },
      { id: "concrete_mixer", count: 1 },
      { id: "welder", count: 2 },
      { id: "generator", count: 1 },
    ],
    envelope: [
      { id: "crane", count: 1 },
      { id: "forklift", count: 1 },
      { id: "drill", count: 2 },
      { id: "saw", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 2 },
      { id: "saw", count: 1 },
      { id: "forklift", count: 1 },
    ],
  },
  industrial: {
    excavation: [
      { id: "excavator", count: 2 },
      { id: "bulldozer", count: 2 },
      { id: "grader", count: 1 },
      { id: "dump_truck", count: 3 },
      { id: "generator", count: 2 },
    ],
    foundation: [
      { id: "pile_driver", count: 1 },
      { id: "concrete_mixer", count: 2 },
      { id: "concrete_pump", count: 1 },
      { id: "compactor", count: 1 },
      { id: "generator", count: 2 },
    ],
    structural: [
      { id: "crane", count: 2 },
      { id: "welder", count: 3 },
      { id: "concrete_mixer", count: 1 },
      { id: "generator", count: 2 },
    ],
    envelope: [
      { id: "crane", count: 1 },
      { id: "welder", count: 2 },
      { id: "forklift", count: 2 },
      { id: "drill", count: 2 },
    ],
    finishing: [
      { id: "drill", count: 2 },
      { id: "welder", count: 1 },
      { id: "forklift", count: 1 },
    ],
  },
  institutional: {
    excavation: [
      { id: "excavator", count: 1 },
      { id: "bulldozer", count: 1 },
      { id: "dump_truck", count: 2 },
      { id: "generator", count: 1 },
    ],
    foundation: [
      { id: "concrete_mixer", count: 1 },
      { id: "concrete_pump", count: 1 },
      { id: "compactor", count: 1 },
      { id: "generator", count: 1 },
    ],
    structural: [
      { id: "crane", count: 1 },
      { id: "concrete_mixer", count: 1 },
      { id: "welder", count: 2 },
      { id: "generator", count: 1 },
    ],
    envelope: [
      { id: "crane", count: 1 },
      { id: "forklift", count: 1 },
      { id: "drill", count: 1 },
      { id: "saw", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 1 },
      { id: "saw", count: 1 },
    ],
  },
  heritage: {
    // Heritage zones: NO pile drivers allowed
    excavation: [
      { id: "excavator", count: 1 },
      { id: "dump_truck", count: 1 },
      { id: "generator", count: 1 },
    ],
    foundation: [
      { id: "concrete_mixer", count: 1 },
      { id: "concrete_pump", count: 1 },
      { id: "generator", count: 1 },
    ],
    structural: [
      { id: "crane", count: 1 },
      { id: "saw", count: 1 },
      { id: "drill", count: 1 },
      { id: "generator", count: 1 },
    ],
    envelope: [
      { id: "forklift", count: 1 },
      { id: "drill", count: 1 },
      { id: "saw", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 1 },
      { id: "saw", count: 1 },
    ],
  },
  infrastructure: {
    excavation: [
      { id: "excavator", count: 2 },
      { id: "bulldozer", count: 1 },
      { id: "grader", count: 1 },
      { id: "dump_truck", count: 3 },
      { id: "compactor", count: 1 },
      { id: "generator", count: 2 },
    ],
    foundation: [
      { id: "pile_driver", count: 1 },
      { id: "concrete_mixer", count: 2 },
      { id: "concrete_pump", count: 1 },
      { id: "generator", count: 2 },
    ],
    structural: [
      { id: "crane", count: 2 },
      { id: "welder", count: 2 },
      { id: "concrete_mixer", count: 1 },
      { id: "generator", count: 2 },
    ],
    envelope: [
      { id: "crane", count: 1 },
      { id: "forklift", count: 1 },
      { id: "compactor", count: 1 },
      { id: "drill", count: 1 },
    ],
    finishing: [
      { id: "drill", count: 1 },
      { id: "saw", count: 1 },
    ],
  },
};

// ─── Core Acoustic Functions ────────────────────────────────────────────────

/**
 * Compute site Leq from a list of active equipment using logarithmic addition.
 * Per equipment: Leq_i = dbAt15m + 10*log10(dutyCycle) + 10*log10(count)
 * Combined: Leq_site = 10 * log10(Σ 10^(Leq_i / 10))
 */
export function computeSiteLeq(equipment: EquipmentEntry[]): number {
  if (equipment.length === 0) return 0;

  let sumLinear = 0;
  for (const eq of equipment) {
    const spec = EQUIPMENT_DB[eq.id];
    if (!spec) continue;
    const leq_i = spec.db + 10 * Math.log10(spec.duty) + 10 * Math.log10(eq.count);
    sumLinear += Math.pow(10, leq_i / 10);
  }

  if (sumLinear === 0) return 0;
  return 10 * Math.log10(sumLinear);
}

/** Deterministic pseudo-random 0–1 from a seed string */
function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h % 10000) / 10000;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Sound propagation: inverse-square with soft ground absorption.
 * Reference distance is 15m (FHWA standard).
 * dB = source - 20*log10(d/15) - 0.5*log2(d/15) (soft ground term)
 */
export function dbAtDistanceMeters(
  distanceM: number,
  sourceDbAt15M: number
): number {
  if (distanceM <= REFERENCE_DISTANCE_M) return sourceDbAt15M;
  const ratio = distanceM / REFERENCE_DISTANCE_M;
  const geometricSpreading = 20 * Math.log10(ratio);
  const groundAbsorption = 0.5 * (Math.log(ratio) / Math.LN2); // log2(ratio)
  return sourceDbAt15M - geometricSpreading - groundAbsorption;
}

/** Get source dB(A) Leq at 15m for a building at a given date. */
export function getConstructionSourceDb(
  building: {
    id?: string;
    position?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
    timeline?: { startDate?: string; durationDays?: number; zoneType?: string };
  },
  timelineDate: string
): number {
  if (!building.timeline?.startDate || !building.timeline?.durationDays) {
    // Fallback: moderate commercial excavation
    return computeSiteLeq(PHASE_EQUIPMENT.commercial.excavation);
  }

  const start = new Date(building.timeline.startDate).getTime();
  const durationMs = building.timeline.durationDays * 24 * 60 * 60 * 1000;
  const now = new Date(timelineDate).getTime();
  const elapsed = now - start;
  const progress = Math.max(0, Math.min(1, elapsed / durationMs));

  const category = zoneToConstructionCategory(building.timeline.zoneType);
  const phase = phaseFromProgress(progress);
  const equipment = PHASE_EQUIPMENT[category][phase];
  const siteLeq = computeSiteLeq(equipment);

  // ±3 dB seeded weekly jitter
  const weekIndex = Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000));
  const seed = `${building.id ?? "b"}-${timelineDate}-${weekIndex}`;
  const jitter = (seededRandom(seed) - 0.5) * 6; // -3 to +3 dB

  return siteLeq + jitter;
}

/** Check if a building is under construction on the given date */
export function isUnderConstruction(
  startDate: string,
  durationDays: number,
  currentDate: string
): boolean {
  const start = new Date(startDate).getTime();
  const end = start + durationDays * 24 * 60 * 60 * 1000;
  const now = new Date(currentDate).getTime();
  return now >= start && now <= end;
}

/** Construction progress 0–1 at a given date. 0 = just started, 1 = completed or past end. */
export function getConstructionProgress(
  startDate: string,
  durationDays: number,
  currentDate: string
): number {
  const start = new Date(startDate).getTime();
  const durationMs = durationDays * 24 * 60 * 60 * 1000;
  const now = new Date(currentDate).getTime();
  const elapsed = now - start;
  return Math.max(0, Math.min(1, elapsed / durationMs));
}

/** Distance between two points in world space (XZ plane) */
export function distance2D(
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  return Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2);
}

/** DB contour ring radii for visualization (distances where dB drops to these levels) */
export const DB_CONTOURS = [
  { db: 95, label: "95 dB" },
  { db: 80, label: "80 dB" },
  { db: 65, label: "65 dB" },
  { db: 50, label: "50 dB" },
] as const;

/** Get distance (m) at which noise drops to target dB (from 15m reference) */
export function distanceForDb(
  targetDb: number,
  sourceDbAt15M: number
): number {
  if (targetDb >= sourceDbAt15M) return 0;
  // Approximate: ignore ground absorption for contour estimation
  return REFERENCE_DISTANCE_M * Math.pow(10, (sourceDbAt15M - targetDb) / 20);
}

/** Max expected site dB for visualization normalization */
export const MAX_EXPECTED_SITE_DB = 100;

/**
 * Representative source dB at 15m for the peak (structural/foundation) phase.
 * Used by stakeholder module for worst-case noise assessment.
 */
export function getRepresentativeSourceDb(zoneType?: string, _heightM?: number): number {
  const category = zoneToConstructionCategory(zoneType);
  // Use foundation phase as peak (pile driving is loudest when present)
  const foundationLeq = computeSiteLeq(PHASE_EQUIPMENT[category].foundation);
  const structuralLeq = computeSiteLeq(PHASE_EQUIPMENT[category].structural);
  return Math.max(foundationLeq, structuralLeq);
}

// ─── WHO/Miedema Annoyance Curve ────────────────────────────────────────────

/**
 * Percent of population highly annoyed at a given outdoor dB(A) level.
 * Based on WHO/Miedema dose-response for construction noise.
 * 0% below 42 dB, quadratic ramp, capped at 100%.
 */
function dbToAnnoyancePercent(db: number): number {
  if (db <= 42) return 0;
  const delta = db - 42;
  const annoyance = 0.035 * delta * delta + 0.15 * delta;
  return Math.min(100, annoyance);
}

/**
 * Population happiness: 0-100. Uses WHO/Miedema annoyance curve.
 * Multiple sources combine via logarithmic addition.
 */
export function computeHappinessScore(
  placedBuildings: Array<{
    id?: string;
    position: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
    timeline?: { startDate?: string; durationDays?: number; zoneType?: string };
  }>,
  timelineDate: string,
  sampleCount = 64
): { score: number; avgDb: number; activeCount: number } {
  const active = placedBuildings.filter(
    (b) =>
      b.timeline?.startDate &&
      b.timeline?.durationDays &&
      isUnderConstruction(
        b.timeline.startDate,
        b.timeline.durationDays,
        timelineDate
      )
  );

  if (active.length === 0) {
    return { score: 100, avgDb: 0, activeCount: 0 };
  }

  const min = -1500;
  const max = 1500;
  const step = (max - min) / Math.sqrt(sampleCount);
  let totalAnnoyance = 0;
  let totalDb = 0;
  let count = 0;

  for (let x = min; x <= max; x += step) {
    for (let z = min; z <= max; z += step) {
      // Logarithmic addition of all sources at this point
      let sumLinear = 0;
      for (const b of active) {
        const sourceDb = getConstructionSourceDb(b, timelineDate);
        const d = distance2D(x, z, b.position.x, b.position.z);
        const db = dbAtDistanceMeters(d, sourceDb);
        if (db > 0) {
          sumLinear += Math.pow(10, db / 10);
        }
      }
      if (sumLinear > 0) {
        const combinedDb = 10 * Math.log10(sumLinear);
        totalDb += combinedDb;
        totalAnnoyance += dbToAnnoyancePercent(combinedDb);
        count++;
      }
    }
  }

  const avgDb = count > 0 ? totalDb / count : 0;
  const avgAnnoyance = count > 0 ? totalAnnoyance / count : 0;
  const score = Math.max(0, Math.min(100, 100 - avgAnnoyance));

  return {
    score: Math.round(score),
    avgDb: Math.round(avgDb * 10) / 10,
    activeCount: active.length,
  };
}
