/**
 * Extend map data layers (zoning, parks, trees, businesses) so their
 * coverage spans the full visible map area, not just the central downtown
 * bbox where authoritative open-data is available.
 *
 * Existing data is preserved verbatim. Synthetic features are appended
 * only outside the existing coverage so the real data continues to render
 * unchanged, with plausible-looking fill in the surrounding area.
 *
 * Run with: npx tsx scripts/extend-map-coverage.ts
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.join(process.cwd(), "public", "map-data");

// Full visible map bbox (matches ThreeMap mapBbox: data bbox extended 1.5×
// in each direction). Synthetic features tile this area.
const MAP_BBOX = {
  minLat: 43.61,
  maxLat: 43.69,
  minLng: -79.44,
  maxLng: -79.32,
};

// Authoritative downtown bbox — existing data already fills this. Synthetic
// features must not overlap. A small pad keeps a visible boundary clean.
const EXISTING_BBOX = {
  minLat: 43.638,
  maxLat: 43.6665,
  minLng: -79.401,
  maxLng: -79.359,
};

// Deterministic PRNG so reruns produce identical output.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function inExisting(lat: number, lng: number): boolean {
  return (
    lat >= EXISTING_BBOX.minLat &&
    lat <= EXISTING_BBOX.maxLat &&
    lng >= EXISTING_BBOX.minLng &&
    lng <= EXISTING_BBOX.maxLng
  );
}

// ─── Zoning ──────────────────────────────────────────────────────────────

interface ZoneFeature {
  id: number;
  code: string;
  gen: number;
  polygons: number[][][][]; // MultiPolygon
}

// GEN_ZONE distribution for synthetic blocks. Toronto's outer areas are
// dominated by residential with commercial-residential along arterials.
const ZONE_MIX: Array<{ code: string; gen: number; weight: number }> = [
  { code: "R", gen: 1, weight: 60 }, // Residential
  { code: "RD", gen: 1, weight: 8 }, // Residential Detached
  { code: "RM", gen: 1, weight: 5 }, // Residential Multiple
  { code: "CR", gen: 2, weight: 14 }, // Commercial-Residential
  { code: "OS", gen: 4, weight: 4 }, // Open Space
  { code: "I", gen: 5, weight: 4 }, // Institutional
  { code: "E", gen: 3, weight: 3 }, // Employment
  { code: "U", gen: 6, weight: 2 }, // Utility
];
const ZONE_TOTAL = ZONE_MIX.reduce((a, z) => a + z.weight, 0);

function pickZone(rng: () => number, lat: number, lng: number) {
  // Bias commercial-residential along main arterials (Yonge ≈ -79.383,
  // Bloor ≈ 43.671, Queen ≈ 43.652). Anywhere within ~120m of an arterial,
  // double the CR weight.
  const arterial =
    Math.abs(lng + 79.383) < 0.0012 || // Yonge
    Math.abs(lng + 79.4) < 0.0012 || // Bathurst-ish
    Math.abs(lng + 79.34) < 0.0012 || // Broadview-ish
    Math.abs(lat - 43.671) < 0.0009 || // Bloor
    Math.abs(lat - 43.652) < 0.0009 || // Queen
    Math.abs(lat - 43.665) < 0.0009; // Dundas-ish

  const mix = arterial
    ? ZONE_MIX.map((z) =>
        z.code === "CR" ? { ...z, weight: z.weight * 4 } : z,
      )
    : ZONE_MIX;
  const total = mix.reduce((a, z) => a + z.weight, 0);
  let r = rng() * total;
  for (const z of mix) {
    r -= z.weight;
    if (r <= 0) return z;
  }
  return mix[0];
}

function extendZoning(): { added: number; total: number } {
  const file = path.join(DATA_DIR, "zoning.json");
  const existing = JSON.parse(fs.readFileSync(file, "utf8")) as ZoneFeature[];
  const maxId = existing.reduce((m, f) => Math.max(m, f.id), 0);

  const rng = makeRng(20260531);

  // ~22 × 24 grid → ~440m × 500m cells. Leaves a 4m gap between cells so
  // adjacent blocks read as separate parcels with implied street between.
  const LAT_STEPS = 22;
  const LNG_STEPS = 24;
  const GAP = 0.00004; // ≈4.5m

  const latStep = (MAP_BBOX.maxLat - MAP_BBOX.minLat) / LAT_STEPS;
  const lngStep = (MAP_BBOX.maxLng - MAP_BBOX.minLng) / LNG_STEPS;

  const synthetic: ZoneFeature[] = [];
  let id = maxId + 1;

  for (let i = 0; i < LAT_STEPS; i++) {
    for (let j = 0; j < LNG_STEPS; j++) {
      const lat0 = MAP_BBOX.minLat + i * latStep + GAP;
      const lat1 = MAP_BBOX.minLat + (i + 1) * latStep - GAP;
      const lng0 = MAP_BBOX.minLng + j * lngStep + GAP;
      const lng1 = MAP_BBOX.minLng + (j + 1) * lngStep - GAP;
      const cLat = (lat0 + lat1) / 2;
      const cLng = (lng0 + lng1) / 2;

      // Skip cells that fall inside the authoritative existing bbox.
      if (inExisting(cLat, cLng)) continue;

      // Small per-corner jitter so cells don't look like a perfect grid.
      const j1 = (rng() - 0.5) * latStep * 0.15;
      const j2 = (rng() - 0.5) * lngStep * 0.15;
      const j3 = (rng() - 0.5) * latStep * 0.15;
      const j4 = (rng() - 0.5) * lngStep * 0.15;

      const z = pickZone(rng, cLat, cLng);
      const ring: number[][] = [
        [lng0 + j2, lat0 + j1],
        [lng1 + j4, lat0 + j1],
        [lng1 + j4, lat1 + j3],
        [lng0 + j2, lat1 + j3],
        [lng0 + j2, lat0 + j1], // close
      ];
      synthetic.push({
        id: id++,
        code: z.code,
        gen: z.gen,
        polygons: [[ring]],
      });
    }
  }

  const out = existing.concat(synthetic);
  fs.writeFileSync(file, JSON.stringify(out));
  return { added: synthetic.length, total: out.length };
}

// ─── Parks ───────────────────────────────────────────────────────────────

interface ParkFeature {
  id: number;
  name: string;
  cls: string;
  polygons: number[][][][];
}

function extendParks(): { added: number; total: number } {
  const file = path.join(DATA_DIR, "parks.json");
  const existing = JSON.parse(fs.readFileSync(file, "utf8")) as ParkFeature[];
  const maxId = existing.reduce((m, f) => Math.max(m, f.id), 0);

  const rng = makeRng(42424242);

  // Scatter ~40 small parks across the outer area. Sizes range from
  // pocket parks (~60m square) to neighbourhood parks (~180m square).
  const TARGET = 40;
  const synthetic: ParkFeature[] = [];
  let id = maxId + 1;
  let attempts = 0;

  while (synthetic.length < TARGET && attempts < TARGET * 12) {
    attempts++;
    const lat = MAP_BBOX.minLat + rng() * (MAP_BBOX.maxLat - MAP_BBOX.minLat);
    const lng = MAP_BBOX.minLng + rng() * (MAP_BBOX.maxLng - MAP_BBOX.minLng);
    if (inExisting(lat, lng)) continue;

    const halfLat = 0.00025 + rng() * 0.0006; // ~28–95m half-extent
    const halfLng = 0.00035 + rng() * 0.0008;

    const ring: number[][] = [
      [lng - halfLng, lat - halfLat],
      [lng + halfLng, lat - halfLat],
      [lng + halfLng, lat + halfLat],
      [lng - halfLng, lat + halfLat],
      [lng - halfLng, lat - halfLat],
    ];
    const r = rng();
    const cls =
      r < 0.7 ? "PARK" : r < 0.9 ? "OTHER_OPEN_SPACE" : "OTHER_CITY";
    synthetic.push({
      id: id++,
      name: cls === "PARK" ? "Local Park" : "Open Space",
      cls,
      polygons: [[ring]],
    });
  }

  const out = existing.concat(synthetic);
  fs.writeFileSync(file, JSON.stringify(out));
  return { added: synthetic.length, total: out.length };
}

// ─── Trees ───────────────────────────────────────────────────────────────

interface TreeFeature {
  lng: number;
  lat: number;
  species: string;
  dbh: number;
}

const SPECIES = [
  "Maple, Norway",
  "Maple, Silver",
  "Maple, Sugar",
  "Honey locust",
  "Elm",
  "Oak, Red",
  "Linden",
  "Basswood, American",
  "Ash, Green",
  "Kentucky coffeetree",
];

function extendTrees(): { added: number; total: number } {
  const file = path.join(DATA_DIR, "trees.json");
  const existing = JSON.parse(fs.readFileSync(file, "utf8")) as TreeFeature[];

  const rng = makeRng(7777777);

  // Existing density is ~5920 trees in ~0.02 × 0.03 deg = ~6 km² → ~1000/km².
  // The outer ring is ~9.6 km² (map area minus existing bbox). Add roughly
  // 1/3 that density (~3200) to evoke residential tree cover without
  // blowing rendering budget.
  const TARGET = 3200;
  const synthetic: TreeFeature[] = [];
  let attempts = 0;
  while (synthetic.length < TARGET && attempts < TARGET * 4) {
    attempts++;
    const lat = MAP_BBOX.minLat + rng() * (MAP_BBOX.maxLat - MAP_BBOX.minLat);
    const lng = MAP_BBOX.minLng + rng() * (MAP_BBOX.maxLng - MAP_BBOX.minLng);
    if (inExisting(lat, lng)) continue;
    const species = SPECIES[Math.floor(rng() * SPECIES.length)];
    const dbh = Math.max(2, Math.floor(rng() * 60));
    synthetic.push({ lng, lat, species: `"${species}"`, dbh });
  }

  const out = existing.concat(synthetic);
  fs.writeFileSync(file, JSON.stringify(out));
  return { added: synthetic.length, total: out.length };
}

// ─── Businesses ──────────────────────────────────────────────────────────

interface BusinessFeature {
  name: string;
  cat: string;
  lat: number;
  lng: number;
  addr: string;
}

const BIZ_PRESETS: Array<{ name: string; cat: string }> = [
  { name: "Tim Hortons", cat: "cafe" },
  { name: "Starbucks", cat: "cafe" },
  { name: "Second Cup", cat: "cafe" },
  { name: "McDonald's", cat: "fast_food" },
  { name: "Subway", cat: "fast_food" },
  { name: "Pizza Pizza", cat: "fast_food" },
  { name: "Shoppers Drug Mart", cat: "pharmacy" },
  { name: "Rexall", cat: "pharmacy" },
  { name: "Metro", cat: "supermarket" },
  { name: "Loblaws", cat: "supermarket" },
  { name: "FreshCo", cat: "supermarket" },
  { name: "LCBO", cat: "alcohol" },
  { name: "Beer Store", cat: "alcohol" },
  { name: "Scotiabank", cat: "bank" },
  { name: "TD Canada Trust", cat: "bank" },
  { name: "RBC", cat: "bank" },
  { name: "BMO", cat: "bank" },
  { name: "Esso", cat: "fuel" },
  { name: "Petro-Canada", cat: "fuel" },
  { name: "Local Diner", cat: "restaurant" },
  { name: "Corner Pub", cat: "pub" },
  { name: "Family Dentist", cat: "dentist" },
  { name: "Walk-In Clinic", cat: "clinic" },
  { name: "Hair Studio", cat: "hairdresser" },
];

function extendBusinesses(): { added: number; total: number } {
  const file = path.join(DATA_DIR, "businesses.json");
  const existing = JSON.parse(
    fs.readFileSync(file, "utf8"),
  ) as BusinessFeature[];

  const rng = makeRng(13131313);

  // Add ~500 businesses scattered across the outer ring, biased toward
  // arterial corridors where commercial activity actually clusters.
  const TARGET = 500;
  const synthetic: BusinessFeature[] = [];
  let attempts = 0;
  while (synthetic.length < TARGET && attempts < TARGET * 6) {
    attempts++;
    const lat = MAP_BBOX.minLat + rng() * (MAP_BBOX.maxLat - MAP_BBOX.minLat);
    const lng = MAP_BBOX.minLng + rng() * (MAP_BBOX.maxLng - MAP_BBOX.minLng);
    if (inExisting(lat, lng)) continue;
    // Bias toward arterials — reject most non-arterial samples.
    const nearArterial =
      Math.abs(lng + 79.383) < 0.002 ||
      Math.abs(lng + 79.4) < 0.002 ||
      Math.abs(lng + 79.34) < 0.002 ||
      Math.abs(lat - 43.671) < 0.0015 ||
      Math.abs(lat - 43.652) < 0.0015;
    if (!nearArterial && rng() > 0.2) continue;
    const preset = BIZ_PRESETS[Math.floor(rng() * BIZ_PRESETS.length)];
    synthetic.push({
      name: preset.name,
      cat: preset.cat,
      lat,
      lng,
      addr: "",
    });
  }

  const out = existing.concat(synthetic);
  fs.writeFileSync(file, JSON.stringify(out));
  return { added: synthetic.length, total: out.length };
}

// ─── Main ────────────────────────────────────────────────────────────────

function main() {
  console.log("Extending map data coverage to full visible bbox…");
  console.log("  Map bbox:", MAP_BBOX);
  console.log("  Existing coverage preserved in:", EXISTING_BBOX);
  console.log();

  const z = extendZoning();
  console.log(`zoning.json     → +${z.added} synthetic / ${z.total} total`);

  const p = extendParks();
  console.log(`parks.json      → +${p.added} synthetic / ${p.total} total`);

  const t = extendTrees();
  console.log(`trees.json      → +${t.added} synthetic / ${t.total} total`);

  const b = extendBusinesses();
  console.log(`businesses.json → +${b.added} synthetic / ${b.total} total`);

  console.log("\nDone.");
}

main();
