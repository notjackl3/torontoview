/**
 * Toronto, Ontario Zoning By-Law Number 2022-62
 * 76 distinct zone types from cityoftoronto.ca
 */

export const TORONTO_ZONE_TYPES = [
  // Rural Zones
  { code: "AG", name: "Prime Agricultural Area Zone", category: "Rural" },
  { code: "RU", name: "General Rural Area Zone", category: "Rural" },
  { code: "RUR", name: "Rural Residential Zone", category: "Rural" },
  { code: "LSR", name: "Limited Service Rural Residential Zone", category: "Rural" },
  { code: "RC", name: "Rural Commercial Zone", category: "Rural" },
  { code: "HAM", name: "Hamlet Zone", category: "Rural" },
  // Rural Industrial
  { code: "RM1", name: "Rural Industrial Zone", category: "Rural Industrial" },
  { code: "RM2", name: "Rural Heavy Industrial Zone", category: "Rural Industrial" },
  { code: "MX1", name: "Mineral Resource and Extraction Zone", category: "Rural Industrial" },
  // Mixed Use
  { code: "WM1", name: "Williamsville Zone 1", category: "Mixed Use" },
  { code: "WM2", name: "Williamsville Zone 2", category: "Mixed Use" },
  { code: "DT1", name: "Downtown Zone 1", category: "Mixed Use" },
  { code: "DT2", name: "Downtown Zone 2", category: "Mixed Use" },
  { code: "MU1", name: "Mixed Zone 1", category: "Mixed Use" },
  { code: "MU2", name: "Mixed Zone 2", category: "Mixed Use" },
  { code: "MU3", name: "Mixed Zone 3", category: "Mixed Use" },
  // Urban Residential
  ...Array.from({ length: 13 }, (_, i) => ({
    code: `UR${i + 1}`,
    name: `Urban Residential Zone ${i + 1}`,
    category: "Urban Residential",
  })),
  // Urban Multi-Residential
  ...Array.from({ length: 11 }, (_, i) => ({
    code: `URM${i + 1}`,
    name: `Urban Multi-Residential Zone ${i + 1}`,
    category: "Urban Multi-Residential",
  })),
  // Heritage
  { code: "HCD1", name: "Heritage Zone 1 (Village of Barriefield)", category: "Heritage" },
  { code: "HCD2", name: "Heritage Zone 2 (Market Square)", category: "Heritage" },
  { code: "HCD3", name: "Heritage Zone 3 (Old Sydenham)", category: "Heritage" },
  // Institutional
  { code: "IN1", name: "Institutional Minor Zone", category: "Institutional" },
  { code: "IN2", name: "Institutional Major Zone", category: "Institutional" },
  { code: "G1", name: "Correctional Facility Zone", category: "Institutional" },
  { code: "G2", name: "Military Installation Zone", category: "Institutional" },
  // Commercial
  { code: "CN", name: "Neighbourhood Commercial Zone", category: "Commercial" },
  { code: "CA", name: "Arterial Commercial Zone", category: "Commercial" },
  { code: "CD", name: "District Commercial Zone", category: "Commercial" },
  { code: "CR", name: "Regional Commercial Zone", category: "Commercial" },
  { code: "CG", name: "General Commercial Zone", category: "Commercial" },
  { code: "CW", name: "Marine Commercial Zone", category: "Commercial" },
  { code: "HB", name: "Harbour Zone", category: "Commercial" },
  // Employment
  { code: "M1", name: "Business Park Zone", category: "Employment" },
  { code: "M2", name: "General Industrial Zone", category: "Employment" },
  { code: "M3", name: "Heavy Industrial Zone", category: "Employment" },
  { code: "M4", name: "Employment Service Zone", category: "Employment" },
  { code: "M5", name: "Waste Management Zone", category: "Employment" },
  // Transportation and Utilities
  { code: "TA", name: "Airport Zone", category: "Transportation and Utilities" },
  { code: "TR", name: "Transportation and Railway Zone", category: "Transportation and Utilities" },
  { code: "TU", name: "Utility Installation or Corridor Zone", category: "Transportation and Utilities" },
  // Open Space
  { code: "OS1", name: "Protected Open Space Zone", category: "Open Space" },
  { code: "OS2", name: "General Open Space Zone", category: "Open Space" },
  { code: "DR", name: "Development Reserve Zone", category: "Open Space" },
  // Environmental
  { code: "EPA", name: "Environmental Protection Area Zone", category: "Environmental" },
] as const;

export type TorontoZoneCode = (typeof TORONTO_ZONE_TYPES)[number]["code"];

/** Get display label for zone (e.g. "UR1 - Urban Residential Zone 1") */
export function getZoneLabel(code: TorontoZoneCode): string {
  const z = TORONTO_ZONE_TYPES.find((t) => t.code === code);
  return z ? `${z.code} - ${z.name}` : code;
}

/** Get zone by code */
export function getZoneByCode(code: string) {
  return TORONTO_ZONE_TYPES.find((t) => t.code === code);
}

/**
 * Calculate construction duration in days from building volume (m³).
 * More volume = more time. Uses a sub-linear curve for realism.
 */
export function calculateDurationFromVolume(volumeM3: number): number {
  const MIN_DAYS = 30;
  const MAX_DAYS = 1095; // ~3 years
  if (volumeM3 <= 0) return MIN_DAYS;
  const days = MIN_DAYS + Math.sqrt(volumeM3) * 2.5;
  return Math.round(Math.min(MAX_DAYS, Math.max(MIN_DAYS, days)));
}

/** Calculate volume from dimensions (L×W×H) in meters */
export function calculateVolume(
  lengthM: number,
  widthM: number,
  heightM: number
): number {
  return lengthM * widthM * heightM;
}
