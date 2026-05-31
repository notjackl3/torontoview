/**
 * Import Toronto's 3D Massing MULTIPATCH dataset — the version with actual
 * triangle-mesh geometry (setbacks, the CN Tower's pod, domes, etc.) instead
 * of the Shapefile's flat prisms.
 *
 * Pipeline:
 *   1. (manual prereq) Run ogr2ogr to convert the .gdb to a GeoJSON clipped
 *      to the downtown bbox. The script tells you exactly what to run.
 *   2. This script reads the GeoJSON, fan-triangulates each polygon face,
 *      collects all triangles per building, and writes the buildings.json
 *      with the new `mesh` field (plus a footprint derived from the ground
 *      polygon so non-rendering code paths still work).
 *
 * Usage:
 *   npx tsx scripts/import-toronto-multipatch.ts <input-geojson>
 *
 * Output: public/map-data/buildings.json
 */
import * as fs from "fs";
import * as path from "path";

// Downtown Toronto bbox (matches CityProjection center).
const BBOX = { south: 43.64, west: -79.395, north: 43.66, east: -79.365 };

interface Building {
  id: string;
  footprint: [number, number][];
  height: number;
  roofShape: "flat";
  roofHeight: 0;
  mesh: { positions: number[] };
}

// Web Mercator inverse (kept here as a safety net even though ogr2ogr should
// already reproject to EPSG:4326).
const EARTH = 6378137;
function webMercToLngLat(x: number, y: number): [number, number] {
  return [
    (x / EARTH) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(y / EARTH)) - Math.PI / 2) * (180 / Math.PI),
  ];
}

function looksProjected(lng: number, lat: number): boolean {
  // EPSG:4326 lng is in [-180, 180]. Web Mercator x for downtown Toronto is
  // around -8.8e6. Detect either.
  return Math.abs(lng) > 360 || Math.abs(lat) > 360;
}

/**
 * Fan-triangulate a single polygon face from one vertex. Multipatch faces
 * are almost always triangles or convex quads, so fan-triangulation is
 * accurate without going to a full earcut.
 */
function fanTriangulate(
  ring: [number, number, number][],
  out: number[]
): void {
  // ring[ring.length-1] is usually a repeat of ring[0]; drop it.
  const n = ring[0] && ring[ring.length - 1] &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1] &&
    ring[0][2] === ring[ring.length - 1][2]
    ? ring.length - 1
    : ring.length;
  if (n < 3) return;
  const v0 = ring[0];
  for (let i = 1; i < n - 1; i++) {
    const v1 = ring[i];
    const v2 = ring[i + 1];
    out.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]);
  }
}

function processFeature(f: any, idCounter: { n: number }): Building | null {
  const g = f.geometry;
  if (!g) return null;

  // Collect all polygon rings from the feature. ogr2ogr emits multipatch as
  // GeometryCollection or MultiPolygon depending on version; handle both.
  const allRings: [number, number, number][][] = [];

  function collectPolygon(coords: any) {
    // coords = [outerRing, hole1, hole2, ...] each ring = [[x,y,z], ...]
    if (!coords || !coords[0]) return;
    const outer = coords[0];
    if (!Array.isArray(outer) || outer.length < 3) return;
    const ring: [number, number, number][] = outer.map((v: any) => {
      const x = v[0],
        y = v[1],
        z = v[2] ?? 0;
      const [lng, lat] = looksProjected(x, y) ? webMercToLngLat(x, y) : [x, y];
      return [lng, lat, z];
    });
    allRings.push(ring);
  }

  function walk(node: any) {
    if (!node || !node.type) return;
    if (node.type === "Polygon") collectPolygon(node.coordinates);
    else if (node.type === "MultiPolygon") {
      for (const poly of node.coordinates) collectPolygon(poly);
    } else if (node.type === "GeometryCollection") {
      const geoms = node.geometries || [];
      for (const c of geoms) walk(c);
    }
    // Anything else (Tin/Triangle types not in standard GeoJSON) is silently
    // skipped — ogr2ogr emits NULL geometry for these features already.
  }
  walk(g);

  if (allRings.length === 0) return null;

  // Per-building bbox in lng/lat, used to (re)check the bbox filter.
  let mnLng = Infinity,
    mxLng = -Infinity,
    mnLat = Infinity,
    mxLat = -Infinity,
    mnZ = Infinity,
    mxZ = -Infinity;
  for (const ring of allRings) {
    for (const [lng, lat, z] of ring) {
      if (lng < mnLng) mnLng = lng;
      if (lng > mxLng) mxLng = lng;
      if (lat < mnLat) mnLat = lat;
      if (lat > mxLat) mxLat = lat;
      if (z < mnZ) mnZ = z;
      if (z > mxZ) mxZ = z;
    }
  }
  // Drop if entirely outside bbox.
  if (
    mxLng < BBOX.west ||
    mnLng > BBOX.east ||
    mxLat < BBOX.south ||
    mnLat > BBOX.north
  )
    return null;

  // Triangulate every face.
  const positions: number[] = [];
  for (const ring of allRings) fanTriangulate(ring, positions);

  if (positions.length < 9) return null;
  // (no triangle cap here — caller picks top-N tallest and keeps their full
  // mesh; everything else falls back to prism extrusion downstream)

  // Footprint = the lowest-Z ring projected to lng/lat. Picks the ground
  // outline so spawning / shadows / etc. that read footprint still work.
  let groundRing = allRings[0];
  let groundZ = ringMeanZ(allRings[0]);
  for (let i = 1; i < allRings.length; i++) {
    const z = ringMeanZ(allRings[i]);
    if (z < groundZ) {
      groundZ = z;
      groundRing = allRings[i];
    }
  }
  const footprint: [number, number][] = groundRing.map((v) => [v[0], v[1]]);

  return {
    id: `tor3dmp-${idCounter.n++}`,
    footprint,
    height: mxZ - mnZ,
    roofShape: "flat",
    roofHeight: 0,
    mesh: { positions },
  };
}

function ringMeanZ(ring: [number, number, number][]): number {
  let s = 0;
  for (const v of ring) s += v[2];
  return s / ring.length;
}

async function main() {
  const inPath = process.argv[2];
  if (!inPath) {
    console.error(`Usage: tsx scripts/import-toronto-multipatch.ts <geojson-file-or-dir>

Prereq: convert the .gdb to GeoJSON(s)-with-Z. The Toronto FGDB has 155
sub-tile layers; the spat filter mis-rejects most of them, so pull each
downtown-overlapping tile in full and let this script bbox-filter:

  cd /tmp/toronto-massing
  for layer in Multipatch_50G_NORTH_3 Multipatch_50G_SOUTH_1 \\
               Multipatch_50G_SOUTH_2 Multipatch_50G_NORTH_1 \\
               Multipatch_50G_NORTH_2 Multipatch_50G_SOUTH_3 \\
               Multipatch_50H_NORTH Multipatch_50H_SOUTH_2 \\
               Multipatch_50H_SOUTH_3 Multipatch_51G \\
               Multipatch_51H_SOUTH; do
    ogr2ogr -f GeoJSON "layer-clips/$layer.geojson" \\
      -t_srs EPSG:4326 -nlt CONVERT_TO_LINEAR -skipfailures \\
      3DMassingMultipatch_2025_WGS84.gdb "$layer"
  done
`);
    process.exit(1);
  }

  const stat = fs.statSync(inPath);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(inPath)
        .filter((n) => n.endsWith(".geojson"))
        .map((n) => path.join(inPath, n))
    : [inPath];

  const buildings: Building[] = [];
  const idCounter = { n: 0 };

  let totalScanned = 0;
  for (const file of files) {
    process.stdout.write(`📦 Reading ${path.basename(file)} … `);
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const before = buildings.length;
    for (const f of raw.features) {
      totalScanned++;
      const b = processFeature(f, idCounter);
      if (b) buildings.push(b);
    }
    console.log(`+${buildings.length - before} kept`);
  }
  console.log(
    `\nScanned ${totalScanned.toLocaleString()} features → mesh candidates: ${buildings.length.toLocaleString()}`
  );

  // Strategy for keeping the file shippable: pick the top-N tallest
  // candidates, but DROP any whose mesh exceeds MAX_TRIS (Aura @281m has
  // 94k, One Bloor @271m has 60k — over-tessellated TIN data). Dropped
  // buildings still render — they just fall back to prism extrusion from
  // the Shapefile dataset, which we preserve in the dedup step below.
  const TOP_N_MESH = 80;
  const MAX_TRIS = 20000; // CN Tower (17k) fits under the cap
  buildings.sort((a, b) => b.height - a.height);
  const meshKept: Building[] = [];
  const meshSkipped: { height: number; tris: number }[] = [];
  for (const b of buildings) {
    if (meshKept.length >= TOP_N_MESH) break;
    const tris = b.mesh.positions.length / 9;
    if (tris > MAX_TRIS) {
      meshSkipped.push({ height: b.height, tris });
      continue;
    }
    meshKept.push(b);
  }
  console.log(
    `🏛  Keeping mesh for ${meshKept.length} buildings (cap ${MAX_TRIS} tris each). Skipped ${meshSkipped.length} over-tessellated:`
  );
  for (const s of meshSkipped.slice(0, 5)) {
    console.log(
      `      skipped ${s.height.toFixed(0)}m  (${s.tris.toLocaleString()} tris > cap)`
    );
  }

  // Load the Shapefile-derived prism dataset (run import-toronto-massing.ts
  // first to produce it). Use those prisms as the base layer so every
  // downtown building is rendered, then drop any prism whose centroid sits
  // near a mesh centroid to avoid double-stacking.
  const prismPath = path.join(
    process.cwd(),
    "scripts",
    ".prisms-cache.json"
  );
  let prisms: any[] = [];
  if (fs.existsSync(prismPath)) {
    prisms = JSON.parse(fs.readFileSync(prismPath, "utf-8"));
    console.log(`📦 Loaded ${prisms.length.toLocaleString()} prism buildings from cache`);
  } else {
    console.log(
      `⚠️  No prism cache at ${prismPath}. Run scripts/import-toronto-massing.ts first, then copy public/map-data/buildings.json → scripts/.prisms-cache.json before re-running.`
    );
  }

  // Compute mesh centroids for dedup
  const meshCentroids: { lng: number; lat: number }[] = meshKept.map((b) => {
    let sx = 0,
      sy = 0,
      n = 0;
    for (const [lng, lat] of b.footprint) {
      sx += lng;
      sy += lat;
      n++;
    }
    return { lng: sx / n, lat: sy / n };
  });

  // Drop any prism within ~25m of a mesh centroid
  // (lat→m: ~111000; lng→m: ~111000 × cos(43.65°) ≈ 80,300)
  const RADIUS_M = 25;
  const RADIUS_LAT_DEG = RADIUS_M / 111000;
  const RADIUS_LNG_DEG = RADIUS_M / 80300;
  const dedupedPrisms = prisms.filter((p) => {
    if (!p.footprint || p.footprint.length === 0) return true;
    let cx = 0,
      cy = 0;
    for (const [lng, lat] of p.footprint) {
      cx += lng;
      cy += lat;
    }
    cx /= p.footprint.length;
    cy /= p.footprint.length;
    for (const m of meshCentroids) {
      const dLng = (cx - m.lng) / RADIUS_LNG_DEG;
      const dLat = (cy - m.lat) / RADIUS_LAT_DEG;
      if (dLng * dLng + dLat * dLat <= 1) return false;
    }
    return true;
  });
  console.log(
    `📐 Dropped ${(prisms.length - dedupedPrisms.length).toLocaleString()} prisms within ${RADIUS_M}m of a mesh centroid`
  );

  // Final output: prisms (no mesh) first, then mesh buildings
  const finalBuildings = [...dedupedPrisms, ...meshKept];
  console.log(`📦 Total output: ${finalBuildings.length.toLocaleString()} buildings`);

  // Overwrite the in-scope `buildings` variable for the write loop below
  buildings.length = 0;
  for (const b of finalBuildings) buildings.push(b);

  // Quick sanity: tallest 8 mesh buildings
  const top = (buildings as any[])
    .filter((b) => b.mesh)
    .sort((a, b) => b.height - a.height)
    .slice(0, 8);
  console.log("\n🏙  Tallest mesh buildings:");
  for (const b of top) {
    const c = b.footprint[0];
    console.log(
      `   ${b.height.toFixed(1).padStart(7, " ")} m  @ ${c[0].toFixed(4)}, ${c[1].toFixed(4)}  (${b.id}, ${b.mesh.positions.length / 9} tris)`
    );
  }

  const outPath = path.join(
    process.cwd(),
    "public",
    "map-data",
    "buildings.json"
  );

  // Stream-write the array — JSON.stringify on the whole array would blow
  // V8's max string length (this dataset is ~200-300 MB serialized).
  // Trim per-vertex precision while we're at it: 6 decimals on lng/lat (~11
  // cm), 2 decimals on z (1 cm). Cuts the file ~3×.
  const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const ws = fs.createWriteStream(outPath, { encoding: "utf-8" });
  await new Promise<void>((resolve, reject) => {
    ws.on("error", reject);
    ws.on("finish", resolve);
    ws.write("[");
    let first = true;
    for (const b of buildings as any[]) {
      const footprint = b.footprint.map((p: number[]) => [
        round6(p[0]),
        round6(p[1]),
      ]);
      const obj: any = {
        id: b.id,
        footprint,
        height: round2(b.height),
        roofShape: b.roofShape ?? "flat",
        roofHeight: b.roofHeight ?? 0,
      };
      // Mesh buildings — round and attach positions
      if (b.mesh && b.mesh.positions) {
        const src = b.mesh.positions;
        const rounded = new Array<number>(src.length);
        for (let i = 0; i < src.length; i += 3) {
          rounded[i] = round6(src[i]);
          rounded[i + 1] = round6(src[i + 1]);
          rounded[i + 2] = round2(src[i + 2]);
        }
        obj.mesh = { positions: rounded };
      }
      // Pass through any other prism-only fields (type, color, etc.)
      for (const k of ["type", "color", "roofColor", "material", "levels"]) {
        if (b[k] !== undefined) obj[k] = b[k];
      }
      if (!first) ws.write(",");
      ws.write(JSON.stringify(obj));
      first = false;
    }
    ws.write("]");
    ws.end();
  });

  const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
  const totalTris = (buildings as any[]).reduce(
    (s, b) => s + (b.mesh ? b.mesh.positions.length / 9 : 0),
    0
  );
  console.log(
    `\n✅ Wrote ${buildings.length} mesh buildings (${totalTris.toLocaleString()} triangles) → ${outPath} (${sizeMb} MB)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
