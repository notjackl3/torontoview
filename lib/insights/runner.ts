import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { generateCompletion } from "@/lib/llm/client";
import { extractJsonObject } from "@/lib/llm/json";
import { resolveLlmPreferences } from "@/lib/llm/preferences";
import {
  InsightResponseSchema,
  ProjectBriefSchema,
  type InsightResponse,
  type ProjectBrief,
} from "./schemas";
import { buildInsightUserPrompt, type InsightUserPromptInput } from "./promptTemplates";

interface InsightRunOptions {
  request: Request;
  systemPrompt: string;
  input: InsightUserPromptInput;
  temperature?: number;
  maxTokens?: number;
}

interface InsightSuccess<T> {
  ok: true;
  data: T;
  meta: { provider: string; model: string; latencyMs: number };
}

interface InsightFailure {
  ok: false;
  status: number;
  error: string;
  raw?: string;
}

export type InsightOutcome<T> = InsightSuccess<T> | InsightFailure;

async function runInsight<T>(
  opts: InsightRunOptions,
  schema: ZodType<T>,
): Promise<InsightOutcome<T>> {
  let raw: string | undefined;
  try {
    const prefs = resolveLlmPreferences(opts.request);
    const { text, meta } = await generateCompletion({
      provider: prefs.provider,
      model: prefs.model,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: buildInsightUserPrompt(opts.input) },
      ],
      temperature: opts.temperature ?? 0.25,
      maxTokens: opts.maxTokens ?? 1200,
      responseFormat: { type: "json_object" },
    });
    raw = text;
    const parsed = extractJsonObject(text);
    if (!parsed) {
      return { ok: false, status: 502, error: "Model returned unparseable JSON.", raw: text };
    }
    const validated = schema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        status: 502,
        error: `Model output failed schema validation: ${validated.error.message}`,
        raw: text,
      };
    }
    return {
      ok: true,
      data: validated.data,
      meta: { provider: meta.provider, model: meta.model, latencyMs: meta.latencyMs },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : "LLM request failed",
      raw,
    };
  }
}

export function runStandardInsight(opts: InsightRunOptions): Promise<InsightOutcome<InsightResponse>> {
  return runInsight(opts, InsightResponseSchema);
}

export function runProjectBriefInsight(opts: InsightRunOptions): Promise<InsightOutcome<ProjectBrief>> {
  return runInsight(opts, ProjectBriefSchema);
}

export function toResponse<T>(outcome: InsightOutcome<T>): NextResponse {
  if (outcome.ok) {
    return NextResponse.json({ ...outcome.data, _meta: outcome.meta });
  }
  return NextResponse.json(
    { error: outcome.error, raw: outcome.raw },
    { status: outcome.status },
  );
}
