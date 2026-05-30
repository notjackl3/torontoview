/**
 * Fetch building height data from Mapbox vector tiles and merge with existing buildings.json.
 *
 * This script:
 *   1. Reads the existing buildings.json
 *   2. Fetches Mapbox vector tiles covering the Toronto area bounding box
 *   3. Extracts building features with height data from the "building" layer
 *   4. Matches Mapbox buildings to our buildings by centroid proximity
 *   5. Updates heights for buildings that only have default/inferred heights
 *   6. Recalculates roofHeight based on the updated wall height
 *
 * Run with: npx tsx scripts/fetch-mapbox-heights.ts
 */

import * as fs from "fs";
import * as path from "path";
import Pbf from "pbf";
import { VectorTile } from "@mapbox/vector-tile";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PUBLIC_DIR = path.join(process.cwd(), "public", "map-data");
const BUILDINGS_PATH = path.join(PUBLIC_DIR, "buildings.json");

// Bounding box for the area of interest (downtown Toronto, ON)
const BBOX = {
  south: 43.64,
  west: -79.395,
  north: 43.66,
  east: -79.365,
};

const ZOOM = 15;

// Maximum distance (in meters) between centroids for a match
const MATCH_THRESHOLD_METERS = 20;

// Default heights assigned by process-map-data.ts when OSM has no explicit height
const DEFAULT_HEIGHTS = new Set([3, 6, 8, 12, 14, 15]);

// Read Mapbox token from .env.local
function getMapboxToken(): string {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      ".env.local not found. Please create it with NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN."
    );
  }
  const envContent = fs.readFileSync(envPath, "utf-8");
  const match = envContent.match(
    /NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=(.+?)(\r?\n|$)/
  );
  if (!match) {
    throw new Error(
      "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN not found in .env.local"
    );
  }
  return match[1].trim();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RoofShape =
  | "flat"
  | "gabled"
  | "hipped"
  | "pyramidal"
  | "dome"
  | "skillion";

interface Building {
  id: string;
  footprint: [number, number][];
  height: number;
  type?: string;
  roofShape: RoofShape;
  roofHeight: number;
  color?: string;
  roofColor?: string;
  material?: string;
  levels?: number;
}

interface MapboxBuilding {
  centroid: [number, number]; // [lng, lat]
  height: number | null;
  minHeight: number | null;
}

// ---------------------------------------------------------------------------
// Tile coordinate helpers
// ---------------------------------------------------------------------------

/** Convert lng/lat to tile x/y at a given zoom level */
function lngLatToTile(
  lng: number,
  lat: number,
  zoom: number
): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n
  );
  return { x, y };
}

/** Convert a tile-local pixel coordinate to lng/lat */
function tilePixelToLngLat(
  tileX: number,
  tileY: number,
  zoom: number,
  px: number,
  py: number,
  extent: number
): [number, number] {
  const n = Math.pow(2, zoom);
  const lng = ((tileX + px / extent) / n) * 360 - 180;
  const latRad = Math.atan(
    Math.sinh(Math.PI * (1 - (2 * (tileY + py / extent)) / n))
  );
  const lat = (latRad * 180) / Math.PI;
  return [lng, lat];
}

/** Compute the centroid of a polygon (simple average of vertices) */
function centroid(coords: [number, number][]): [number, number] {
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

/** Haversine distance between two [lng, lat] points, in meters */
function haversineMeters(
  a: [number, number],
  b: [number, number]
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Tile fetching
// ---------------------------------------------------------------------------

/** Get the list of tile coordinates covering the bounding box at the given zoom */
function getTileCoordsForBbox(
  bbox: typeof BBOX,
  zoom: number
): { x: number; y: number }[] {
  const topLeft = lngLatToTile(bbox.west, bbox.north, zoom);
  const bottomRight = lngLatToTile(bbox.east, bbox.south, zoom);

  const tiles: { x: number; y: number }[] = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ x, y });
    }
  }
  return tiles;
}

/** Fetch a single vector tile from Mapbox and decode it */
async function fetchVectorTile(
  x: number,
  y: number,
  z: number,
  token: string
): Promise<VectorTile | null> {
  const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.vector.pbf?access_token=${token}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        // No tile at this coordinate - not an error
        return null;
      }
      console.warn(
        `  Warning: HTTP ${response.status} for tile ${z}/${x}/${y}`
      );
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const pbf = new Pbf(new Uint8Array(arrayBuffer));
    return new VectorTile(pbf);
  } catch (err) {
    console.warn(
      `  Warning: Failed to fetch tile ${z}/${x}/${y}: ${(err as Error).message}`
    );
    return null;
  }
}

/** Extract building features from a vector tile */
function extractBuildingsFromTile(
  tile: VectorTile,
  tileX: number,
  tileY: number,
  zoom: number
): MapboxBuilding[] {
  const layer = tile.layers["building"];
  if (!layer) return [];

  const buildings: MapboxBuilding[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const props = feature.properties;

    // Only care about polygon features (type 3)
    if (feature.type !== 3) continue;

    const height =
      typeof props.height === "number" ? props.height : null;
    const minHeight =
      typeof props.min_height === "number" ? props.min_height : null;

    // Convert geometry to lng/lat to compute centroid
    const geometry = feature.loadGeometry();
    const extent = feature.extent;

    // Geometry is an array of rings; use the first (outer) ring for centroid
    const outerRing = geometry[0];
    if (!outerRing || outerRing.length === 0) continue;

    const lngLatCoords: [number, number][] = outerRing.map((pt) =>
      tilePixelToLngLat(tileX, tileY, zoom, pt.x, pt.y, extent)
    );

    buildings.push({
      centroid: centroid(lngLatCoords),
      height,
      minHeight,
    });
  }

  return buildings;
}

// ---------------------------------------------------------------------------
// Roof height recalculation (mirrors process-map-data.ts logic)
// ---------------------------------------------------------------------------

function inferRoofHeight(
  shape: RoofShape,
  wallHeight: number,
  type?: string
): number {
  switch (shape) {
    case "gabled":
      if (
        type === "church" ||
        type === "cathedral" ||
        type === "chapel"
      ) {
        return wallHeight * 0.5;
      }
      return wallHeight * 0.3;
    case "hipped":
      return wallHeight * 0.25;
    case "pyramidal":
      return wallHeight * 0.4;
    case "dome":
      return wallHeight * 0.35;
    case "skillion":
      return wallHeight * 0.15;
    case "flat":
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

/**
 * Determine if a building's height is a default value (i.e., it was not
 * explicitly set from OSM data). We consider a height "default" if it is
 * an exact integer that matches one of the known defaults AND the building
 * has no explicit `levels` property (since levels-derived heights might
 * coincidentally equal a default).
 */
function hasDefaultHeight(building: Building): boolean {
  // If the building has explicit levels, the height was derived from levels * 3.5
  // which typically gives non-integer or non-default values. But levels * 3.5
  // for levels=1 -> 3.5, levels=2 -> 7, levels=4 -> 14 ... some overlap is possible.
  // We check: if levels is set AND height === levels * 3.5, it was derived from levels,
  // which is better than a bare default, so we skip updating it.
  if (building.levels && building.levels > 0) {
    return false;
  }

  return DEFAULT_HEIGHTS.has(building.height);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Mapbox Building Height Enrichment ===\n");

  // 1. Read existing buildings
  console.log("Reading buildings.json...");
  const buildings: Building[] = JSON.parse(
    fs.readFileSync(BUILDINGS_PATH, "utf-8")
  );
  console.log(`  Loaded ${buildings.length} buildings.`);

  // Count how many have default heights
  const defaultCount = buildings.filter(hasDefaultHeight).length;
  console.log(
    `  ${defaultCount} buildings have default heights (candidates for update).`
  );
  console.log(
    `  ${buildings.length - defaultCount} buildings have explicit/derived heights (will be preserved).\n`
  );

  // 2. Get Mapbox token
  const token = getMapboxToken();
  console.log("Mapbox token loaded.\n");

  // 3. Calculate tile coordinates
  const tileCoords = getTileCoordsForBbox(BBOX, ZOOM);
  console.log(
    `Fetching ${tileCoords.length} vector tiles at zoom ${ZOOM}...`
  );

  // 4. Fetch all tiles and extract buildings
  const allMapboxBuildings: MapboxBuilding[] = [];
  let tilesSucceeded = 0;
  let tilesFailed = 0;

  for (const { x, y } of tileCoords) {
    const tile = await fetchVectorTile(x, y, ZOOM, token);
    if (tile) {
      const extracted = extractBuildingsFromTile(tile, x, y, ZOOM);
      allMapboxBuildings.push(...extracted);
      tilesSucceeded++;
    } else {
      tilesFailed++;
    }
  }

  console.log(
    `  Fetched ${tilesSucceeded} tiles successfully (${tilesFailed} failed/empty).`
  );
  console.log(`  Extracted ${allMapboxBuildings.length} Mapbox building features.`);

  // Count how many Mapbox buildings actually have height data
  const withHeight = allMapboxBuildings.filter((b) => b.height !== null);
  console.log(
    `  ${withHeight.length} Mapbox buildings have height values.\n`
  );

  if (withHeight.length === 0) {
    console.log(
      "No Mapbox buildings with height data found. No updates to make."
    );
    return;
  }

  // 5. Build a spatial index: precompute centroids for our buildings
  console.log("Matching buildings by centroid proximity...");
  const ourCentroids = buildings.map((b) => centroid(b.footprint));

  let matchCount = 0;
  let updatedCount = 0;

  for (let i = 0; i < buildings.length; i++) {
    const building = buildings[i];

    // Only update buildings with default heights
    if (!hasDefaultHeight(building)) continue;

    const ourCenter = ourCentroids[i];

    // Find the closest Mapbox building with height data
    let bestDist = Infinity;
    let bestMapbox: MapboxBuilding | null = null;

    for (const mb of withHeight) {
      const dist = haversineMeters(ourCenter, mb.centroid);
      if (dist < bestDist) {
        bestDist = dist;
        bestMapbox = mb;
      }
    }

    if (bestMapbox && bestDist <= MATCH_THRESHOLD_METERS) {
      matchCount++;
      const newHeight = bestMapbox.height!;

      // Only update if the Mapbox height is meaningfully different from the default
      if (Math.abs(newHeight - building.height) > 0.5) {
        const oldHeight = building.height;
        building.height = Math.round(newHeight * 10) / 10; // round to 1 decimal

        // Recalculate roof height using the same logic as process-map-data.ts
        building.roofHeight =
          Math.round(
            inferRoofHeight(building.roofShape, building.height, building.type) *
              10
          ) / 10;

        updatedCount++;
      }
    }
  }

  console.log(
    `  ${matchCount} buildings matched within ${MATCH_THRESHOLD_METERS}m threshold.`
  );
  console.log(`  ${updatedCount} buildings had their heights updated.\n`);

  // 6. Write updated buildings.json
  if (updatedCount > 0) {
    // Back up the original file
    const backupPath = BUILDINGS_PATH.replace(".json", ".backup.json");
    fs.copyFileSync(BUILDINGS_PATH, backupPath);
    console.log(`Backup saved to ${path.basename(backupPath)}.`);

    fs.writeFileSync(BUILDINGS_PATH, JSON.stringify(buildings, null, 2));
    console.log(
      `Updated buildings.json written with ${updatedCount} height changes.`
    );
  } else {
    console.log("No height updates needed. buildings.json unchanged.");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
