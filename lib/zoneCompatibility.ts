/**
 * Zone compatibility: Official Plan (ArcGIS) vs Zoning Bylaw (building types)
 * Warns when placing a building in a zone where that use is not permitted.
 */

import { getZoneByCode, type TorontoZoneCode } from "./torontoZoning";

const ARCGIS_MAPSERVER_BASE =
  "https://utility.arcgis.com/usrsvcs/servers/2c6aee2bcf524340a3c60a44b9f124a9/rest/services/Planning/OfficialPlan/MapServer";
const LAND_USE_LAYER_ID = 17;

/**
 * Fetch the Official Plan zone code (CODE) at a given point
 */
export async function fetchZoneAtPoint(
  lat: number,
  lng: number
): Promise<string | null> {
  const point = JSON.stringify({
    x: lng,
    y: lat,
    spatialReference: { wkid: 4326 },
  });

  const params = new URLSearchParams({
    where: "1=1",
    outFields: "CODE",
    returnGeometry: "false",
    geometry: point,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    f: "json",
  });

  try {
    const url = `${ARCGIS_MAPSERVER_BASE}/${LAND_USE_LAYER_ID}/query?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const features = data?.features;
    if (!features?.length) return null;
    return features[0]?.attributes?.CODE ?? null;
  } catch {
    return null;
  }
}

/**
 * Official Plan zone -> allowed Zoning Bylaw categories
 * Based on City of Toronto Official Plan land use designations
 */
const OP_ZONE_ALLOWED_CATEGORIES: Record<string, string[]> = {
  RES: ["Urban Residential", "Urban Multi-Residential", "Mixed Use", "Institutional", "Heritage"],
  MU: ["Mixed Use", "Urban Residential", "Urban Multi-Residential", "Commercial", "Institutional", "Heritage"],
  AC: ["Commercial", "Mixed Use", "Urban Multi-Residential"],
  CBD: ["Mixed Use", "Commercial", "Urban Multi-Residential", "Heritage"],
  DC: ["Commercial", "Mixed Use"],
  RC: ["Commercial", "Mixed Use"],
  MC: ["Commercial", "Mixed Use", "Urban Multi-Residential"],
  CN: ["Commercial", "Mixed Use", "Urban Residential"],
  BPI: ["Employment", "Commercial"],
  GI: ["Employment", "Rural Industrial"],
  RUI: ["Employment", "Rural Industrial"],
  RU: ["Rural", "Rural Residential", "Rural Commercial", "Hamlet"],
  AGGR: ["Rural"],
  AGR: ["Rural"],
  HAM: ["Rural", "Mixed Use", "Commercial"],
  RUC: ["Rural Commercial", "Commercial"],
  ER: ["Urban Residential", "Rural Residential"],
  OS: ["Open Space"],
  EPA: ["Environmental"],
  HA: ["Commercial", "Transportation and Utilities"],
  WA: ["Commercial", "Transportation and Utilities"],
  MAR: ["Commercial"],
  I: ["Institutional"],
  AIR: ["Transportation and Utilities"],
  MR: ["Rural Industrial"],
  WMI: ["Employment"],
  SECP: ["Mixed Use", "Urban Residential", "Commercial"],
};

const DEFAULT_ALLOWED = ["Mixed Use", "Urban Residential", "Commercial"];

function getAllowedCategories(opCode: string): string[] {
  const code = String(opCode || "").toUpperCase().trim();
  return OP_ZONE_ALLOWED_CATEGORIES[code] ?? DEFAULT_ALLOWED;
}

/**
 * Check if the selected zoning bylaw type is compatible with the Official Plan zone
 */
export function isZoneCompatible(
  officialPlanCode: string | null,
  zoningBylawCode: TorontoZoneCode
): boolean {
  if (!officialPlanCode) return true; // No zone data = allow (can't verify)
  const zone = getZoneByCode(zoningBylawCode);
  if (!zone) return true;
  const allowed = getAllowedCategories(officialPlanCode);
  return allowed.includes(zone.category);
}

/**
 * Get a warning message if the building type is not allowed in the zone
 */
export function getZoneCompatibilityWarning(
  officialPlanCode: string | null,
  zoningBylawCode: TorontoZoneCode
): string | null {
  if (!officialPlanCode) return null;
  if (isZoneCompatible(officialPlanCode, zoningBylawCode)) return null;
  const zone = getZoneByCode(zoningBylawCode);
  if (!zone) return null;
  return `This zone (${officialPlanCode}) typically does not permit ${zone.category} uses. This building may not comply with the Official Plan.`;
}
