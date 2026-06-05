import { NextRequest } from "next/server";
import { runStandardInsight, toResponse } from "@/lib/insights/runner";
import { SHADOW_IMPACT_SYSTEM } from "@/lib/insights/promptTemplates";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectDescription?: string;
    simulation?: Record<string, unknown>;
    context?: Record<string, unknown>;
  };

  if (!body.simulation) {
    return toResponse({ ok: false, status: 400, error: "simulation object is required" });
  }

  const outcome = await runStandardInsight({
    request,
    systemPrompt: SHADOW_IMPACT_SYSTEM,
    input: {
      projectDescription: body.projectDescription,
      simulation: body.simulation,
      context: body.context,
    },
  });
  return toResponse(outcome);
}
