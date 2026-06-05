const RESPONSE_SHAPE = `Respond as a single JSON object only:
{
  "summary": "1-2 sentence headline",
  "risks": [{ "title": "...", "severity": "low|moderate|high|critical", "detail": "..." }],
  "recommendations": [{ "action": "...", "rationale": "...", "effort": "low|moderate|high" }],
  "scores": { "key": number-between-0-and-100 }
}`;

export const WATER_IMPACT_SYSTEM = `You are a stormwater and drainage engineer reviewing a proposed building in Toronto. You receive deterministic drainage simulation outputs (impervious area, runoff coefficient, downstream catchment). Translate them into a concrete impact assessment grounded in Toronto's Wet Weather Flow Management Guidelines. Be specific: name the downstream catchment if provided, quote the numbers, recommend permeable paving / cisterns / green roofs where appropriate. ${RESPONSE_SHAPE}`;

export const TRAFFIC_IMPACT_SYSTEM = `You are a transportation planner reviewing the traffic impact of a proposed building in Toronto. You receive deterministic simulation outputs (vehicles/hour delta, intersection LOS, signal timing strain, mode-split estimate). Translate them into a concrete impact assessment. Reference Toronto's Complete Streets and TMP context. ${RESPONSE_SHAPE}`;

export const SHADOW_IMPACT_SYSTEM = `You are a daylight / shadow-impact analyst reviewing a proposed building in Toronto. You receive deterministic sun-occlusion outputs (shadow length hours, affected public spaces, seasonal worst-case). Reference Toronto's Tall Building Guidelines on shadow mitigation. ${RESPONSE_SHAPE}`;

export const WIND_NOISE_SYSTEM = `You are an environmental engineer reviewing wind comfort and construction-noise impact for a proposed building in Toronto. You receive deterministic wind-simulation and construction-noise propagation outputs. Reference Toronto's pedestrian-level wind comfort criteria and MECP noise guidelines. ${RESPONSE_SHAPE}`;

const BRIEF_SHAPE = `Respond as a single JSON object only:
{
  "summary": "3-5 sentence project headline",
  "verdict": "go" | "conditional" | "rework" | "no-go",
  "score": 0-100,
  "highlights": ["short positive bullet", "..."],
  "concerns": ["short concern bullet", "..."],
  "nextSteps": ["short action bullet", "..."],
  "bySection": {
    "water": "1-2 sentences",
    "traffic": "1-2 sentences",
    "shadow": "1-2 sentences",
    "windNoise": "1-2 sentences"
  }
}`;

export const PROJECT_BRIEF_SYSTEM = `You are a senior Toronto urban-planning advisor producing a one-page project brief for a proposed building. You receive deterministic outputs from four simulations (water/drainage, traffic, shadow/daylight, wind/noise) plus optional zoning and competitor context. Synthesize them into one cohesive brief. Be specific. Do not invent numbers. ${BRIEF_SHAPE}`;

export interface InsightUserPromptInput {
  /** Free-form description of the building/project. */
  projectDescription?: string;
  /** Deterministic simulation outputs, as a plain object. */
  simulation: Record<string, unknown>;
  /** Optional surrounding context — zoning, location, etc. */
  context?: Record<string, unknown>;
}

export function buildInsightUserPrompt(input: InsightUserPromptInput): string {
  const lines: string[] = [];
  if (input.projectDescription) {
    lines.push("## Project");
    lines.push(input.projectDescription);
    lines.push("");
  }
  lines.push("## Simulation output (deterministic)");
  lines.push("```json");
  lines.push(JSON.stringify(input.simulation, null, 2));
  lines.push("```");
  if (input.context && Object.keys(input.context).length > 0) {
    lines.push("");
    lines.push("## Context");
    lines.push("```json");
    lines.push(JSON.stringify(input.context, null, 2));
    lines.push("```");
  }
  lines.push("");
  lines.push("Return JSON only.");
  return lines.join("\n");
}
