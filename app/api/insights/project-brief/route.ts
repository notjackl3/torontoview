import { NextRequest } from "next/server";
import { runProjectBriefInsight, toResponse } from "@/lib/insights/runner";
import { PROJECT_BRIEF_SYSTEM } from "@/lib/insights/promptTemplates";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectDescription?: string;
    simulation?: Record<string, unknown>;
    context?: Record<string, unknown>;
  };

  if (!body.simulation) {
    return toResponse({ ok: false, status: 400, error: "simulation object is required" });
  }

  const outcome = await runProjectBriefInsight({
    request,
    systemPrompt: PROJECT_BRIEF_SYSTEM,
    input: {
      projectDescription: body.projectDescription,
      simulation: body.simulation,
      context: body.context,
    },
    maxTokens: 1800,
  });
  return toResponse(outcome);
}
