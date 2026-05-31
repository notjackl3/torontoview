/**
 * Toronto waterbodies + watercourses layer. Reads pre-filtered local data
 * written by scripts/import-toronto-layers.ts; for the downtown bbox this is
 * mainly the Lake Ontario shoreline arc plus a couple of inland ponds.
 *
 * Lake Ontario's polygon is the entire lake (~thousands of vertices). To
 * keep the mesh tiny we clip it to an extended bbox around downtown before
 * triangulating.
 */
import * as THREE from "three";
import { CityProjection } from "./projection";

type Ring = [number, number][];

interface WaterbodyFeature {
  id: number;
  name: string;
  polygons: Ring[][];
}

interface WatercourseFeature {
  id: number;
  name: string;
  line: [number, number][];
}

const WATERBODY_COLOR = 0x2a6da3;
const WATERLINE_COLOR = 0x3a8ad0;

// Extended bbox for Lake Ontario clipping — anything beyond this is offscreen
// for the downtown camera anyway.
const CLIP_BBOX = {
  south: 43.58,
  north: 43.67,
  west: -79.42,
  east: -79.34,
};

function clipRingToBbox(ring: Ring): Ring {
  // Simple Sutherland–Hodgman clip against the 4 bbox edges. Good enough for
  // a roughly-rectangular clip of a city-scale polygon.
  let out: Ring = ring.slice();
  out = clipEdge(out, (p) => p[0] >= CLIP_BBOX.west, (a, b) =>
    intersect(a, b, "x", CLIP_BBOX.west)
  );
  out = clipEdge(out, (p) => p[0] <= CLIP_BBOX.east, (a, b) =>
    intersect(a, b, "x", CLIP_BBOX.east)
  );
  out = clipEdge(out, (p) => p[1] >= CLIP_BBOX.south, (a, b) =>
    intersect(a, b, "y", CLIP_BBOX.south)
  );
  out = clipEdge(out, (p) => p[1] <= CLIP_BBOX.north, (a, b) =>
    intersect(a, b, "y", CLIP_BBOX.north)
  );
  return out;
}

function clipEdge(
  ring: Ring,
  inside: (p: [number, number]) => boolean,
  cut: (a: [number, number], b: [number, number]) => [number, number]
): Ring {
  if (ring.length === 0) return ring;
  const out: Ring = [];
  let prev = ring[ring.length - 1];
  let prevIn = inside(prev);
  for (const cur of ring) {
    const curIn = inside(cur);
    if (curIn) {
      if (!prevIn) out.push(cut(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(cut(prev, cur));
    }
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

function intersect(
  a: [number, number],
  b: [number, number],
  axis: "x" | "y",
  v: number
): [number, number] {
  if (axis === "x") {
    const t = (v - a[0]) / (b[0] - a[0]);
    return [v, a[1] + t * (b[1] - a[1])];
  } else {
    const t = (v - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), v];
  }
}

function ringToShape(ring: Ring): THREE.Shape | null {
  if (ring.length < 3) return null;
  const shape = new THREE.Shape();
  const p0 = CityProjection.projectToWorld(ring[0]);
  shape.moveTo(p0.x, p0.z);
  for (let i = 1; i < ring.length; i++) {
    const p = CityProjection.projectToWorld(ring[i]);
    shape.lineTo(p.x, p.z);
  }
  shape.closePath();
  return shape;
}

export function renderWaterLayer(
  bodies: WaterbodyFeature[],
  lines: WatercourseFeature[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = "waterLayer";

  const HEIGHT_OFFSET = 0.2; // below parks (0.3) and roads (0.5)

  for (const body of bodies) {
    for (const poly of body.polygons) {
      const ring = clipRingToBbox(poly[0]);
      const shape = ringToShape(ring);
      if (!shape) continue;
      const geometry = new THREE.ShapeGeometry(shape);
      // Rotate the geometry (not the mesh) by +PI/2 around X so vertices
      // (X, Y, 0) land at (X, 0, Y) in world space, matching the building
      // pipeline. -PI/2 mesh rotation would mirror the polygon N–S.
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color: WATERBODY_COLOR,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = HEIGHT_OFFSET;
      mesh.userData.waterbodyName = body.name;
      mesh.userData.isWater = true;
      group.add(mesh);
    }
  }

  // Watercourses as wide line strips at ground level. Empty downtown, but
  // we render them anyway so the layer works elsewhere.
  for (const wc of lines) {
    const pts3: THREE.Vector3[] = wc.line.map(([lng, lat]) =>
      CityProjection.projectToWorld([lng, lat])
    );
    if (pts3.length < 2) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      pts3.map((p) => new THREE.Vector3(p.x, HEIGHT_OFFSET + 0.05, p.z))
    );
    const material = new THREE.LineBasicMaterial({
      color: WATERLINE_COLOR,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geometry, material);
    line.userData.watercourseName = wc.name;
    group.add(line);
  }

  console.log(
    `✅ Water layer: ${bodies.length} polygons, ${lines.length} lines`
  );
  return group;
}

export async function loadAndRenderWaterLayer(): Promise<THREE.Group | null> {
  try {
    const [bRes, lRes] = await Promise.all([
      fetch("/map-data/waterbodies.json", { cache: "force-cache" }),
      fetch("/map-data/watercourses.json", { cache: "force-cache" }),
    ]);
    const bodies = bRes.ok ? ((await bRes.json()) as WaterbodyFeature[]) : [];
    const lines = lRes.ok ? ((await lRes.json()) as WatercourseFeature[]) : [];
    return renderWaterLayer(bodies, lines);
  } catch (err) {
    console.error("Water layer load error:", err);
    return null;
  }
}
