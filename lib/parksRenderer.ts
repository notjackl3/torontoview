/**
 * Toronto parks / green-spaces layer. Renders polygons from the City of
 * Toronto "Green Spaces" dataset (pre-filtered to the downtown bbox in
 * public/map-data/parks.json by scripts/import-toronto-layers.ts).
 */
import * as THREE from "three";
import { CityProjection } from "./projection";
import { getTheme, type MapStyle } from "./mapTheme";

type Ring = [number, number][];

interface ParkFeature {
  id: number;
  name: string;
  cls: string;
  polygons: Ring[][]; // MultiPolygon: array of polygons; each polygon = [outer, hole, hole, …]
}

function colorForClass(cls: string, mapStyle: MapStyle): number {
  const p = getTheme(mapStyle).park;
  switch (cls) {
    case "PARK":
      return p.park;
    case "GOLF_COURSE":
      return p.golf;
    case "CEMETERY":
    case "OTHER_CEMETERY":
      return p.cemetery;
    case "OTHER_OPEN_SPACE":
      return p.openSpace;
    case "AGRICULTURE":
      return p.agriculture;
    default:
      return p.fallback;
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

export function renderParksLayer(
  parks: ParkFeature[],
  mapStyle: MapStyle = "satellite",
): THREE.Group {
  const group = new THREE.Group();
  group.name = "parksLayer";

  // Sit above the ground plane (y=0). With the renderer's logarithmic depth
  // buffer, polygonOffset can actually push fragments behind the ground in
  // log-z space (the offset is applied in linear screen-space depth, which
  // is no longer monotonic with the log-z value the depth test uses), so we
  // drop polygonOffset entirely and trust a small positive Y lift instead.
  // 1.5 world units (~21 cm at the 7.14× world scale) is enough to clear
  // the basemap without making parks look elevated at close zoom.
  const HEIGHT_OFFSET = 1.5;

  for (const park of parks) {
    const color = colorForClass(park.cls, mapStyle);
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
      // Parks are opaque, so they MUST write depth — otherwise the ground
      // plane (which is `transparent: true` due to its edge-fade shader and
      // therefore renders AFTER opaque geometry) draws on top of the park
      // colour and hides it. Writing depth here is what tells the
      // transparent-pass ground plane that the park already owns this pixel.
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = HEIGHT_OFFSET;
      // Lowest renderOrder of any geospatial layer — matches the panel order
      // (park is at the bottom of the list), so traffic / zoning / water
      // overlays draw on top where they share footprint.
      mesh.renderOrder = 1;
      mesh.userData.parkName = park.name;
      mesh.userData.parkClass = park.cls;
      mesh.userData.isPark = true;
      group.add(mesh);
    }
  }

  console.log(`✅ Parks layer: ${parks.length} polygons rendered`);
  return group;
}

export async function loadAndRenderParksLayer(
  mapStyle: MapStyle = "satellite",
): Promise<THREE.Group | null> {
  try {
    const res = await fetch("/map-data/parks.json", { cache: "force-cache" });
    if (!res.ok) {
      console.warn("Parks fetch failed:", res.status);
      return null;
    }
    const data = (await res.json()) as ParkFeature[];
    return renderParksLayer(data, mapStyle);
  } catch (err) {
    console.error("Parks layer load error:", err);
    return null;
  }
}
