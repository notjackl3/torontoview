import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInsightUserPrompt,
  PROJECT_BRIEF_SYSTEM,
  SHADOW_IMPACT_SYSTEM,
  TRAFFIC_IMPACT_SYSTEM,
  WATER_IMPACT_SYSTEM,
  WIND_NOISE_SYSTEM,
} from "./promptTemplates";
import { extractJsonObject } from "@/lib/llm/json";
import { InsightResponseSchema, ProjectBriefSchema } from "./schemas";
import { runProjectBriefInsight, runStandardInsight } from "./runner";

describe("insight prompt templates", () => {
  it("declares the full Toronto-grounded response shape for each domain", () => {
    for (const prompt of [
      WATER_IMPACT_SYSTEM,
      TRAFFIC_IMPACT_SYSTEM,
      SHADOW_IMPACT_SYSTEM,
      WIND_NOISE_SYSTEM,
    ]) {
      expect(prompt).toMatch(/summary/);
      expect(prompt).toMatch(/risks/);
      expect(prompt).toMatch(/recommendations/);
      expect(prompt).toMatch(/Toronto/);
    }
    expect(PROJECT_BRIEF_SYSTEM).toMatch(/verdict/);
    expect(PROJECT_BRIEF_SYSTEM).toMatch(/bySection/);
  });

  it("buildInsightUserPrompt renders simulation + context blocks", () => {
    const prompt = buildInsightUserPrompt({
      projectDescription: "5-storey mixed use",
      simulation: { runoffM3: 12, imperviousPct: 0.7 },
      context: { neighbourhood: "Trinity-Bellwoods" },
    });
    expect(prompt).toContain("5-storey mixed use");
    expect(prompt).toContain('"runoffM3": 12');
    expect(prompt).toContain('"neighbourhood": "Trinity-Bellwoods"');
    expect(prompt).toContain("Return JSON only.");
  });
});

describe("extractJsonObject", () => {
  it("parses plain JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences", () => {
    expect(extractJsonObject("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("recovers the first JSON object from preamble", () => {
    expect(
      extractJsonObject("Here you go:\n{\"a\":1,\"b\":[1,2]}\nthanks!"),
    ).toEqual({ a: 1, b: [1, 2] });
  });

  it("returns null when nothing parseable is present", () => {
    expect(extractJsonObject("not json")).toBeNull();
  });
});

describe("insight schemas", () => {
  it("accepts a well-formed insight response", () => {
    const parsed = InsightResponseSchema.parse({
      summary: "ok",
      risks: [
        { title: "x", severity: "moderate", detail: "y" },
      ],
      recommendations: [
        { action: "do", rationale: "because", effort: "low" },
      ],
      scores: { drainage: 70 },
    });
    expect(parsed.summary).toBe("ok");
  });

  it("rejects an invalid severity", () => {
    const out = InsightResponseSchema.safeParse({
      summary: "ok",
      risks: [{ title: "x", severity: "catastrophic", detail: "y" }],
      recommendations: [],
    });
    expect(out.success).toBe(false);
  });

  it("validates project brief shape", () => {
    const parsed = ProjectBriefSchema.parse({
      summary: "headline",
      verdict: "conditional",
      score: 72,
      highlights: ["a"],
      concerns: ["b"],
      nextSteps: ["c"],
      bySection: { water: "fine", traffic: "ok" },
    });
    expect(parsed.verdict).toBe("conditional");
  });
});

describe("runStandardInsight (mocked fetch)", () => {
  const envBackup = process.env.NVIDIA_API_KEY;

  beforeEach(() => {
    process.env.NVIDIA_API_KEY = "nvapi-test";
    process.env.NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (envBackup === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = envBackup;
  });

  it("parses a valid NIM JSON-mode response into an InsightResponse", async () => {
    const modelJson = {
      summary: "Mild local drainage stress",
      risks: [
        {
          title: "Combined sewer surcharge",
          severity: "moderate",
          detail: "Downtown CSO catchment",
        },
      ],
      recommendations: [
        {
          action: "Add a 5 m3 cistern",
          rationale: "Detain peak runoff",
          effort: "moderate",
        },
      ],
      scores: { drainage: 62 },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "meta/llama-3.3-nemotron-super-49b-v1",
          choices: [{ message: { content: JSON.stringify(modelJson) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const req = new Request("https://example.com/api/insights/water-impact");
    const outcome = await runStandardInsight({
      request: req,
      systemPrompt: WATER_IMPACT_SYSTEM,
      input: { simulation: { runoffM3: 12 } },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.summary).toMatch(/drainage/i);
    expect(outcome.data.risks).toHaveLength(1);
    expect(outcome.meta.provider).toBe("nvidia-nim");
  });

  it("returns a structured failure when the model returns unparseable JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "I refuse to JSON." } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const req = new Request("https://example.com/api/insights/water-impact");
    const outcome = await runStandardInsight({
      request: req,
      systemPrompt: WATER_IMPACT_SYSTEM,
      input: { simulation: { runoffM3: 12 } },
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(502);
    expect(outcome.error).toMatch(/unparseable|schema/);
  });

  it("validates a project brief and returns it through runProjectBriefInsight", async () => {
    const brief = {
      summary: "Mid-rise infill in Trinity-Bellwoods. Net positive with conditions.",
      verdict: "conditional",
      score: 71,
      highlights: ["Strong transit access"],
      concerns: ["Shadow on park edge"],
      nextSteps: ["Public consultation"],
      bySection: {
        water: "Manageable with cistern.",
        traffic: "Minor curbside pressure.",
        shadow: "March 21 9am hit on park edge.",
        windNoise: "Within MECP envelope.",
      },
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "meta/llama-3.3-nemotron-super-49b-v1",
          choices: [{ message: { content: JSON.stringify(brief) } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const req = new Request("https://example.com/api/insights/project-brief");
    const outcome = await runProjectBriefInsight({
      request: req,
      systemPrompt: PROJECT_BRIEF_SYSTEM,
      input: { simulation: { water: {}, traffic: {}, shadow: {}, windNoise: {} } },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.verdict).toBe("conditional");
    expect(outcome.data.score).toBe(71);
  });
});
