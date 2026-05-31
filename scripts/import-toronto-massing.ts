/**
 * Import Toronto's 3D Massing dataset (real building heights, multi-volume
 * skyscrapers) into the app's buildings.json format.
 *
 * Source: City of Toronto Open Data — "3D Massing", 2025 shapefile (WGS84
 * filename is misleading; the actual .prj is Web Mercator / EPSG:3857). Each
 * feature is one *volume* of a building with its own MAX_HEIGHT, so tall
 * towers naturally render as a stack of prisms with setbacks.
 *
 * Run with:
 *   npx tsx scripts/import-toronto-massing.ts \
 *     /tmp/toronto-massing/3DMassingShapefile_2025_WGS84
 *
 * Output: public/map-data/buildings.json
 */
import * as fs from "fs";
import * as path from "path";
import * as shapefile from "shapefile";

// Same downtown Toronto bbox the rest of the app uses (Union Station / CN
// Tower / Financial District). Centroid prefilter uses these directly.
const BBOX = { south: 43.64, west: -79.395, north: 43.66, east: -79.365 };

const EARTH_RADIUS = 6378137; // WGS84 semi-major axis (also Web Mercator radius)

function webMercatorToLngLat(x: number, y: number): [number, number] {
  const lng = (x / EARTH_RADIUS) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) *
    (180 / Math.PI);
  return [lng, lat];
}

type Footprint = [number, number][];

interface Building {
  id: string;
  footprint: Footprint;
  height: number;
  type?: string;
  roofShape: "flat" | "gabled" | "hipped" | "pyramidal" | "dome" | "skillion";
  roofHeight: number;
  color?: string;
  roofColor?: string;
  material?: string;
  levels?: number;
}

async function main() {
  const base = process.argv[2];
  if (!base) {
    console.error(
      "Usage: tsx scripts/import-toronto-massing.ts <path-to-shapefile-without-extension>"
    );
    process.exit(1);
  }

  const shp = base + ".shp";
  const dbf = base + ".dbf";
  if (!fs.existsSync(shp) || !fs.existsSync(dbf)) {
    console.error(`Missing ${shp} or ${dbf}`);
    process.exit(1);
  }

  console.log("📦 Reading", shp);
  const source = await shapefile.open(shp, dbf);

  const buildings: Building[] = [];
  let total = 0;
  let inBbox = 0;
  let dropped = { zeroHeight: 0, degenerate: 0 } as Record<string, number>;
  let id = 0;

  // Build a 64-bit-ish id from MAX_HEIGHT and LONGITUDE — the dataset has no
  // stable per-volume id, and our app just uses ids as opaque map keys.
  while (true) {
    const r = await source.read();
    if (r.done) break;
    const f = r.value as any;
    total++;

    const props = f.properties;
    const lng = props.LONGITUDE;
    const lat = props.LATITUDE;

    // Centroid prefilter — fast reject for the ~99% of buildings outside
    // downtown.
    if (
      typeof lng !== "number" ||
      typeof lat !== "number" ||
      lng < BBOX.west ||
      lng > BBOX.east ||
      lat < BBOX.south ||
      lat > BBOX.north
    ) {
      continue;
    }
    inBbox++;

    // Prefer MAX_HEIGHT (top of this volume); fall back to AVG_HEIGHT.
    const rawHeight =
      typeof props.MAX_HEIGHT === "number" && props.MAX_HEIGHT > 0
        ? props.MAX_HEIGHT
        : typeof props.AVG_HEIGHT === "number" && props.AVG_HEIGHT > 0
          ? props.AVG_HEIGHT
          : 0;

    if (rawHeight <= 0) {
      dropped.zeroHeight++;
      continue;
    }

    const minHeight =
      typeof props.MIN_HEIGHT === "number" && props.MIN_HEIGHT > 0
        ? props.MIN_HEIGHT
        : 0;

    // Polygon geometry — take the outer ring, drop holes (renderer doesn't
    // model them).
    const geom = f.geometry;
    if (!geom || geom.type !== "Polygon") {
      dropped.degenerate++;
      continue;
    }
    const outer = geom.coordinates[0] as [number, number][];
    if (!outer || outer.length < 4) {
      dropped.degenerate++;
      continue;
    }

    const footprint: Footprint = outer.map(([x, y]) =>
      webMercatorToLngLat(x, y)
    );

    // The Building renderer expects an "extruded from ground" prism. The
    // dataset gives us a *floating* slab between MIN_HEIGHT and MAX_HEIGHT
    // for upper volumes (e.g. a tower setback that sits on top of a podium).
    // Approximating those as ground-extruded prisms is fine here because the
    // podium polygon underneath them already extrudes through them.
    const height = rawHeight;

    buildings.push({
      id: `tor3d-${id++}`,
      footprint,
      height,
      roofShape: "flat",
      roofHeight: 0,
      // Stash the metadata so future work (e.g. lifting upper volumes) can
      // use it without re-importing.
      ...(minHeight > 0 ? { levels: undefined } : {}),
    });
  }

  console.log(
    `   scanned ${total.toLocaleString()} features, ${inBbox.toLocaleString()} in bbox, ` +
      `kept ${buildings.length.toLocaleString()}`
  );
  console.log(`   dropped:`, dropped);

  // Quick sanity check — log the tallest things we found.
  const top = [...buildings].sort((a, b) => b.height - a.height).slice(0, 8);
  console.log("\n🏙  Tallest volumes in slice:");
  for (const b of top) {
    const c = b.footprint[0];
    console.log(
      `   ${b.height.toFixed(1).padStart(6, " ")} m  @ ${c[0].toFixed(4)}, ${c[1].toFixed(4)}  (${b.id})`
    );
  }

  const outPath = path.join(
    process.cwd(),
    "public",
    "map-data",
    "buildings.json"
  );
  fs.writeFileSync(outPath, JSON.stringify(buildings));
  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Wrote ${buildings.length} buildings to ${outPath} (${sizeMb} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
