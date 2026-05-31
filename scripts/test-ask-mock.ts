/**
 * Mock test for the highlight-ask feature, exercised against the
 * Phở & Filter sample plan + a placed building in Waterfront
 * Communities-The Island. Writes the request/response pair to
 * lib/__mocks__/ask/ so they can be replayed without burning Tavily / LLM
 * credits.
 *
 * Run:
 *   npx tsx scripts/test-ask-mock.ts
 *
 * Requires .env.local with TAVILY_API_KEY set (and either a local LLM
 * running or OPENAI_BASE_URL/OPENAI_MODEL configured for the LLM step).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// Tiny .env.local loader — avoids pulling in dotenv.
function loadEnvLocal() {
  const path = join(REPO_ROOT, ".env.local");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

import { vietnameseCafeMockPlan } from "../lib/businessPlan";
import { tavilySearch, isTavilyConfigured } from "../lib/tavilySearch";

const OUT_DIR = join(REPO_ROOT, "lib", "__mocks__", "ask");

function ensureOutDir() {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
}

function writeJson(name: string, data: unknown) {
  ensureOutDir();
  const path = join(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(data, null, 2));
  console.log(`  → wrote ${path}`);
}

// Mock context bundle as if the user highlighted "80%" in the Demographics
// panel of the Phở & Filter plan placed at the Waterfront Communities site.
function buildMockContext() {
  const plan = vietnameseCafeMockPlan("mock-plan-1", "mock-building-1");
  return {
    selectedText: "80%",
    panel: {
      id: "demographics" as const,
      title: "Demographics & Catchment",
      fields: {
        neighbourhood: "Waterfront Communities-The Island",
        population: 65913,
        densityPerKm2: 8943,
        households: 40750,
        avgHouseholdSize: 1.61,
        incomeRecipients: 60605,
        workingAge25to54: 45105,
        anchorLat: 43.6394,
        anchorLng: -79.3779,
      },
    },
    businessPlan: {
      id: plan.id,
      buildingId: plan.buildingId,
      name: plan.concept.name,
      category: plan.concept.category,
      valueProp: plan.concept.valueProp,
      targetAgeMin: plan.concept.targetAgeMin,
      targetAgeMax: plan.concept.targetAgeMax,
      targetIncomeTier: plan.concept.targetIncomeTier,
      serviceModel: plan.operations.serviceModel,
      seatingCapacity: plan.operations.seatingCapacity,
      rent: plan.financials.rent,
    },
    buildings: [
      {
        id: "mock-building-1",
        lat: 43.6394,
        lng: -79.3779,
        buildMode: "new-build",
        floors: 3,
        floorHeightM: 3.5,
        totalHeightM: 10.5,
        footprintSqm: 380,
        gfaSqm: 1140,
        rotationDeg: 0,
        scale: { x: 1, y: 3, z: 1 },
        tenantFloor: 1,
        neighbourhoodName: "Waterfront Communities-The Island",
        zoningCode: "CR",
      },
    ],
    analyses: {
      demographics: {
        neighbourhood: "Waterfront Communities-The Island",
        densityPerKm2: 8943,
        households: 40750,
        avgHouseholdSize: 1.61,
        workingAge25to54: 45105,
        matchPct: 80,
        matchVerdict: "Strong fit",
      },
    },
    cityFacts: {
      neighbourhoodName: "Waterfront Communities-The Island",
      populationDensity: 8943,
      households: 40750,
      ageMix: {
        workingAge25to54Pct: 68,
        youth15to24Pct: 12,
        seniors65plusPct: 7,
      },
      nearbyBusinesses: [
        { name: "Boxcar Social", cat: "cafe", distanceM: 120 },
        { name: "Sumach Espresso", cat: "cafe", distanceM: 240 },
        { name: "Lavelle", cat: "restaurant", distanceM: 310 },
      ],
      nearbyParks: [{ name: "HTO Park", distanceM: 180 }],
      streetTreesWithin50m: 14,
      waterFeaturesWithin200m: [{ name: "Lake Ontario", distanceM: 90 }],
      intersectionsWithin250m: 4,
      walkabilityHint: "high",
    },
    generatedAt: Date.now(),
  };
}

async function testTavily(question: string, context: ReturnType<typeof buildMockContext>) {
  if (!isTavilyConfigured()) {
    console.log("Tavily not configured — skipping search step.");
    return null;
  }
  const query = [
    question,
    context.panel.title,
    context.cityFacts.neighbourhoodName,
    context.businessPlan?.category,
    "Toronto",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 280);
  console.log(`  Tavily query: ${query}`);
  const result = await tavilySearch(query, { maxResults: 5 });
  console.log(`  Tavily returned ${result.snippets.length} snippets`);
  return { query: result.query, snippets: result.snippets };
}

async function postAsk(question: string, context: unknown, useExternal: boolean) {
  const url = process.env.ASK_API_URL || "http://localhost:3000/api/ask";
  console.log(`  POST ${url} (useExternal=${useExternal})`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context, useExternal, history: [] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${url} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const context = buildMockContext();
  writeJson("mock-context.json", context);

  const questions = [
    "What does an 80% match actually mean for my business?",
    "What should I do to improve revenue at this site?",
  ];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`\n# Question ${i + 1}: ${q}`);

    // 1) Tavily-only test (no LLM dependency).
    try {
      const tavily = await testTavily(q, context);
      if (tavily) writeJson(`tavily-q${i + 1}.json`, tavily);
    } catch (err) {
      console.error(`  Tavily failed: ${err instanceof Error ? err.message : err}`);
    }

    // 2) Optional: full /api/ask pipeline if the dev server is running.
    if (process.env.ASK_RUN_LIVE === "1") {
      for (const useExternal of [false, true]) {
        try {
          const ask = await postAsk(q, context, useExternal);
          writeJson(`ask-q${i + 1}-${useExternal ? "external" : "internal"}.json`, ask);
        } catch (err) {
          console.error(`  /api/ask failed: ${err instanceof Error ? err.message : err}`);
        }
      }
    } else {
      console.log(
        "  (skipping live /api/ask — set ASK_RUN_LIVE=1 and run `npm run dev` in another terminal to exercise the full pipeline)",
      );
    }
  }

  console.log("\nDone. Mock fixtures in lib/__mocks__/ask/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
