/**
 * Toronto parks / green-spaces layer. Renders polygons from the City of
 * Toronto "Green Spaces" dataset (pre-filtered to the downtown bbox in
 * public/map-data/parks.json by scripts/import-toronto-layers.ts).
 */
import * as THREE from "three";
import { CityProjection } from "./projection";

type Ring = [number, number][];

interface ParkFeature {
  id: number;
  name: string;
  cls: string;
  polygons: Ring[][]; // MultiPolygon: array of polygons; each polygon = [outer, hole, hole, …]
}

const COLOR_BY_CLASS: Record<string, number> = {
  PARK: 0x2f7a3a,
  GOLF_COURSE: 0x4ea061,
  CEMETERY: 0x5a6b4a,
  OTHER_CEMETERY: 0x5a6b4a,
  OTHER_OPEN_SPACE: 0x4a7349,
  AGRICULTURE: 0x7a8a3a,
};
const DEFAULT_COLOR = 0x3d8a4a;

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

export function renderParksLayer(parks: ParkFeature[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "parksLayer";

  const HEIGHT_OFFSET = 0.3; // sits between ground (0) and roads (0.5)

  for (const park of parks) {
    const color = COLOR_BY_CLASS[park.cls] ?? DEFAULT_COLOR;
    for (const poly of park.polygons) {
      // Each polygon = [outer, ...holes]. We render just the outer; holes
      // would need pathing through THREE.Path and aren't worth it for the
      // overhead-view scale of parks downtown.
      const shape = ringToShape(poly[0]);
      if (!shape) continue;
      const geometry = new THREE.ShapeGeometry(shape);
      // Rotate the geometry (not the mesh) by +PI/2 around X so vertices
      // (X, Y, 0) land at (X, 0, Y) in world space. This matches the
      // building extruder's `geometry.rotateX(Math.PI / 2)` — otherwise the
      // shape ends up mirrored N–S vs the buildings underneath.
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = HEIGHT_OFFSET;
      mesh.renderOrder = 5;
      mesh.userData.parkName = park.name;
      mesh.userData.isPark = true;
      group.add(mesh);
    }
  }

  console.log(`✅ Parks layer: ${parks.length} polygons rendered`);
  return group;
}

export async function loadAndRenderParksLayer(): Promise<THREE.Group | null> {
  try {
    const res = await fetch("/map-data/parks.json", { cache: "force-cache" });
    if (!res.ok) {
      console.warn("Parks fetch failed:", res.status);
      return null;
    }
    const data = (await res.json()) as ParkFeature[];
    return renderParksLayer(data);
  } catch (err) {
    console.error("Parks layer load error:", err);
    return null;
  }
}
