import { NextRequest, NextResponse } from "next/server";
import { generateLocalCompletionWithRetry } from "@/lib/localLlm";

/**
 * On-demand competitor analysis for a single nearby business. The map view
 * has a red pin per competitor; clicking it POSTs here and renders the
 * answer in a popup. Results are cached client-side keyed on the
 * (planId, competitorName, lng, lat) tuple so repeat clicks don't re-bill.
 */

interface CompetitorBrief {
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceM?: number;
  address?: string;
}

interface BusinessBrief {
  name?: string;
  category?: string;
  valueProp?: string;
  targetAgeMin?: number;
  targetAgeMax?: number;
  targetIncomeTier?: string;
  priceTier?: string;
  monthlyRent?: number;
  seatingCapacity?: number;
  buildingLat?: number;
  buildingLng?: number;
  neighbourhood?: string | null;
}

interface CompetitorAnalysisRequest {
  competitor: CompetitorBrief;
  business: BusinessBrief;
}

export interface CompetitorAnalysisResponse {
  threatLevel: "low" | "moderate" | "high";
  headline: string;
  risks: string[];
  differentiators: string[];
  recommendation: string;
}

const SYSTEM_PROMPT = `You are a small-business advisor analysing a single
nearby competitor for a founder opening a shop in downtown Toronto. Given the
founder's business plan and one specific competitor, return a JSON object
with this exact shape:

{
  "threatLevel": "low" | "moderate" | "high",
  "headline": "one short sentence (<= 90 chars)",
  "risks": ["bullet 1", "bullet 2", "bullet 3"],
  "differentiators": ["bullet 1", "bullet 2"],
  "recommendation": "one short paragraph (<= 240 chars)"
}

Rules:
- Output ONLY the JSON object. No prose before or after. No code fences.
- Be specific to BOTH businesses. Use the category, distance, price tier,
  target customer, and value prop that are in the input. Do not invent
  details that are not provided.
- threatLevel reasoning: same category + close distance + overlapping
  target = high. Adjacent category or distance > 400 m = moderate.
  Different category and no overlap = low.
- risks: concrete pressures (price war, foot-traffic split, hours overlap,
  established loyalty, parking).
- differentiators: realistic ways the founder can stand out, grounded in
  their plan's value prop and price tier.
- recommendation: an action the founder should take this month.`;

function safeStringify(value: unknown, maxChars: number): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + "\n…(truncated)";
  } catch {
    return String(value).slice(0, maxChars);
  }
}

function extractJsonObject(raw: string): unknown | null {
  // The local LLM sometimes wraps output in ```json fences or adds a short
  // preamble. Strip both before JSON.parse.
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = stripped.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

// Models love to vary phrasing — "Medium" instead of "moderate", "MED",
// "mid", etc. Normalize to our three buckets.
function normalizeThreat(v: unknown): "low" | "moderate" | "high" {
  if (typeof v !== "string") return "moderate";
  const s = v.trim().toLowerCase();
  if (s.startsWith("h")) return "high";
  if (s.startsWith("l")) return "low";
  return "moderate"; // medium / moderate / mod / mid / anything else
}

// Risk + differentiator items might come back as plain strings OR as
// {title,body} / {risk,details} objects. Extract a readable string either way.
function coerceBullets(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string" && item.trim()) {
      out.push(item.trim());
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      // Try common field names in priority order.
      const candidate =
        (typeof o.text === "string" && o.text) ||
        (typeof o.description === "string" && o.description) ||
        (typeof o.detail === "string" && o.detail) ||
        (typeof o.body === "string" && o.body) ||
        (typeof o.content === "string" && o.content) ||
        (typeof o.value === "string" && o.value) ||
        // Fallback: combine title + body if both present.
        (typeof o.title === "string" && typeof o.body === "string"
          ? `${o.title}: ${o.body}`
          : "") ||
        (typeof o.title === "string" ? o.title : "");
      if (candidate && candidate.trim()) out.push(candidate.trim());
    }
  }
  return out;
}

function firstString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

function coerceResponse(parsed: unknown): CompetitorAnalysisResponse | null {
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;

  // Field-name aliases. Different model temperatures / prompts produce
  // different keys — accept the obvious variants rather than throwing.
  const headline = firstString(
    o.headline,
    o.summary,
    o.title,
    o.overview,
  );
  const recommendation = firstString(
    o.recommendation,
    o.action,
    o.next_step,
    o.nextStep,
    o.do_this_next,
    o.advice,
  );
  const risks = coerceBullets(o.risks ?? o.threats ?? o.concerns);
  const differentiators = coerceBullets(
    o.differentiators ?? o.advantages ?? o.opportunities ?? o.strengths,
  );
  const threatLevel = normalizeThreat(
    o.threatLevel ?? o.threat_level ?? o.threat ?? o.severity ?? o.risk_level,
  );

  // Need at least *something* to render — headline OR a risk OR a
  // recommendation. Otherwise the popup would be blank.
  if (!headline && risks.length === 0 && !recommendation) return null;

  return {
    threatLevel,
    headline: headline || "Nearby competitor analysis",
    risks,
    differentiators,
    recommendation: recommendation || "Visit this location and observe their pricing, traffic, and customer mix before opening.",
  };
}

export async function POST(
  request: NextRequest,
): Promise<NextResponse<CompetitorAnalysisResponse | { error: string }>> {
  let body: CompetitorAnalysisRequest;
  try {
    body = (await request.json()) as CompetitorAnalysisRequest;
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  if (!body.competitor || !body.competitor.name) {
    return NextResponse.json(
      { error: "competitor.name is required" },
      { status: 400 },
    );
  }

  const userMessage = [
    "## Competitor",
    safeStringify(body.competitor, 800),
    "",
    "## Your business plan",
    safeStringify(body.business ?? {}, 2000),
    "",
    "Return JSON only.",
  ].join("\n");

  let raw: string;
  try {
    raw = await generateLocalCompletionWithRetry({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.3,
      maxTokens: 600,
      // OpenAI-compatible JSON mode — guarantees the response body parses
      // as JSON, eliminating the "preamble + code-fence" failure mode.
      responseFormat: { type: "json_object" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LLM request failed" },
      { status: 502 },
    );
  }

  const parsed = extractJsonObject(raw);
  const shaped = parsed ? coerceResponse(parsed) : null;
  if (!shaped) {
    // Surface the raw model output so the popup can show what came back —
    // far more useful than a generic "unexpected shape" when iterating.
    const preview = raw.slice(0, 400);
    return NextResponse.json(
      {
        error: `Model returned unexpected shape. First 400 chars: ${preview}`,
      },
      { status: 502 },
    );
  }
  return NextResponse.json(shaped);
}
