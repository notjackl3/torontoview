/**
 * Green Infrastructure Mitigation Suggestions
 * Recommends stormwater management measures based on runoff increase.
 *
 * Primary references:
 *   TRCA / CVC (2010). "Low Impact Development Stormwater Management Planning
 *   and Design Guide", Version 1.0. Chapters 4–8 (BMP Sizing & Design).
 *   https://cvc.ca/wp-content/uploads/2014/04/LID-SWM-Guide-v1.0_2010_1_no-appendices.pdf
 *
 *   Ontario Ministry of the Environment (MOE) (2003). "Stormwater Management
 *   Planning and Design Manual." Queen's Printer for Ontario.
 *
 *   National Research Council Canada (NRC) (2024). "Performance of Green
 *   Infrastructure in Canadian Climate Zones." NRC Construction Portfolio.
 *
 *   Cost data:
 *   TRCA (2021). "Assessment of Life Cycle Costs for Low Impact Development
 *   Stormwater Management Practices." Sustainable Technologies Evaluation Program.
 *   Adjusted to 2024 CAD using StatCan CPI (Construction) index.
 */

import type { ImperviousSurfaceResult } from './imperviousSurface';
import type { RunoffResult } from './runoffModel';

export interface MitigationMeasure {
  name: string;
  description: string;
  volumeReductionL: number;
  areaRequiredM2: number;
  costEstimateLow: number;
  costEstimateHigh: number;
  applicability: 'high' | 'medium' | 'low';
}

/**
 * Suggest mitigation measures scaled to the building and its runoff increase.
 * Uses the 2-year storm (first result) as the design target.
 */
export function suggestMitigations(
  surface: ImperviousSurfaceResult,
  runoffResults: RunoffResult[],
  roofStyle: 'flat' | 'gable' | 'hip'
): MitigationMeasure[] {
  // Use 2-year storm as primary design target
  const designStorm = runoffResults[0];
  if (!designStorm || designStorm.runoffVolumeIncreaseL <= 0) return [];

  const roofArea = surface.buildingFootprintM2;
  const parkingArea = surface.parkingAreaM2;
  const measures: MitigationMeasure[] = [];

  // 1. Green Roof
  // Retention: 15 mm per storm event for extensive green roofs (100mm substrate).
  // Source: NRC (2024) "Performance of Green Infrastructure in Canadian Climate
  // Zones" — measured retention for extensive green roofs in Toronto/Ottawa
  // climate zone ranges 10–25 mm per event (median ~15 mm for 1-hr storms).
  // Also consistent with TRCA LID Guide (2010), Table 4.6.1.
  //
  // Cost: $150–$400/m² (CAD 2024)
  // Source: TRCA "Life Cycle Costs for LID" (2021), adjusted to 2024 CAD.
  // Low = extensive sedum, high = intensive/native plantings with irrigation.
  // Green Roofs for Healthy Cities (2019) reports $130–$450/m² North American range.
  const greenRoofRetentionMm = 15;
  const greenRoofVolumeL = (greenRoofRetentionMm / 1000) * roofArea * 1000;
  measures.push({
    name: 'Green Roof',
    description: `Install extensive green roof (${roofArea} m² roof area). Retains ~15mm of rainfall per storm event with sedum/native plantings.`,
    volumeReductionL: Math.round(greenRoofVolumeL),
    areaRequiredM2: roofArea,
    costEstimateLow: roofArea * 150,
    costEstimateHigh: roofArea * 400,
    applicability: roofStyle === 'flat' ? 'high' : 'low',
  });

  // 2. Permeable Pavement (for parking)
  // Retention: 25 mm in the surface + base reservoir layer.
  // Source: TRCA/CVC LID Guide (2010), Section 4.7 — permeable pavement
  // with 150mm granular base provides 25–75 mm effective retention depending
  // on subgrade. 25 mm is conservative for HSG B/C soils with limited
  // infiltration. ICPI (Interlocking Concrete Pavement Institute) Tech Spec
  // 18 confirms 20–50 mm typical range.
  //
  // Cost: $80–$150/m² (CAD 2024)
  // Source: TRCA LID Life Cycle Cost Report (2021), adjusted to 2024.
  // Low = porous asphalt overlay, high = permeable interlocking concrete pavers.
  if (parkingArea > 0) {
    const permeableRetentionMm = 25;
    const permeableVolumeL = (permeableRetentionMm / 1000) * parkingArea * 1000;
    measures.push({
      name: 'Permeable Pavement',
      description: `Replace standard parking surface (${parkingArea} m²) with permeable interlocking pavers or porous asphalt.`,
      volumeReductionL: Math.round(permeableVolumeL),
      areaRequiredM2: parkingArea,
      costEstimateLow: parkingArea * 80,
      costEstimateHigh: parkingArea * 150,
      applicability: 'high',
    });
  }

  // 3. Rain Garden / Bioswale
  // Sizing: 7% of contributing impervious area.
  // Source: Ontario MOE Stormwater Management Manual (2003), Section 4.6.3 —
  // bioretention sizing at 5–10% of contributing drainage area to capture
  // the 25mm design storm. TRCA/CVC LID Guide (2010), Section 4.4 uses a
  // similar 5–7% rule-of-thumb for preliminary sizing. 7% is mid-range.
  //
  // Ponding depth: 150 mm
  // Source: TRCA/CVC LID Guide (2010), Table 4.4.3 — recommended maximum
  // ponding depth of 150–250 mm. 150 mm provides 48–72 hr drawdown on
  // HSG B soils per Ontario MOE criteria. Also consistent with City of
  // Toronto Stormwater Master Plan (2019) design standards.
  //
  // Cost: $30–$60/m² (CAD 2024)
  // Source: TRCA LID Life Cycle Cost Report (2021). Note: this is a
  // simplified rain garden; engineered bioretention cells with underdrains
  // typically cost $200–$400/m² per TRCA data.
  const rainGardenArea = Math.round(surface.totalImperviousM2 * 0.07);
  const rainGardenDepthMm = 150;
  const rainGardenVolumeL = (rainGardenDepthMm / 1000) * rainGardenArea * 1000;
  measures.push({
    name: 'Rain Garden / Bioswale',
    description: `Install bioretention garden (${rainGardenArea} m²) along building perimeter or parking edge. Filters and infiltrates runoff.`,
    volumeReductionL: Math.round(rainGardenVolumeL),
    areaRequiredM2: rainGardenArea,
    costEstimateLow: rainGardenArea * 30,
    costEstimateHigh: rainGardenArea * 60,
    applicability: 'high',
  });

  // 4. Underground Detention Tank
  // Sized to capture 100% of the design storm volume increase.
  // Depth assumption: 1.5m (standard StormTrap / CulTec chamber depth).
  // Source: TRCA/CVC LID Guide (2010), Section 4.9 — underground detention
  // systems typically 1.0–2.0m deep. Ontario MOE Manual (2003), Section 3.5.
  //
  // Cost: $500–$1,000/m³ (CAD 2024)
  // Source: TRCA LID Life Cycle Cost Report (2021) — subsurface detention
  // $400–$900/m³ (2021 CAD), adjusted to 2024. Range depends on system type:
  // low = corrugated HDPE chambers (e.g., StormTech), high = precast concrete
  // or StormTrap modular systems.
  const targetVolumeM3 = designStorm.runoffVolumeIncreaseL / 1000;
  measures.push({
    name: 'Underground Detention Tank',
    description: `Install subsurface detention system (${targetVolumeM3.toFixed(1)} m³) to store and slowly release stormwater. Best for constrained sites.`,
    volumeReductionL: designStorm.runoffVolumeIncreaseL,
    areaRequiredM2: Math.round(targetVolumeM3 / 1.5),
    costEstimateLow: Math.round(targetVolumeM3 * 500),
    costEstimateHigh: Math.round(targetVolumeM3 * 1000),
    applicability: 'medium',
  });

  // 5. Rainwater Harvesting Cistern
  // Sizing: roofArea × 0.015 m (= 15mm capture depth from roof), clamped
  // to 5–20 m³. This captures the first 15mm of roof runoff, consistent
  // with the green roof retention target and the TRCA "water balance"
  // approach (retain 5mm from all impervious areas).
  // Source: TRCA/CVC LID Guide (2010), Section 4.1 — Rainwater Harvesting.
  // Ontario Building Code (OBC) 2024, SB-1 Supplementary Standard for
  // rainwater collection systems.
  //
  // Cost: $1,000–$5,000 (CAD 2024, fixed range)
  // Source: TRCA LID Life Cycle Cost Report (2021). Range covers above-
  // ground polyethylene tanks ($1,000–$2,000 for 5 m³) to below-ground
  // concrete cisterns with pump systems ($3,000–$5,000 for 15–20 m³).
  //
  // Footprint: cisternVolume / 2 assumes a 2m-tall cylindrical tank.
  const cisternVolumeM3 = Math.min(20, Math.max(5, roofArea * 0.015));
  measures.push({
    name: 'Rainwater Harvesting',
    description: `Install ${cisternVolumeM3.toFixed(0)} m³ cistern to capture roof runoff for irrigation and non-potable uses.`,
    volumeReductionL: Math.round(cisternVolumeM3 * 1000),
    areaRequiredM2: Math.round(cisternVolumeM3 / 2),
    costEstimateLow: 1000,
    costEstimateHigh: 5000,
    applicability: 'medium',
  });

  // Sort: high applicability first, then by volume reduction descending
  const appOrder = { high: 0, medium: 1, low: 2 };
  measures.sort((a, b) => {
    const d = appOrder[a.applicability] - appOrder[b.applicability];
    if (d !== 0) return d;
    return b.volumeReductionL - a.volumeReductionL;
  });

  return measures;
}

/**
 * Calculate what percentage of the design storm runoff increase is offset
 * by a combination of mitigation measures.
 */
export function calculateOffsetPercent(
  measures: MitigationMeasure[],
  designStormVolumeIncreaseL: number
): number {
  if (designStormVolumeIncreaseL <= 0) return 100;
  const totalReduction = measures.reduce((sum, m) => sum + m.volumeReductionL, 0);
  return Math.min(100, Math.round((totalReduction / designStormVolumeIncreaseL) * 100));
}
