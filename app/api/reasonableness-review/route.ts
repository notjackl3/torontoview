import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateCompletionText } from "@/lib/llm/client";
import { extractJsonObject } from "@/lib/llm/json";
import { resolveLlmPreferences } from "@/lib/llm/preferences";

const RequestSchema = z.object({
  building: z.object({
    mode: z.enum(["new-build", "demolish-rebuild", "move-in"]),
    lat: z.number(),
    lng: z.number(),
    zoneType: z.string().optional(),
    floors: z.number().optional(),
    footprintM2: z.number().optional(),
    gfaM2: z.number().optional(),
  }),
  finance: z.object({
    landCost: z.number(),
    constructionCost: z.number(),
    demolitionCost: z.number(),
    fitOutCost: z.number(),
    leaseCostTotal: z.number(),
    totalProjectCost: z.number(),
    annualLease: z.number(),
    materialsCost: z.number().optional(),
    embodiedCo2Kg: z.number().optional(),
  }),
  context: z.object({
    officialPlanZone: z.string().nullable().optional(),
    zoneWarning: z.string().nullable().optional(),
    trafficSummary: z.string().optional(),
    stakeholderSummary: z.string().optional(),
    co2TonnesPerYear: z.number().optional(),
    avgConstructionDb: z.number().optional(),
  }),
  businessIntent: z.string().optional(),
});

const ResponseSchema = z.object({
  verdict: z.enum(["recommended", "feasible-with-changes", "not-recommended"]),
  score: z.number().min(0).max(100),
  headline: z.string(),
  reasons_for: z.array(z.string()).max(6),
  reasons_against: z.array(z.string()).max(6),
  required_actions: z.array(z.string()).max(6),
  key_risks: z.array(z.string()).max(6),
});

export type ReasonablenessReview = z.infer<typeof ResponseSchema>;

const SYSTEM_PROMPT = `You are a senior Toronto urban economics advisor. Given a proposed
building's site, mode, finances, zoning context, traffic impact, and community stakeholder
analysis, you produce a concise reasonableness review. Be specific to Toronto: reference
the Official Plan, transit access if relevant, and stakeholder concerns honestly. Do not
invent metrics. Respond as JSON only matching this shape:
{
  "verdict": "recommended" | "feasible-with-changes" | "not-recommended",
  "score": 0-100,
  "headline": "short single sentence",
  "reasons_for": ["...", ...],
  "reasons_against": ["...", ...],
  "required_actions": ["...", ...],
  "key_risks": ["...", ...]
}`;

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parsed = RequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const userPrompt = JSON.stringify(input, null, 2);
    const prefs = resolveLlmPreferences(request);
    const raw = await generateCompletionText({
      provider: prefs.provider,
      model: prefs.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Evaluate this proposal and respond as JSON only:\n\n${userPrompt}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 1200,
    });

    const parsedJson = extractJsonObject(raw);
    if (!parsedJson) {
      return NextResponse.json(
        { error: "Model returned unparseable JSON", raw },
        { status: 502 },
      );
    }
    const validated = ResponseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return NextResponse.json(
        {
          error: "Model returned malformed JSON",
          detail: validated.error.message,
          raw,
        },
        { status: 502 },
      );
    }
    const parsedReview: ReasonablenessReview = validated.data;

    return NextResponse.json(parsedReview);
  } catch (error) {
    console.error("Reasonableness review failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Reasonableness review failed",
      },
      { status: 500 },
    );
  }
}
