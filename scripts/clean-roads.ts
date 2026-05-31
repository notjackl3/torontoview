/**
 * Clean roads.json so the network renders without "broken" floating
 * segments and visible gaps at intersections.
 *
 * Two passes:
 *
 *  1) Snap-merge node pairs whose positions are within SNAP_M meters of
 *     each other. OSM source data routinely has two ways meet at an
 *     intersection without sharing a node id (mappers add a 0.5–3 m offset
 *     between separately-edited ways), and the renderer draws each way
 *     using its own endpoint coordinates — leaving a small but visible
 *     gap. Merging coincident endpoints onto a single position closes
 *     those gaps without touching connectivity that already works.
 *
 *  2) Drop edges that are still fully isolated after snapping — i.e. both
 *     endpoints have no other way attached. Almost always these are
 *     fragments left behind when the original Overpass fetch bbox clipped
 *     a longer way mid-block. They render as floating short segments and
 *     mislead the routing graph.
 *
 *  3) Drop very short (<8 m) dangling stubs — service driveways, parking
 *     entrances, ramp fragments. The renderer already skipped these at
 *     draw time but the routing graph still walked them; cleaning the
 *     data lets the rest of the pipeline benefit too.
 *
 * Existing well-connected geometry is left untouched. Re-run anytime
 * roads.json is rebuilt from raw OSM.
 *
 * Run with: npx tsx scripts/clean-roads.ts
 */

import * as fs from "fs";
import * as path from "path";

interface RoadNode {
  id: string;
  position: [number, number];
  type: "intersection" | "spawn" | "destination" | "parking";
  connectedEdges: string[];
}

interface RoadEdge {
  id: string;
  from: string;
  to: string;
  geometry: [number, number][];
  length: number;
  speedLimit: number;
  lanes: number;
  oneway: boolean;
  name?: string;
}

interface RoadNetwork {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

const FILE = path.join(process.cwd(), "public", "map-data", "roads.json");
const SNAP_M = 6; // merge node pairs closer than this
const STUB_M = 20; // drop dangling stubs shorter than this
const DEGENERATE_M = 3; // drop edges whose end-to-end geom is shorter than this

function haversineMeters(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const la1 = toRad(a[1]);
  const la2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function stripReverse(id: string): string {
  return id.replace(/-reverse$/, "");
}

function main() {
  const net = JSON.parse(fs.readFileSync(FILE, "utf8")) as RoadNetwork;
  const startNodes = net.nodes.length;
  const startEdges = net.edges.length;

  // ─── 1. Snap-merge close node pairs ────────────────────────────────────
  // Union-find over node ids. Buckets keep the pair scan O(n).
  const parent = new Map<string, string>();
  for (const n of net.nodes) parent.set(n.id, n.id);
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // Path compression
    let cur = x;
    while (parent.get(cur) !== r) {
      const nxt = parent.get(cur)!;
      parent.set(cur, r);
      cur = nxt;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a),
      rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const BUCKET = 0.0001; // ~11 m, comfortably wider than SNAP_M
  const buckets = new Map<string, RoadNode[]>();
  for (const n of net.nodes) {
    const [lng, lat] = n.position;
    const key = `${Math.floor(lng / BUCKET)}|${Math.floor(lat / BUCKET)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(n);
  }
  let snapPairs = 0;
  for (const n of net.nodes) {
    const [lng, lat] = n.position;
    const bx = Math.floor(lng / BUCKET);
    const by = Math.floor(lat / BUCKET);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = buckets.get(`${bx + dx}|${by + dy}`);
        if (!arr) continue;
        for (const m of arr) {
          if (m.id <= n.id) continue;
          if (haversineMeters(n.position, m.position) < SNAP_M) {
            union(n.id, m.id);
            snapPairs++;
          }
        }
      }
    }
  }

  // For each merge group, pick a representative id (the one with the most
  // existing connections — keeps connectedEdges arrays maximally intact)
  // and average the position.
  const groups = new Map<string, RoadNode[]>();
  for (const n of net.nodes) {
    const r = find(n.id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(n);
  }
  const idRemap = new Map<string, string>();
  const mergedNodes: RoadNode[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      mergedNodes.push(group[0]);
      idRemap.set(group[0].id, group[0].id);
      continue;
    }
    // Representative: most-connected node, tie-break by id.
    const rep = group.reduce((best, n) =>
      n.connectedEdges.length > best.connectedEdges.length ? n : best,
    );
    let sx = 0,
      sy = 0;
    for (const n of group) {
      sx += n.position[0];
      sy += n.position[1];
    }
    const avg: [number, number] = [sx / group.length, sy / group.length];
    const allEdges = new Set<string>();
    for (const n of group) {
      idRemap.set(n.id, rep.id);
      for (const eid of n.connectedEdges) allEdges.add(eid);
    }
    mergedNodes.push({
      id: rep.id,
      position: avg,
      type: rep.type,
      connectedEdges: Array.from(allEdges),
    });
  }

  // Rewrite edge endpoints + endpoint geometry to use the merged node id
  // and its averaged position. Interior vertices of the edge geometry are
  // left as-is — only the join points needed to move.
  const mergedNodePos = new Map<string, [number, number]>();
  for (const n of mergedNodes) mergedNodePos.set(n.id, n.position);

  const remappedEdges: RoadEdge[] = [];
  for (const e of net.edges) {
    const newFrom = idRemap.get(e.from) ?? e.from;
    const newTo = idRemap.get(e.to) ?? e.to;
    const geom: [number, number][] = e.geometry.map((p) => [p[0], p[1]]);
    const fromPos = mergedNodePos.get(newFrom);
    const toPos = mergedNodePos.get(newTo);
    if (fromPos) geom[0] = [fromPos[0], fromPos[1]];
    if (toPos) geom[geom.length - 1] = [toPos[0], toPos[1]];
    // Recompute polyline length — the recorded `length` was taken before the
    // snap-merge moved endpoints; otherwise short edges that just collapsed
    // would still claim their original length and slip past the stub filter.
    let recomputed = 0;
    for (let i = 1; i < geom.length; i++) {
      recomputed += haversineMeters(geom[i - 1], geom[i]);
    }
    remappedEdges.push({
      ...e,
      from: newFrom,
      to: newTo,
      geometry: geom,
      length: recomputed,
    });
  }

  // ─── 1b. Drop near-duplicate parallel ways ─────────────────────────────
  // OSM occasionally has two ways drawn at almost the same location (e.g.
  // a mapper added a new way without deleting the old one). Detect pairs
  // of *different base ways* whose midpoints are within DUPE_PARALLEL_M
  // and whose bearings agree within DUPE_ANGLE_DEG (treating opposite
  // bearings as the same line). Drop the higher-id base way — purely a
  // tie-break so the result is deterministic.
  const DUPE_PARALLEL_M = 6;
  const DUPE_ANGLE_DEG = 12;
  const fwd = remappedEdges.filter(
    (e) => !e.id.endsWith("-reverse") && e.geometry.length >= 2,
  );
  function midOf(g: [number, number][]) {
    return g[Math.floor(g.length / 2)];
  }
  function bearingOf(a: [number, number], b: [number, number]): number {
    const tr = (x: number) => (x * Math.PI) / 180;
    const dLng = tr(b[0] - a[0]);
    const la1 = tr(a[1]);
    const la2 = tr(b[1]);
    const y = Math.sin(dLng) * Math.cos(la2);
    const x =
      Math.cos(la1) * Math.sin(la2) -
      Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }
  const duplicateBaseIds = new Set<string>();
  for (let i = 0; i < fwd.length; i++) {
    const ei = fwd[i];
    if (duplicateBaseIds.has(ei.id)) continue;
    const mi = midOf(ei.geometry);
    const bi = bearingOf(ei.geometry[0], ei.geometry[ei.geometry.length - 1]);
    for (let j = i + 1; j < fwd.length; j++) {
      const ej = fwd[j];
      if (duplicateBaseIds.has(ej.id)) continue;
      const mj = midOf(ej.geometry);
      if (Math.abs(mi[0] - mj[0]) > 0.0001) continue;
      if (Math.abs(mi[1] - mj[1]) > 0.0001) continue;
      if (haversineMeters(mi, mj) > DUPE_PARALLEL_M) continue;
      const bj = bearingOf(
        ej.geometry[0],
        ej.geometry[ej.geometry.length - 1],
      );
      const raw = Math.abs(bi - bj);
      const ang = Math.min(raw, Math.abs(raw - 180), Math.abs(raw - 360));
      if (ang > DUPE_ANGLE_DEG) continue;
      // Drop the higher way-id; keep the lower one (older / more canonical).
      const idi = parseInt(ei.id.replace(/^way-/, ""), 10);
      const idj = parseInt(ej.id.replace(/^way-/, ""), 10);
      duplicateBaseIds.add(idi > idj ? ei.id : ej.id);
    }
  }
  const remappedAfterDupes = remappedEdges.filter(
    (e) => !duplicateBaseIds.has(stripReverse(e.id)),
  );
  const droppedDuplicates = remappedEdges.length - remappedAfterDupes.length;

  // ─── 2. Drop fully isolated edges + short dangling stubs ───────────────
  // After snapping + dedupe, rebuild the "edges connected to each node"
  // view, then decide which edges to keep.
  const edgesAtNode = new Map<string, Set<string>>();
  for (const e of remappedAfterDupes) {
    const base = stripReverse(e.id);
    if (!edgesAtNode.has(e.from)) edgesAtNode.set(e.from, new Set());
    if (!edgesAtNode.has(e.to)) edgesAtNode.set(e.to, new Set());
    edgesAtNode.get(e.from)!.add(base);
    edgesAtNode.get(e.to)!.add(base);
  }

  let droppedIsolated = 0;
  let droppedStubs = 0;
  let droppedDegenerate = 0;
  const keptEdges: RoadEdge[] = [];
  for (const e of remappedAfterDupes) {
    // Degenerate: snap collapsed the edge or the source had from == to.
    // These render as zero-area triangles / one-pixel quads — the source of
    // the most visually obvious "broken" stubs.
    if (e.from === e.to || e.length < DEGENERATE_M) {
      droppedDegenerate++;
      continue;
    }
    const base = stripReverse(e.id);
    const fromNeighbors = new Set(edgesAtNode.get(e.from) ?? []);
    const toNeighbors = new Set(edgesAtNode.get(e.to) ?? []);
    fromNeighbors.delete(base);
    toNeighbors.delete(base);
    const fromDangles = fromNeighbors.size === 0;
    const toDangles = toNeighbors.size === 0;

    // Fully isolated: both endpoints have no other way attached.
    if (fromDangles && toDangles) {
      droppedIsolated++;
      continue;
    }
    // Short stub with at least one dangling endpoint: usually a clipped
    // ramp / service driveway / parking entrance. Threshold widened to 20 m
    // so the stubs that look like floating "ticks" in the map go away while
    // still preserving real short residential segments (a 20 m through-block
    // connector keeps both endpoints connected and survives this filter).
    if (e.length < STUB_M && (fromDangles || toDangles)) {
      droppedStubs++;
      continue;
    }
    keptEdges.push(e);
  }

  // ─── 3. Rebuild nodes' connectedEdges list against the kept edges ──────
  const finalEdgeIds = new Set(keptEdges.map((e) => e.id));
  const finalNodes: RoadNode[] = mergedNodes.map((n) => ({
    ...n,
    connectedEdges: n.connectedEdges.filter((eid) => finalEdgeIds.has(eid)),
  }));
  // Drop nodes that are no longer referenced by any edge.
  const referenced = new Set<string>();
  for (const e of keptEdges) {
    referenced.add(e.from);
    referenced.add(e.to);
  }
  const culledNodes = finalNodes.filter((n) => referenced.has(n.id));

  // Mark intersection nodes (>=3 connections) — matches loader logic.
  for (const n of culledNodes) {
    if (n.connectedEdges.length >= 3) n.type = "intersection";
  }

  const out: RoadNetwork = { nodes: culledNodes, edges: keptEdges };
  fs.writeFileSync(FILE, JSON.stringify(out));

  console.log("Roads cleanup complete:");
  console.log(`  Nodes:    ${startNodes} → ${culledNodes.length}`);
  console.log(`  Edges:    ${startEdges} → ${keptEdges.length}`);
  console.log(`  Snapped node pairs: ${snapPairs}`);
  console.log(`  Dropped near-duplicate parallel ways: ${droppedDuplicates}`);
  console.log(`  Dropped degenerate edges: ${droppedDegenerate}`);
  console.log(`  Dropped fully-isolated edges: ${droppedIsolated}`);
  console.log(`  Dropped short dangling stubs (<${STUB_M}m): ${droppedStubs}`);
}

main();
