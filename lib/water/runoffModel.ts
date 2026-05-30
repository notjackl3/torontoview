/**
 * SCS Curve Number Runoff Model
 * Estimates stormwater runoff using the USDA TR-55 method for Toronto, Ontario.
 *
 * Primary reference:
 *   USDA Natural Resources Conservation Service (1986). "Urban Hydrology for
 *   Small Watersheds" (Technical Release 55, TR-55), Chapter 2.
 *   https://www.nrcs.usda.gov/sites/default/files/2023-10/TR55.pdf
 *
 * Toronto climate data:
 *   Environment and Climate Change Canada (ECCC), Engineering Climate Datasets —
 *   IDF data for Toronto Pumping Station (Climate ID 6104175).
 *   https://climate-change.canada.ca/climate-data/short-duration-rainfall-intensity-duration-frequency
 *
 * Soil classification:
 *   Toronto sits on glacial till over Ordovician limestone. Dominant soils are
 *   Farmington and Napanee series clay-loams, classified as Hydrologic Soil Group
 *   B–C. HSG B is used here as a conservative (lower-runoff) assumption; actual
 *   site investigations may warrant HSG C in areas with heavier Napanee clay.
 *   Source: Ontario Institute of Pedology, "Soils of Frontenac County" (1989);
 *   OMAFRA Ontario Soil Survey Reports.
 */

export interface StormScenario {
  returnPeriod: string;
  rainfallMm: number;
}

export interface RunoffResult {
  returnPeriod: string;
  rainfallMm: number;
  cnBefore: number;
  cnAfter: number;
  runoffBeforeMm: number;
  runoffAfterMm: number;
  runoffIncreaseMm: number;
  /** Total volume increase over the lot in litres */
  runoffVolumeIncreaseL: number;
  /** Peak flow rate increase in L/s (Rational Method) */
  peakFlowIncreaseLps: number;
}

// ─── Curve Numbers ───────────────────────────────────────────────────
// Source: TR-55 Table 2-2a, Hydrologic Soil Group B
//
// | Cover type                         | CN (HSG B) |
// |------------------------------------|------------|
// | Impervious areas (paved, rooftops) | 98         |
// | Open space — good condition (>75%) | 61         |
// | Open space — fair condition (50-75%)| 69        |
// | Woods — good condition             | 55         |
// | Gravel roads                       | 76         |
//
// Note: CN_GRAVEL uses TR-55 Table 2-2a "Gravel" row for HSG B.
// Previously set to 82, corrected from the actual TR-55 table value.
const CN_IMPERVIOUS = 98;
const CN_GRASS = 61;
const CN_OPEN_FAIR = 69;
const CN_WOODS = 55;
const CN_GRAVEL = 76;

// ─── Toronto Design Storms (IDF Curves) ─────────────────────────────
// Source: ECCC IDF v3.20, Station "Toronto Pumping Station" (6104175)
// Duration: 1 hour. Values interpolated from published IDF table.
//
// | Return period | Rainfall (mm) | ECCC published range |
// |---------------|---------------|----------------------|
// | 2-year        | 25            | 22–27 mm             |
// | 10-year       | 38            | 35–41 mm             |
// | 25-year       | 47            | 44–50 mm             |
// | 100-year      | 60            | 56–65 mm             |
//
// These values use mid-range estimates from the ECCC dataset.
// For regulatory submissions, use site-specific IDF from:
// https://climate-change.canada.ca/climate-data/short-duration-rainfall-intensity-duration-frequency
export const TORONTO_STORMS: StormScenario[] = [
  { returnPeriod: '2-year', rainfallMm: 25 },
  { returnPeriod: '10-year', rainfallMm: 38 },
  { returnPeriod: '25-year', rainfallMm: 47 },
  { returnPeriod: '100-year', rainfallMm: 60 },
];

/**
 * Calculate weighted curve number for a mix of impervious and pervious surfaces.
 * Pervious portion assumed grass in good condition (CN=61).
 * Method: TR-55 Section 2, area-weighted CN (Equation 2-2).
 */
function weightedCN(imperviousFraction: number): number {
  const perviousFraction = 1 - imperviousFraction;
  return imperviousFraction * CN_IMPERVIOUS + perviousFraction * CN_GRASS;
}

/**
 * SCS runoff depth (mm) given precipitation P (mm) and curve number CN.
 * Q = (P - 0.2·S)² / (P + 0.8·S)  when P > Ia, else Q = 0
 * where S = (25400 / CN) − 254  and  Ia = 0.2·S
 *
 * Source: TR-55 Equation 2-3 (metric form).
 * The 0.2 initial abstraction ratio is the standard NRCS assumption;
 * NRCS updated guidance (2004) sometimes uses Ia = 0.05·S, but 0.2
 * remains the standard for municipal stormwater sizing in Ontario.
 */
function scsRunoff(rainfallMm: number, cn: number): number {
  if (cn <= 0 || cn > 100) return 0;
  const S = (25400 / cn) - 254;
  const Ia = 0.2 * S;
  if (rainfallMm <= Ia) return 0;
  const numerator = (rainfallMm - Ia) ** 2;
  const denominator = rainfallMm - Ia + S;
  return numerator / denominator;
}

/**
 * Peak flow using Rational Method: Q = C·i·A / 0.36
 * Source: Ontario Ministry of the Environment (MOE) Stormwater Management
 * Planning and Design Manual (2003), Section 3.2.
 *
 * C = runoff coefficient ≈ CN/100 (simplified; TR-55 Ch. 2)
 * i = rainfall intensity (mm/hr) — assumes 1-hour storm so i = rainfallMm
 * A = area in hectares
 * 0.36 = unit conversion factor (mm·ha → L/s)
 *
 * Note: The Rational Method is appropriate for small catchments (<25 ha).
 * For larger drainage areas, hydrograph methods (SCS Unit Hydrograph) are
 * required per Ontario MOE guidance.
 */
function peakFlowLps(cn: number, rainfallMmPerHr: number, areaM2: number): number {
  const C = cn / 100;
  const areaHa = areaM2 / 10000;
  return (C * rainfallMmPerHr * areaHa) / 0.36; // result in L/s
}

/**
 * Calculate runoff for all Toronto design storms.
 */
export function calculateRunoff(
  lotAreaM2: number,
  imperviousFractionBefore: number,
  imperviousFractionAfter: number,
  storms?: StormScenario[]
): RunoffResult[] {
  const scenarios = storms ?? TORONTO_STORMS;

  return scenarios.map((storm) => {
    const cnBefore = weightedCN(imperviousFractionBefore);
    const cnAfter = weightedCN(imperviousFractionAfter);

    const runoffBeforeMm = scsRunoff(storm.rainfallMm, cnBefore);
    const runoffAfterMm = scsRunoff(storm.rainfallMm, cnAfter);
    const runoffIncreaseMm = Math.max(0, runoffAfterMm - runoffBeforeMm);

    // Volume = depth (m) * area (m²) * 1000 L/m³
    const volumeIncreaseL = (runoffIncreaseMm / 1000) * lotAreaM2 * 1000;

    const peakBefore = peakFlowLps(cnBefore, storm.rainfallMm, lotAreaM2);
    const peakAfter = peakFlowLps(cnAfter, storm.rainfallMm, lotAreaM2);
    const peakIncrease = Math.max(0, peakAfter - peakBefore);

    return {
      returnPeriod: storm.returnPeriod,
      rainfallMm: storm.rainfallMm,
      cnBefore: Math.round(cnBefore),
      cnAfter: Math.round(cnAfter),
      runoffBeforeMm: Math.round(runoffBeforeMm * 10) / 10,
      runoffAfterMm: Math.round(runoffAfterMm * 10) / 10,
      runoffIncreaseMm: Math.round(runoffIncreaseMm * 10) / 10,
      runoffVolumeIncreaseL: Math.round(volumeIncreaseL),
      peakFlowIncreaseLps: Math.round(peakIncrease * 100) / 100,
    };
  });
}
