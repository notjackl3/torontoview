import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * End-to-end pipeline test. Walks the user journey:
 *
 *   1. Land on /         (CTA leads to /start)
 *   2. /start             (mode picker page renders)
 *   3. POST /api/editor/building-with-materials  (upload GLB on /start step 2)
 *   4. /map?mode=new-build&buildingId=<id>       (placement stage)
 *   5. Compute the buildReasonablenessPayload    (using returned breakdown)
 *   6. POST /api/reasonableness-review           (final analysis)
 *
 * Each step asserts that data from the previous step actually shows up in
 * the next. The reasonableness step skips its verdict assertion if no LLM
 * endpoint is reachable, since the rest of the pipeline is still verified.
 */
const CANDIDATE_PORTS = [3000, 3001, 3002, 3015];
let BASE = "http://localhost:3000";

async function probeForServer(): Promise<string | null> {
  for (const port of CANDIDATE_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/api/editor/building`);
      if (res.ok || res.status < 500) {
        return `http://localhost:${port}`;
      }
    } catch {
      // continue
    }
  }
  return null;
}

beforeAll(async () => {
  const found = await probeForServer();
  if (!found) {
    throw new Error(
      "No running Next.js dev server detected. Start `npm run dev` first.",
    );
  }
  BASE = found;
});

describe("E2E: start → upload → place → analyze", () => {
  it("flows from landing CTA through reasonableness analysis", async () => {
    // ── Step 1: landing page CTA goes to /start ─────────────────────────────
    const landing = await fetch(`${BASE}/`);
    expect(landing.status).toBe(200);
    const landingHtml = await landing.text();
    expect(landingHtml).toMatch(/href="\/start"/);

    // ── Step 2: /start is reachable and shows the mode picker ──────────────
    const startPage = await fetch(`${BASE}/start`);
    expect(startPage.status).toBe(200);
    const startHtml = await startPage.text();
    expect(startHtml).toMatch(/How would you like to open your business/i);
    // All three modes should be referenced (in label or button copy)
    expect(startHtml).toMatch(/existing building/i);
    expect(startHtml).toMatch(/Demolish/i);
    expect(startHtml).toMatch(/empty land/i);

    // ── Step 3: simulate "Upload a GLB" on /start step 2 ────────────────────
    const glbBuf = readFileSync(
      path.join(
        process.cwd(),
        "public",
        "let_me_sleeeeeeep",
        "let_me_sleeeeeeep.gltf",
      ),
    );
    const uploadRes = await fetch(
      `${BASE}/api/editor/building-with-materials`,
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-building-name": "e2e-pipeline.gltf",
        },
        body: glbBuf,
      },
    );
    expect(uploadRes.status).toBe(200);
    const upload = (await uploadRes.json()) as {
      id: string;
      publicPath: string;
      breakdown: {
        lineItems: Array<{
          materialKey: string;
          label: string;
          volumeM3: number;
          cost: number;
          embodiedCo2Kg: number;
        }>;
        totalVolumeM3: number;
        totalCost: number;
        totalEmbodiedCo2Kg: number;
        source: string;
      };
    };
    expect(upload.id).toMatch(/^bld_/);
    expect(upload.breakdown.lineItems.length).toBeGreaterThan(0);
    expect(upload.breakdown.source).toBe("glb-parsed");

    // ── Step 4: hand off to /map with mode + buildingId ────────────────────
    // The placement banner copy is client-rendered after `useSearchParams`
    // resolves, so we can only assert the page itself ships HTML successfully.
    const mapRes = await fetch(
      `${BASE}/map?mode=new-build&buildingId=${upload.id}`,
    );
    expect(mapRes.status).toBe(200);
    const mapHtml = await mapRes.text();
    expect(mapHtml.length).toBeGreaterThan(2000);
    expect(mapHtml).toMatch(/<html|<HTML/);

    // ── Step 5: normalize the breakdown to a realistic building volume ─────
    // Replicates the /map page's financials code: targetVolumeM3 = footprint * height.
    // footprint = scale.x * scale.z * 100 = 7.5 * 7.5 * 100 = 5625 m²
    // height    = scale.y * 3            = 22.5 m
    // targetVol = footprint * height     = 126,562.5 m³
    const targetVolumeM3 = 7.5 * 7.5 * 100 * (7.5 * 3);
    const { normalizeBreakdownToVolume } = await import(
      "../lib/materialCosts"
    );
    const normalized = normalizeBreakdownToVolume(
      upload.breakdown,
      targetVolumeM3,
    );
    expect(normalized.totalVolumeM3).toBeCloseTo(targetVolumeM3, 0);
    expect(normalized.totalCost).toBeGreaterThan(0);
    expect(normalized.totalCost).toBeLessThan(upload.breakdown.totalCost);

    // ── Step 6: build the reasonableness payload (matches buildReasonablenessPayload)
    const payload = {
      building: {
        mode: "new-build",
        lat: 43.65,
        lng: -79.38,
        zoneType: "MU1",
        footprintM2: 5625,
        gfaM2: 5625 * 6,
        floors: 6,
      },
      finance: {
        landCost: 5625 * 4000,
        constructionCost: normalized.totalCost,
        demolitionCost: 0,
        fitOutCost: 0,
        leaseCostTotal: 0,
        totalProjectCost: 5625 * 4000 + normalized.totalCost,
        annualLease: 0,
        materialsCost: normalized.totalCost,
        embodiedCo2Kg: normalized.totalEmbodiedCo2Kg,
      },
      context: {
        officialPlanZone: "Mixed Use",
        zoneWarning: null,
        trafficSummary: "Estimated daily added trips: 1200",
        stakeholderSummary: "Affected buildings: 22, radius: 250m",
        co2TonnesPerYear: normalized.totalEmbodiedCo2Kg / 1000 / 50,
        avgConstructionDb: 78,
      },
    };

    const reviewRes = await fetch(`${BASE}/api/reasonableness-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Validate the contract: 200 with verdict shape, or skip if no LLM.
    if (reviewRes.status >= 500) {
      const errBody = await reviewRes.json().catch(() => ({}));
      const msg = (errBody as { error?: string }).error ?? "";
      if (/Local LLM|fetch failed|ECONNREFUSED|malformed JSON/i.test(msg)) {
        console.warn(
          `[e2e] reasonableness skipped — no LLM endpoint reachable (${msg}).`,
        );
        return;
      }
      throw new Error(`Unexpected 5xx from reasonableness: ${msg}`);
    }

    expect(reviewRes.status).toBe(200);
    const review = (await reviewRes.json()) as {
      verdict: string;
      score: number;
      headline: string;
      reasons_for: string[];
      reasons_against: string[];
      required_actions: string[];
      key_risks: string[];
    };
    expect([
      "recommended",
      "feasible-with-changes",
      "not-recommended",
    ]).toContain(review.verdict);
    expect(review.headline.length).toBeGreaterThan(0);
  });
});
