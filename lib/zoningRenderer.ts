/**
 * Toronto Zoning By-law layer (open.toronto.ca).
 *
 * Data source: City of Toronto Open Data — package "zoning-by-law",
 * resource "Zoning Area - 4326.geojson". Pre-filtered to the downtown bbox
 * and written to public/map-data/zoning.json by scripts/import-toronto-layers.ts
 * (the zoning task — fed by the canonical CKAN GeoJSON download).
 *
 * Each polygon carries its ZN_ZONE (specific by-law code, e.g. "CR", "R")
 * and GEN_ZONE (1–6 category). We color by GEN_ZONE so the palette stays
 * coherent across the dozens of suffixed codes.
 */

import * as THREE from "three";
import { CityProjection } from "./projection";
import { getTheme, type MapStyle } from "./mapTheme";

type Ring = number[][];

interface ZoneFeature {
  id: number;
  code: string; // ZN_ZONE
  gen: number; // GEN_ZONE category (1–6)
  polygons: Ring[][]; // MultiPolygon: [polygon[outerRing, hole, …], …]
}

// GEN_ZONE → color. Categories from the Zoning By-law README:
//   1 Residential · 2 Commercial-Residential / Mixed Use · 3 Employment
//   4 Open Space · 5 Institutional · 6 Utility
const GEN_ZONE_COLORS: Record<number, number> = {
  1: 0xffff73, // Residential
  2: 0xe85b3a, // Commercial-Residential / Mixed Use
  3: 0xb87aa0, // Employment
  4: 0x6fc66c, // Open Space
  5: 0xffbee8, // Institutional
  6: 0x9aa0a6, // Utility
};
const DEFAULT_COLOR = 0xcccccc;

function colorForGen(gen: number): number {
  return GEN_ZONE_COLORS[gen] ?? DEFAULT_COLOR;
}

function ringToShape(ring: Ring): THREE.Shape | null {
  if (ring.length < 3) return null;
  const shape = new THREE.Shape();
  const p0 = CityProjection.projectToWorld([ring[0][0], ring[0][1]]);
  shape.moveTo(p0.x, p0.z);
  for (let i = 1; i < ring.length; i++) {
    const p = CityProjection.projectToWorld([ring[i][0], ring[i][1]]);
    shape.lineTo(p.x, p.z);
  }
  shape.closePath();
  return shape;
}

export function renderZoningLayer(
  features: ZoneFeature[],
  mapStyle: MapStyle = "satellite",
): THREE.Group {
  const group = new THREE.Group();
  group.name = "zoningLayer";

  const HEIGHT_OFFSET = 1.2; // overlay above ground/parks
  const OPACITY = getTheme(mapStyle).zoning.opacity;

  for (const feature of features) {
    const color = colorForGen(feature.gen);

    for (const poly of feature.polygons) {
      const shape = ringToShape(poly[0]);
      if (!shape) continue;
      const geometry = new THREE.ShapeGeometry(shape);
      // Same convention as parks/water: rotate the geometry (not the mesh)
      // so the polygon sits flat on the XZ plane without N–S mirroring.
      geometry.rotateX(Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = HEIGHT_OFFSET;
      mesh.renderOrder = 9999;
      mesh.userData.zoneCode = feature.code;
      mesh.userData.zoneGen = feature.gen;
      mesh.userData.isZoning = true;
      group.add(mesh);
    }
  }

  console.log(`✅ Zoning layer: ${features.length} polygons rendered`);
  return group;
}

/**
 * Existing call sites pass (bbox, projection) — both are now ignored because
 * the data is pre-filtered locally. Kept in the signature to avoid touching
 * ThreeMap callers.
 */
export async function loadAndRenderZoningLayer(
  _bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  _projection?: typeof CityProjection,
  mapStyle: MapStyle = "satellite",
): Promise<THREE.Group | null> {
  try {
    const res = await fetch("/map-data/zoning.json", { cache: "force-cache" });
    if (!res.ok) {
      console.warn("Zoning fetch failed:", res.status);
      return null;
    }
    const features = (await res.json()) as ZoneFeature[];
    if (!features.length) {
      console.warn("Zoning file is empty");
      return null;
    }
    return renderZoningLayer(features, mapStyle);
  } catch (err) {
    console.error("Failed to load zoning layer:", err);
    return null;
  }
}
