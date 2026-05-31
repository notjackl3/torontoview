import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Integration tests hit the running Next.js dev server. The test runner
 * does NOT spawn a server — start `npm run dev` (or `next dev`) in another
 * terminal before running. The auto-probe below picks whichever common port
 * answers /api/editor/building (a GET that exists since the project started).
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
      "No running Next.js dev server detected on ports 3000/3001/3002/3015. " +
        "Start `npm run dev` and re-run the tests.",
    );
  }
  BASE = found;
  console.log(`[integration] using dev server at ${BASE}`);
});

describe("pipeline: page routes", () => {
  it.each([
    ["/start"],
    ["/map"],
    ["/map?mode=move-in"],
    ["/map?mode=demolish-rebuild"],
    ["/map?mode=new-build"],
    ["/"],
  ])("GET %s returns 200", async (route) => {
    const res = await fetch(`${BASE}${route}`);
    expect(res.status, `${route} unexpected status`).toBe(200);
    const html = await res.text();
    expect(html.length).toBeGreaterThan(100);
  });

  it("/start renders the mode picker headline", async () => {
    const res = await fetch(`${BASE}/start`);
    const html = await res.text();
    expect(html).toMatch(/Step 1 of 3/);
    expect(html).toMatch(/How would you like to open your business/i);
  });

  it("landing page CTA points to /start", async () => {
    const res = await fetch(`${BASE}/`);
    const html = await res.text();
    expect(html).toMatch(/href="\/start"/);
  });
});

describe("pipeline: building upload + material parse", () => {
  it("POST /api/editor/building-with-materials rejects non-octet uploads", async () => {
    const res = await fetch(`${BASE}/api/editor/building-with-materials`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fake: true }),
    });
    expect(res.status).toBe(400);
  });

  it("parses materials and returns a breakdown for a real glTF", async () => {
    const buf = readFileSync(
      path.join(
        process.cwd(),
        "public",
        "let_me_sleeeeeeep",
        "let_me_sleeeeeeep.gltf",
      ),
    );
    const res = await fetch(`${BASE}/api/editor/building-with-materials`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-building-name": "integration-test.gltf",
      },
      body: buf,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      publicPath: string;
      breakdown: {
        lineItems: Array<{ label: string; volumeM3: number; cost: number }>;
        totalCost: number;
        source: string;
      };
    };
    expect(body.id).toMatch(/^bld_/);
    expect(body.publicPath).toMatch(/^\/map-data\/buildings\//);
    expect(body.breakdown.lineItems.length).toBeGreaterThan(0);
    expect(body.breakdown.totalCost).toBeGreaterThan(0);
    expect(body.breakdown.source).toBe("glb-parsed");
  });
});

describe("pipeline: blueprint → 3D", () => {
  it("returns 503 with a clear message when MESHY_API_KEY is not configured", async () => {
    const fd = new FormData();
    fd.append(
      "image",
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }),
      "stub.png",
    );
    const res = await fetch(`${BASE}/api/blueprint-to-3d`, {
      method: "POST",
      body: fd,
    });
    // We accept either 503 (no key) or 200 (key present); the test must pass
    // in both environments.
    if (res.status === 503) {
      const body = (await res.json()) as { error: string };
      expect(body.error).toMatch(/MESHY_API_KEY/);
    } else if (res.status === 200) {
      const body = (await res.json()) as { breakdown?: { totalCost: number } };
      expect(body.breakdown?.totalCost).toBeGreaterThan(0);
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  it("rejects requests with no 'image' field", async () => {
    const res = await fetch(`${BASE}/api/blueprint-to-3d`, {
      method: "POST",
      body: new FormData(),
    });
    // 400 expected before the env check fires; 503 if env check runs first.
    expect([400, 503]).toContain(res.status);
  });
});

describe("pipeline: reasonableness review", () => {
  it("rejects malformed payloads with 400 and Zod errors", async () => {
    const res = await fetch(`${BASE}/api/reasonableness-review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail: unknown };
    expect(body.error).toMatch(/Invalid request/i);
  });

  it(
    "returns a verdict shape when a valid payload is sent (requires local LLM)",
    async () => {
      const payload = {
        building: {
          mode: "new-build",
          lat: 43.65,
          lng: -79.38,
          zoneType: "MU1",
          footprintM2: 1200,
          gfaM2: 6000,
          floors: 5,
        },
        finance: {
          landCost: 4_800_000,
          constructionCost: 21_000_000,
          demolitionCost: 0,
          fitOutCost: 0,
          leaseCostTotal: 0,
          totalProjectCost: 25_800_000,
          annualLease: 0,
          materialsCost: 18_500_000,
          embodiedCo2Kg: 4_200_000,
        },
        context: {
          officialPlanZone: "Mixed Use",
          zoneWarning: null,
          trafficSummary: "Estimated daily added trips: 850",
          stakeholderSummary: "Affected buildings: 14, radius: 250m",
          co2TonnesPerYear: 1300,
          avgConstructionDb: 78,
        },
      };
      const res = await fetch(`${BASE}/api/reasonableness-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 500 || res.status === 502) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? "";
        // If no LLM is reachable, the request bubbles up a network/parse error.
        // Skip rather than fail — the route logic itself is exercised above.
        if (
          /Local LLM request failed|fetch failed|ECONNREFUSED|malformed JSON/i.test(
            msg,
          )
        ) {
          console.warn(
            `[reasonableness] skipping verdict-shape check: ${msg}`,
          );
          return;
        }
      }

      expect(res.status).toBe(200);
      const body = (await res.json()) as {
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
      ]).toContain(body.verdict);
      expect(body.score).toBeGreaterThanOrEqual(0);
      expect(body.score).toBeLessThanOrEqual(100);
      expect(body.headline.length).toBeGreaterThan(0);
      expect(Array.isArray(body.reasons_for)).toBe(true);
      expect(Array.isArray(body.reasons_against)).toBe(true);
      expect(Array.isArray(body.required_actions)).toBe(true);
      expect(Array.isArray(body.key_risks)).toBe(true);
    },
    120_000,
  );
});

afterAll(() => {
  // No teardown — uploaded test buildings live in public/map-data/buildings
  // and are auto-cleaned by the existing endpoint after 24h.
});
