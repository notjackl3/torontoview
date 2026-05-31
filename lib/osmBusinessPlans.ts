const STORAGE_KEY = "tv:osm-plan-map";

type OsmPlanMap = Record<string, number>;

function readMap(): OsmPlanMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OsmPlanMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: OsmPlanMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

export function getOsmPlanId(osmBuildingId: string): number | undefined {
  return readMap()[osmBuildingId];
}

export function setOsmPlanId(osmBuildingId: string, planId: number) {
  const map = readMap();
  map[osmBuildingId] = planId;
  writeMap(map);
}

export interface OsmPlanEntry {
  osmBuildingId: string;
  planId: number;
}

export function listOsmPlans(): OsmPlanEntry[] {
  const map = readMap();
  return Object.entries(map)
    .map(([osmBuildingId, planId]) => ({ osmBuildingId, planId }))
    .sort((a, b) => a.planId - b.planId);
}
