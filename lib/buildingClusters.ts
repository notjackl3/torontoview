import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { Building } from "./buildingData";

type BBox = [number, number, number, number]; // [west, south, east, north]

export interface BuildingCluster {
  id: string; // canonical cluster ID = smallest-index member's building ID
  buildingIds: string[];
  center: [number, number]; // [lng, lat]
  bbox: BBox;
}

export interface BuildingClusterIndex {
  clusters: BuildingCluster[];
  clusterIdByBuildingId: Map<string, string>;
  clusterById: Map<string, BuildingCluster>;
}

const CELL_SIZE = 0.0005; // ~50m at Toronto's latitude

function cellsForBBox(bb: BBox): string[] {
  const minCx = Math.floor(bb[0] / CELL_SIZE);
  const maxCx = Math.floor(bb[2] / CELL_SIZE);
  const minCy = Math.floor(bb[1] / CELL_SIZE);
  const maxCy = Math.floor(bb[3] / CELL_SIZE);
  const out: string[] = [];
  for (let cx = minCx; cx <= maxCx; cx++) {
    for (let cy = minCy; cy <= maxCy; cy++) {
      out.push(`${cx},${cy}`);
    }
  }
  return out;
}

function bboxOf(footprint: [number, number][]): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of footprint) {
    if (lng < w) w = lng;
    if (lat < s) s = lat;
    if (lng > e) e = lng;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
}

export function computeBuildingClusters(buildings: Building[]): BuildingClusterIndex {
  const n = buildings.length;
  if (n === 0) {
    return {
      clusters: [],
      clusterIdByBuildingId: new Map(),
      clusterById: new Map(),
    };
  }

  const t0 = performance.now();
  const bboxes: BBox[] = buildings.map((b) => bboxOf(b.footprint));
  const polys: Feature<Polygon>[] = buildings.map((b) =>
    turf.polygon([b.footprint]),
  );

  const grid = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const k of cellsForBBox(bboxes[i])) {
      const arr = grid.get(k);
      if (arr) arr.push(i);
      else grid.set(k, [i]);
    }
  }

  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Lower index becomes root → stable canonical cluster ID
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  }

  const checked = new Set<number>(); // packed pair key
  for (const indices of grid.values()) {
    for (let a = 0; a < indices.length; a++) {
      const i = indices[a];
      for (let b = a + 1; b < indices.length; b++) {
        const j = indices[b];
        const lo = i < j ? i : j;
        const hi = i < j ? j : i;
        const key = lo * n + hi;
        if (checked.has(key)) continue;
        checked.add(key);
        if (!bboxesOverlap(bboxes[lo], bboxes[hi])) continue;
        if (turf.booleanIntersects(polys[lo], polys[hi])) {
          union(lo, hi);
        }
      }
    }
  }

  const clusterMembers = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = clusterMembers.get(root);
    if (arr) arr.push(i);
    else clusterMembers.set(root, [i]);
  }

  const clusters: BuildingCluster[] = [];
  const clusterIdByBuildingId = new Map<string, string>();
  const clusterById = new Map<string, BuildingCluster>();

  for (const [rootIdx, memberIdxs] of clusterMembers.entries()) {
    const rootId = buildings[rootIdx].id;
    let cw = Infinity, cs = Infinity, ce = -Infinity, cn = -Infinity;
    for (const idx of memberIdxs) {
      const bb = bboxes[idx];
      if (bb[0] < cw) cw = bb[0];
      if (bb[1] < cs) cs = bb[1];
      if (bb[2] > ce) ce = bb[2];
      if (bb[3] > cn) cn = bb[3];
    }
    const cluster: BuildingCluster = {
      id: rootId,
      buildingIds: memberIdxs.map((i) => buildings[i].id),
      center: [(cw + ce) / 2, (cs + cn) / 2],
      bbox: [cw, cs, ce, cn],
    };
    clusters.push(cluster);
    clusterById.set(rootId, cluster);
    for (const idx of memberIdxs) {
      clusterIdByBuildingId.set(buildings[idx].id, rootId);
    }
  }

  const dt = performance.now() - t0;
  console.log(
    `🧩 Clustered ${n} buildings → ${clusters.length} groups in ${dt.toFixed(0)}ms`,
  );

  return { clusters, clusterIdByBuildingId, clusterById };
}
