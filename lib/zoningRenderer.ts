/**
 * Toronto Official Plan - Land Use Designation layer
 * Fetches zoning polygons from ArcGIS MapServer and renders them in Three.js
 *
 * ArcGIS layer 17: Land Use Designation (Official Plan Schedule 3ABC)
 * Source: City of Toronto - https://utility.arcgis.com/.../OfficialPlan/MapServer
 */

import * as THREE from "three";
import { CityProjection } from "./projection";

const ARCGIS_MAPSERVER_BASE =
  "https://utility.arcgis.com/usrsvcs/servers/2c6aee2bcf524340a3c60a44b9f124a9/rest/services/Planning/OfficialPlan/MapServer";
const LAND_USE_LAYER_ID = 17;

/** Zone code to hex color - from ArcGIS uniqueValueInfos (Official Plan Schedule 3ABC) */
const ZONE_COLORS: Record<string, number> = {
  AGGR: 0xdedeba, // Prime Agricultural
  AGR: 0xdedeba,
  AIR: 0x333333, // Airport
  AC: 0xffaa00, // Arterial Commercial
  BPI: 0x73b2ff, // Business Park Industrial
  CBD: 0x9b59b6, // Central Business District (fallback)
  DC: 0x8e44ad, // District Commercial (fallback)
  EPA: 0x38a800, // Environmental Protection
  ER: 0x6e6e6e, // Estate Residential
  GI: 0x9cdfff, // General Industrial
  HAM: 0xffd37f, // Hamlet
  HA: 0x0070ff, // Harbour Area
  WA: 0x0070ff,
  I: 0xffbee8, // Institutional
  MC: 0xff0000, // Main Street Commercial
  MAR: 0x0084a8, // Marina
  MR: 0x8b7355, // Mineral Resource (fallback)
  MU: 0xe60000, // Mixed Use
  OS: 0xa5f57a, // Open Space
  RC: 0xf57a7a, // Regional Commercial
  RES: 0xffff73, // Residential
  RU: 0xfffade, // Rural Lands
  RUC: 0xccaa66, // Rural Commercial
  RUI: 0xccaa66, // Rural Industrial
  SECP: 0xffffff, // Secondary Plan Area
  WMI: 0x6b6b6b, // Waste Management (fallback)
};

const DEFAULT_ZONE_COLOR = 0xcccccc;

function getColorForCode(code: string | null | undefined): number {
  if (!code) return DEFAULT_ZONE_COLOR;
  return ZONE_COLORS[String(code).toUpperCase()] ?? DEFAULT_ZONE_COLOR;
}

export interface ZoningFeature {
  type: "Feature";
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  properties?: { CODE?: string; [key: string]: unknown };
}

export interface ZoningGeoJSON {
  type: "FeatureCollection";
  features: ZoningFeature[];
}

/**
 * Fetch Land Use Designation polygons from ArcGIS MapServer
 * Uses bbox to limit the query extent (Toronto area)
 */
export async function fetchZoningGeoJSON(bbox: {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}): Promise<ZoningGeoJSON> {
  // ArcGIS Query: geometry as envelope in [minX, minY, maxX, maxY] (lng, lat)
  const envelope = JSON.stringify({
    xmin: bbox.minLng,
    ymin: bbox.minLat,
    xmax: bbox.maxLng,
    ymax: bbox.maxLat,
    spatialReference: { wkid: 4326 },
  });

  const params = new URLSearchParams({
    where: "1=1",
    outFields: "CODE",
    outSR: "4326",
    f: "geojson",
    geometry: envelope,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
  });

  const url = `${ARCGIS_MAPSERVER_BASE}/${LAND_USE_LAYER_ID}/query?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `ArcGIS query failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

/**
 * Convert GeoJSON polygon rings to Three.js Shape
 * Expects coordinates in [lng, lat] (GeoJSON)
 */
function ringToShape(
  ring: number[][],
  projection: typeof CityProjection,
): THREE.Shape | null {
  if (ring.length < 3) return null;

  const points: THREE.Vector2[] = ring.map(([lng, lat]) => {
    const world = projection.projectToWorld([lng, lat]);
    // Shape uses XZ plane - Three.js has Y up, so x->x, z->y for Shape
    return new THREE.Vector2(world.x, world.z);
  });

  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

/**
 * Render zoning polygons as a Three.js group (caller adds to scene)
 */
export function renderZoningLayer(
  geoJson: ZoningGeoJSON,
  projection: typeof CityProjection,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "zoningLayer";

  const HEIGHT_OFFSET = 1.2; // Well above ground to avoid z-fighting at any camera distance
  const OPACITY = 0.5;

  for (const feature of geoJson.features) {
    const geom = feature.geometry;
    const code = feature.properties?.CODE;
    const color = getColorForCode(code);

    const exteriorRings: number[][][] = [];

    if (geom.type === "Polygon") {
      const rings = geom.coordinates as number[][][];
      if (rings[0]) exteriorRings.push(rings[0]); // exterior ring only
    } else if (geom.type === "MultiPolygon") {
      for (const poly of geom.coordinates as number[][][][]) {
        if (poly[0]) exteriorRings.push(poly[0]); // exterior ring of each part
      }
    }

    for (const ring of exteriorRings) {
      const shape = ringToShape(ring, projection);
      if (!shape) continue;

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: OPACITY,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2; // Horizontal
      mesh.position.y = HEIGHT_OFFSET;
      mesh.renderOrder = 9999; // Draw last as overlay - no z-fighting
      mesh.userData.zoneCode = code;
      mesh.userData.isZoning = true;

      group.add(mesh);
    }
  }

  console.log(`✅ Zoning layer: ${geoJson.features.length} polygons rendered`);
  return group;
}

/**
 * Fetch and render the Toronto zoning layer in one call.
 * Returns the group; caller is responsible for adding to scene and cleanup.
 */
export async function loadAndRenderZoningLayer(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  projection: typeof CityProjection,
): Promise<THREE.Group | null> {
  try {
    const geoJson = await fetchZoningGeoJSON(bbox);
    if (!geoJson.features?.length) {
      console.warn("No zoning features returned from ArcGIS");
      return null;
    }
    return renderZoningLayer(geoJson, projection);
  } catch (err) {
    console.error("Failed to load zoning layer:", err);
    return null;
  }
}
