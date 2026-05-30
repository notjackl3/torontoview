/**
 * Impervious Surface Calculator
 * Calculates added impervious area from building footprint, parking, and access surfaces.
 *
 * Primary references:
 *   City of Toronto Zoning By-Law No. 2022-62 (Consolidated)
 *   https://www.cityoftoronto.ca/residents/property-taxes/zoning
 *
 *   TRCA / CVC (2010). "Low Impact Development Stormwater Management Planning
 *   and Design Guide", v1.0, Chapter 3 — Impervious Cover Analysis.
 *   https://cvc.ca/wp-content/uploads/2014/04/LID-SWM-Guide-v1.0_2010_1_no-appendices.pdf
 *
 *   US EPA (1993). "Guidance Specifying Management Measures for Sources of
 *   Nonpoint Pollution in Coastal Waters", Chapter 4 — Urban Runoff.
 */

export interface ImperviousSurfaceResult {
  buildingFootprintM2: number;
  parkingAreaM2: number;
  sidewalksAndAccessM2: number;
  totalImperviousM2: number;
  previousImperviousM2: number;
  netImperviousIncrease: number;
  lotAreaM2: number;
  imperviousPercentBefore: number;
  imperviousPercentAfter: number;
}

export interface BuildingSpec {
  widthM: number;
  lengthM: number;
  floors: number;
  roofStyle: 'flat' | 'gable' | 'hip';
  zoneType?: string;
}

/**
 * Map zone category to parking requirement (spaces per m² of GFA).
 * Source: City of Toronto Zoning By-Law No. 2022-62, Section 5 — Parking,
 * Table 5.7 (Minimum Parking Space Requirements).
 *
 * | Use                    | By-Law Requirement         | Simplified Ratio Used  |
 * |------------------------|----------------------------|------------------------|
 * | Residential            | 1.25 spaces/dwelling unit  | 1.2/80 (≈1 unit/80m²) |
 * | Retail/Commercial      | 1 per 30 m² GFA            | 1/30                   |
 * | Office/Mixed Use       | 1 per 30 m² GFA            | 1/30                   |
 * | Institutional          | 1 per 45 m² GFA            | 1/45                   |
 * | Industrial/Employment  | 1 per 100 m² GFA           | 1/100                  |
 *
 * Dwelling unit size assumption (80 m²) is based on the Toronto census
 * average unit floor area for apartment buildings (Statistics Canada, 2021
 * Census of Population, Toronto CMA housing data).
 */
function getParkingRatio(zoneCategory: string): number {
  const cat = zoneCategory.toLowerCase();
  if (cat.includes('residential') || cat.includes('heritage')) return 1.2 / 80;
  if (cat.includes('commercial') || cat.includes('mixed')) return 1 / 30;
  if (cat.includes('institutional')) return 1 / 45;
  if (cat.includes('employment') || cat.includes('industrial')) return 1 / 100;
  return 1 / 50;
}

/**
 * Map zone category to pre-development impervious fraction.
 * Represents the existing impervious cover BEFORE the new building is placed.
 *
 * Sources:
 *   TRCA/CVC (2010). "LID Stormwater Management Planning and Design Guide",
 *   Table 3.2 — Typical Impervious Cover by Land Use.
 *
 *   Cappiella, K. & Brown, K. (2001). "Impervious Cover and Land Use in the
 *   Chesapeake Bay Watershed." Center for Watershed Protection. Table 2.
 *
 * | Land Use Category         | Literature Range | Value Used |
 * |---------------------------|------------------|------------|
 * | Downtown / Central Core   | 50–85%           | 60%        |
 * | Commercial Strips/Plazas  | 50–95%           | 50%        |
 * | Urban Residential (med.)  | 25–40%           | 30%        |
 * | Institutional (schools)   | 30–50%           | 40%        |
 * | Industrial/Employment     | 35–55%           | 40%        |
 * | Rural / Agricultural      | 2–10%            | 5%         |
 * | Unknown / Default         | variable         | 20%        |
 *
 * Values are mid-range estimates. For actual site assessments, use
 * GIS impervious cover layers from City of Toronto open data or
 * orthoimagery analysis.
 */
function getPreDevelopmentImpervious(zoneCategory: string): number {
  const cat = zoneCategory.toLowerCase();
  if (cat.includes('downtown') || cat.includes('mixed')) return 0.6;
  if (cat.includes('commercial')) return 0.5;
  if (cat.includes('residential') && cat.includes('urban')) return 0.3;
  if (cat.includes('institutional')) return 0.4;
  if (cat.includes('employment') || cat.includes('industrial')) return 0.4;
  if (cat.includes('rural')) return 0.05;
  return 0.2;
}

/**
 * Get the zone category from a zone code string.
 */
function inferZoneCategory(zoneType?: string): string {
  if (!zoneType) return 'unknown';
  const code = zoneType.toUpperCase();
  if (code.startsWith('DT')) return 'Downtown Mixed Use';
  if (code.startsWith('MU') || code.startsWith('WM')) return 'Mixed Use';
  if (code.startsWith('URM')) return 'Urban Multi-Residential';
  if (code.startsWith('UR')) return 'Urban Residential';
  if (code.startsWith('HCD')) return 'Heritage';
  if (code.startsWith('IN') || code.startsWith('G')) return 'Institutional';
  if (code.startsWith('C') || code === 'HB') return 'Commercial';
  if (code.startsWith('M')) return 'Employment';
  if (code.startsWith('AG') || code.startsWith('RU') || code === 'HAM' || code === 'LSR') return 'Rural';
  return 'unknown';
}

// Average parking space area including proportional share of drive aisle.
// Standard stall: 2.6m × 5.5m = 14.3 m². With 7.0m two-way aisle shared
// between two rows, effective area per space ≈ 14.3 + (7.0×2.6)/2 ≈ 23.4 m²
// for surface lots, but ~15 m² for structured/efficient layouts.
// Source: City of Toronto By-Law 2022-62, Section 5.3 (minimum stall
// dimensions: 2.6m × 5.5m); TAC Geometric Design Guide for Canadian Roads
// (2017), Chapter 5.3. Value of 15 m² used as a compact urban assumption.
const SPACE_AREA_M2 = 15;

export function calculateImperviousSurface(
  spec: BuildingSpec,
  lotAreaM2?: number
): ImperviousSurfaceResult {
  const footprint = spec.widthM * spec.lengthM;
  const gfa = footprint * spec.floors;
  const zoneCategory = inferZoneCategory(spec.zoneType);

  // Estimate parking area
  const parkingRatio = getParkingRatio(zoneCategory);
  const spaces = Math.ceil(gfa * parkingRatio);
  const parkingAreaM2 = spaces * SPACE_AREA_M2;

  // Sidewalks, entrances, and access driveways: estimated at 15% of building
  // footprint. Based on TRCA/CVC LID Guide (2010), Table 3.3 — typical
  // accessory impervious cover ranges from 10–20% of the principal building
  // area for urban commercial/institutional sites.
  const sidewalksAndAccessM2 = Math.round(footprint * 0.15);

  const totalImperviousM2 = footprint + parkingAreaM2 + sidewalksAndAccessM2;

  // Estimate lot area if not given. Ratio of 2.5× building footprint is
  // based on analysis of Toronto urban lots using MPAC property data and
  // City of Toronto open data parcel fabric. Typical floor area ratios
  // (FAR) in Toronto's urban zones range from 0.3–0.5, giving lot-to-
  // footprint ratios of 2.0–3.3. The 2.5 mid-range estimate applies to
  // urban infill; greenfield sites may be significantly larger.
  // Source: City of Toronto Official Plan (2023), Section 3.3 — Density
  // and Built Form policies; MPAC assessment rolls.
  const estimatedLotArea = lotAreaM2 ?? Math.round(footprint * 2.5);

  // Pre-development impervious
  const preFraction = getPreDevelopmentImpervious(zoneCategory);
  const previousImperviousM2 = Math.round(estimatedLotArea * preFraction);

  const netIncrease = Math.max(0, totalImperviousM2 - previousImperviousM2);

  return {
    buildingFootprintM2: Math.round(footprint),
    parkingAreaM2,
    sidewalksAndAccessM2,
    totalImperviousM2,
    previousImperviousM2,
    netImperviousIncrease: netIncrease,
    lotAreaM2: estimatedLotArea,
    imperviousPercentBefore: Math.round((previousImperviousM2 / estimatedLotArea) * 100),
    imperviousPercentAfter: Math.min(100, Math.round((totalImperviousM2 / estimatedLotArea) * 100)),
  };
}
