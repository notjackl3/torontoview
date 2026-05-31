/**
 * Import parks/water/trees layers for downtown Toronto from the City of
 * Toronto Open Data portal. Filters each source to the app's downtown bbox
 * and writes a compact JSON into public/map-data/{parks,water,trees}.json.
 *
 * Inputs (downloaded ahead of time into /tmp/toronto-layers):
 *   - green-spaces.geojson  (Green Spaces, polygons)
 *   - waterbodies.dump      (Waterbodies CSV with Python-dict geometry col)
 *   - watercourses.geojson  (Water Line, LineString)
 *   - street-trees.csv      (Street Tree Data CSV, point per tree)
 *   - zoning-area-4326.geojson (Zoning By-law "Zoning Area" polygons)
 *
 * Usage:
 *   npx tsx scripts/import-toronto-layers.ts <input-dir>
 *
 * Output JSON shapes are kept tiny so they load fast over /map-data/ static
 * routes. See lib/{parksRenderer,waterRenderer,torontoTreesRenderer}.ts for
 * the consumers.
 */
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const BBOX = { south: 43.64, west: -79.395, north: 43.66, east: -79.365 };

type Ring = [number, number][];

interface ParkFeature {
  id: number;
  name: string;
  cls: string; // AREA_CLASS, e.g. "PARK" / "CEMETERY"
  polygons: Ring[][]; // MultiPolygon: array of polygons, each polygon = outer ring + holes
}

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

interface TreeFeature {
  lng: number;
  lat: number;
  species: string; // COMMON_NAME
  dbh: number; // trunk diameter, cm (drives sprite scale)
}

interface ZoneFeature {
  id: number;
  code: string; // ZN_ZONE
  gen: number; // GEN_ZONE numeric category
  polygons: Ring[][];
}

function pointInBbox(lng: number, lat: number): boolean {
  return (
    lng >= BBOX.west &&
    lng <= BBOX.east &&
    lat >= BBOX.south &&
    lat <= BBOX.north
  );
}

// Cheap bbox-overlap test on a ring: keep if ANY vertex falls in bbox OR
// the ring's own bbox overlaps ours. Good enough — false negatives only
// happen for huge polygons that wholly contain our bbox; we special-case
// Lake Ontario below.
function ringHasAnyPointInBbox(ring: Ring): boolean {
  for (const [lng, lat] of ring) {
    if (pointInBbox(lng, lat)) return true;
  }
  return false;
}

function ringBboxOverlapsBbox(ring: Ring): boolean {
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return !(
    maxLng < BBOX.west ||
    minLng > BBOX.east ||
    maxLat < BBOX.south ||
    minLat > BBOX.north
  );
}

// Waterbody pre-clip bbox: slightly larger than the build BBOX so the renderer
// has the shoreline arc it needs even when the camera pans outside the
// buildable area. Must match lib/torontoWaterRenderer.ts:CLIP_BBOX.
const WATER_CLIP_BBOX = {
  south: 43.58,
  north: 43.67,
  west: -79.42,
  east: -79.34,
};

function intersectEdge(
  a: [number, number],
  b: [number, number],
  axis: "x" | "y",
  v: number,
): [number, number] {
  if (axis === "x") {
    const t = (v - a[0]) / (b[0] - a[0]);
    return [v, a[1] + t * (b[1] - a[1])];
  }
  const t = (v - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), v];
}

function clipRingEdge(
  ring: Ring,
  inside: (p: [number, number]) => boolean,
  cut: (a: [number, number], b: [number, number]) => [number, number],
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

// Sutherland–Hodgman clip mirroring lib/torontoWaterRenderer.ts. Doing it here
// shrinks Lake Ontario from ~82k vertices to a few thousand so the JSON is
// ~7× smaller and the renderer's per-load clip becomes a no-op.
function clipWaterRingToBbox(ring: Ring): Ring {
  let r: Ring = ring.slice();
  r = clipRingEdge(r, (p) => p[0] >= WATER_CLIP_BBOX.west, (a, b) =>
    intersectEdge(a, b, "x", WATER_CLIP_BBOX.west),
  );
  r = clipRingEdge(r, (p) => p[0] <= WATER_CLIP_BBOX.east, (a, b) =>
    intersectEdge(a, b, "x", WATER_CLIP_BBOX.east),
  );
  r = clipRingEdge(r, (p) => p[1] >= WATER_CLIP_BBOX.south, (a, b) =>
    intersectEdge(a, b, "y", WATER_CLIP_BBOX.south),
  );
  r = clipRingEdge(r, (p) => p[1] <= WATER_CLIP_BBOX.north, (a, b) =>
    intersectEdge(a, b, "y", WATER_CLIP_BBOX.north),
  );
  return r;
}

// ────────────────────────────────────────────────────────────────────────────
// Parks (Green Spaces GeoJSON)
// ────────────────────────────────────────────────────────────────────────────

function importParks(srcPath: string): ParkFeature[] {
  const raw = JSON.parse(fs.readFileSync(srcPath, "utf-8"));
  const out: ParkFeature[] = [];

  for (const f of raw.features) {
    const g = f.geometry;
    if (!g) continue;

    const polygons: Ring[][] =
      g.type === "MultiPolygon"
        ? (g.coordinates as Ring[][])
        : g.type === "Polygon"
          ? [g.coordinates as Ring[]]
          : [];
    if (polygons.length === 0) continue;

    const kept = polygons.filter(
      (poly) => ringBboxOverlapsBbox(poly[0]) && ringHasAnyPointInBbox(poly[0])
    );
    if (kept.length === 0) continue;

    out.push({
      id: f.properties._id ?? f.properties.OBJECTID ?? out.length,
      name: f.properties.AREA_NAME ?? "",
      cls: f.properties.AREA_CLASS ?? "",
      polygons: kept,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Watercourses (Water Line GeoJSON, LineString)
// ────────────────────────────────────────────────────────────────────────────

function importWatercourses(srcPath: string): WatercourseFeature[] {
  const raw = JSON.parse(fs.readFileSync(srcPath, "utf-8"));
  const out: WatercourseFeature[] = [];
  for (const f of raw.features) {
    const g = f.geometry;
    if (!g) continue;
    const lines: [number, number][][] =
      g.type === "MultiLineString"
        ? (g.coordinates as [number, number][][])
        : g.type === "LineString"
          ? [g.coordinates as [number, number][]]
          : [];
    for (const line of lines) {
      if (!ringBboxOverlapsBbox(line)) continue;
      if (!ringHasAnyPointInBbox(line)) continue;
      out.push({
        id: f.properties._id ?? out.length,
        name: f.properties.WATERLINE_NAME ?? "",
        line,
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Waterbodies (CSV dump; geometry column is a Python-dict string)
// ────────────────────────────────────────────────────────────────────────────

async function importWaterbodies(srcPath: string): Promise<WaterbodyFeature[]> {
  const out: WaterbodyFeature[] = [];
  const text = fs.readFileSync(srcPath, "utf-8");

  // Hand-roll a tolerant CSV record splitter — the file uses quoted fields
  // and the geometry column itself contains commas. The geometry quoting is
  // `"""{'type': ...}"""` (triple-quoted) because of CSV escaping of the
  // inner double-quotes. We read line-by-line and merge continuations.
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",");
  const geomCol = header.indexOf("geometry");
  const nameCol = header.indexOf("WATERBODY_NAME");
  const idCol = header.indexOf("_id");

  // Records may span multiple physical lines if geometry contains newlines.
  // Detect by counting unbalanced quotes.
  let buf = "";
  for (let i = 1; i < lines.length; i++) {
    buf += (buf ? "\n" : "") + lines[i];
    const qCount = (buf.match(/"/g) || []).length;
    if (qCount % 2 !== 0) continue; // mid-record
    if (!buf.trim()) {
      buf = "";
      continue;
    }
    const cells = parseCsvLine(buf);
    buf = "";

    const geomStr = cells[geomCol];
    if (!geomStr) continue;

    // Convert Python-dict-string geometry to JSON. The on-disk form is
    // triple-quoted CSV ("""{...}""") which after CSV parsing becomes
    // ""{...}"". Collapse repeated "" → " and trim ALL outer quotes before
    // swapping Python single-quotes for JSON double-quotes.
    let g = geomStr.replace(/""/g, '"');
    while (g.startsWith('"')) g = g.slice(1);
    while (g.endsWith('"')) g = g.slice(0, -1);
    g = g.replace(/'/g, '"');
    let geom: { type: string; coordinates: any };
    try {
      geom = JSON.parse(g);
    } catch (e) {
      continue;
    }

    const polygons: Ring[][] =
      geom.type === "MultiPolygon"
        ? (geom.coordinates as Ring[][])
        : geom.type === "Polygon"
          ? [geom.coordinates as Ring[]]
          : [];

    const name = cells[nameCol] ?? "";

    // Special-case Lake Ontario — its polygon is enormous (the entire lake)
    // and skips the per-vertex test. Keep it unconditionally and clip later
    // in the renderer if needed.
    const isLakeOntario = /lake ontario/i.test(name);

    const kept = polygons.filter((poly) => {
      if (isLakeOntario) return true;
      return ringBboxOverlapsBbox(poly[0]) && ringHasAnyPointInBbox(poly[0]);
    });
    if (kept.length === 0) continue;

    // Pre-clip each polygon's outer ring to the renderer's bbox so we don't
    // ship megabytes of unused shoreline. Inner rings (holes) are dropped —
    // the renderer only tessellates poly[0]. Empty results are discarded.
    const clipped: Ring[][] = [];
    for (const poly of kept) {
      const ring = clipWaterRingToBbox(poly[0]);
      if (ring.length >= 3) clipped.push([ring]);
    }
    if (clipped.length === 0) continue;

    out.push({
      id: parseInt(cells[idCol] ?? "0") || out.length,
      name,
      polygons: clipped,
    });
  }
  return out;
}

// Tiny CSV parser (no embedded newlines — caller pre-merges them)
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '""';
        i++;
      } else if (c === '"') {
        cur += '"';
        inQ = false;
      } else cur += c;
    } else {
      if (c === ",") {
        out.push(cur);
        cur = "";
      } else if (c === '"') {
        cur += '"';
        inQ = true;
      } else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Street trees (CSV, ~145 MB, ~688k rows — must stream)
// ────────────────────────────────────────────────────────────────────────────

async function importTrees(srcPath: string): Promise<TreeFeature[]> {
  const rl = readline.createInterface({
    input: fs.createReadStream(srcPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  const out: TreeFeature[] = [];

  let header: string[] | null = null;
  let geomCol = -1,
    commonCol = -1,
    dbhCol = -1;

  let scanned = 0;
  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line);
      geomCol = header.indexOf("geometry");
      commonCol = header.indexOf("COMMON_NAME");
      dbhCol = header.indexOf("DBH_TRUNK");
      continue;
    }
    scanned++;
    const cells = parseCsvLine(line);
    const g = cells[geomCol];
    if (!g) continue;
    // Geometry is JSON with CSV-doubled quotes: `"{""coordinates"": ...}"`.
    // Type is "MultiPoint" with a single [[lng, lat]] coordinate.
    let s = g.replace(/""/g, '"');
    while (s.startsWith('"')) s = s.slice(1);
    while (s.endsWith('"')) s = s.slice(0, -1);
    let parsed: { type: string; coordinates: any };
    try {
      parsed = JSON.parse(s);
    } catch {
      continue;
    }
    let lng: number, lat: number;
    if (parsed.type === "Point") {
      [lng, lat] = parsed.coordinates;
    } else if (parsed.type === "MultiPoint") {
      [lng, lat] = parsed.coordinates[0];
    } else {
      continue;
    }
    if (!pointInBbox(lng, lat)) continue;

    const dbhRaw = cells[dbhCol];
    const dbh = parseFloat(dbhRaw);
    out.push({
      lng,
      lat,
      species: cells[commonCol] ?? "",
      dbh: isFinite(dbh) ? dbh : 0,
    });
  }
  console.log(`   scanned ${scanned.toLocaleString()} trees`);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Zoning By-law areas (GeoJSON)
// ────────────────────────────────────────────────────────────────────────────

function importZoning(srcPath: string): ZoneFeature[] {
  const raw = JSON.parse(fs.readFileSync(srcPath, "utf-8"));
  const out: ZoneFeature[] = [];

  for (const f of raw.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys: Ring[][] =
      g.type === "MultiPolygon"
        ? (g.coordinates as Ring[][])
        : g.type === "Polygon"
          ? [g.coordinates as Ring[]]
          : [];

    const kept = polys.filter(
      (poly) => poly[0] && ringBboxOverlapsBbox(poly[0]),
    );
    if (kept.length === 0) continue;

    out.push({
      id: f.properties?._id ?? out.length,
      code: f.properties?.ZN_ZONE ?? "",
      gen: f.properties?.GEN_ZONE ?? 0,
      polygons: kept,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

async function main() {
  const inDir = process.argv[2] ?? "/tmp/toronto-layers";
  const outDir = path.join(process.cwd(), "public", "map-data");

  const tasks: { name: string; fn: () => Promise<any> | any; out: string }[] = [
    {
      name: "parks",
      fn: () => importParks(path.join(inDir, "green-spaces.geojson")),
      out: path.join(outDir, "parks.json"),
    },
    {
      name: "waterbodies",
      fn: () => importWaterbodies(path.join(inDir, "waterbodies.dump")),
      out: path.join(outDir, "waterbodies.json"),
    },
    {
      name: "watercourses",
      fn: () => importWatercourses(path.join(inDir, "watercourses.geojson")),
      out: path.join(outDir, "watercourses.json"),
    },
    {
      name: "trees",
      fn: () => importTrees(path.join(inDir, "street-trees.csv")),
      out: path.join(outDir, "trees.json"),
    },
    {
      name: "zoning",
      fn: () => importZoning(path.join(inDir, "zoning-area-4326.geojson")),
      out: path.join(outDir, "zoning.json"),
    },
  ];

  for (const t of tasks) {
    const src = t.out;
    console.log(`\n🌳 Importing ${t.name}…`);
    const data = await t.fn();
    const json = JSON.stringify(data);
    fs.writeFileSync(t.out, json);
    const size = (fs.statSync(t.out).size / 1024).toFixed(1);
    console.log(`   ${data.length.toLocaleString()} features → ${src} (${size} KB)`);
  }
  console.log("\n✅ Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
