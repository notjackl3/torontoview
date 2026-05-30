/**
 * Water / Drainage Impact Module
 * Calculates stormwater runoff increase from placed buildings and suggests mitigations.
 */

export { calculateImperviousSurface, type ImperviousSurfaceResult, type BuildingSpec } from './imperviousSurface';
export { calculateRunoff, TORONTO_STORMS, type RunoffResult, type StormScenario } from './runoffModel';
export { suggestMitigations, calculateOffsetPercent, type MitigationMeasure } from './mitigationSuggestions';

import { calculateImperviousSurface, type BuildingSpec } from './imperviousSurface';
import { calculateRunoff } from './runoffModel';
import { suggestMitigations, calculateOffsetPercent } from './mitigationSuggestions';
import type { ImperviousSurfaceResult } from './imperviousSurface';
import type { RunoffResult } from './runoffModel';
import type { MitigationMeasure } from './mitigationSuggestions';

export interface DrainageAnalysis {
  surface: ImperviousSurfaceResult;
  runoff: RunoffResult[];
  mitigations: MitigationMeasure[];
  offsetPercent: number;
}

/**
 * Run full drainage analysis for a single building.
 */
export function analyzeDrainage(spec: BuildingSpec): DrainageAnalysis {
  const surface = calculateImperviousSurface(spec);

  const fractionBefore = surface.imperviousPercentBefore / 100;
  const fractionAfter = surface.imperviousPercentAfter / 100;

  const runoff = calculateRunoff(surface.lotAreaM2, fractionBefore, fractionAfter);
  const mitigations = suggestMitigations(surface, runoff, spec.roofStyle);

  const designStorm = runoff[0];
  const offsetPercent = designStorm
    ? calculateOffsetPercent(mitigations, designStorm.runoffVolumeIncreaseL)
    : 100;

  return { surface, runoff, mitigations, offsetPercent };
}

/**
 * Run drainage analysis for multiple buildings and aggregate results.
 */
export function analyzeMultipleDrainage(specs: BuildingSpec[]): {
  buildings: DrainageAnalysis[];
  totals: {
    totalImperviousM2: number;
    totalNetIncreaseM2: number;
    totalRunoffIncreaseL_2yr: number;
    totalRunoffIncreaseL_100yr: number;
    totalPeakFlowIncreaseLps_2yr: number;
    avgOffsetPercent: number;
  };
} {
  const buildings = specs.map(analyzeDrainage);

  const totals = {
    totalImperviousM2: buildings.reduce((s, b) => s + b.surface.totalImperviousM2, 0),
    totalNetIncreaseM2: buildings.reduce((s, b) => s + b.surface.netImperviousIncrease, 0),
    totalRunoffIncreaseL_2yr: buildings.reduce((s, b) => s + (b.runoff[0]?.runoffVolumeIncreaseL ?? 0), 0),
    totalRunoffIncreaseL_100yr: buildings.reduce((s, b) => {
      const storm100 = b.runoff.find(r => r.returnPeriod === '100-year');
      return s + (storm100?.runoffVolumeIncreaseL ?? 0);
    }, 0),
    totalPeakFlowIncreaseLps_2yr: buildings.reduce((s, b) => s + (b.runoff[0]?.peakFlowIncreaseLps ?? 0), 0),
    avgOffsetPercent: buildings.length > 0
      ? Math.round(buildings.reduce((s, b) => s + b.offsetPercent, 0) / buildings.length)
      : 100,
  };

  return { buildings, totals };
}
