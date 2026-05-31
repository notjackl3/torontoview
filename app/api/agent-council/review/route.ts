import { NextRequest, NextResponse } from "next/server";
import { reviewCouncil, type CouncilReviewRequest } from "@/lib/agentCouncil";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateRequest(body: unknown): CouncilReviewRequest | string {
  if (!isObject(body)) {
    return "Request body must be a JSON object";
  }

  if (typeof body.projectDescription !== "string" || !body.projectDescription.trim()) {
    return "projectDescription is required";
  }

  if (body.buildings !== undefined && !Array.isArray(body.buildings)) {
    return "buildings must be an array when provided";
  }

  return {
    projectDescription: body.projectDescription.trim(),
    location: isObject(body.location) ? body.location : undefined,
    buildings: Array.isArray(body.buildings) ? body.buildings : undefined,
    businessContext: isObject(body.businessContext) ? body.businessContext : undefined,
    transportContext: isObject(body.transportContext) ? body.transportContext : undefined,
    constraints: Array.isArray(body.constraints)
      ? body.constraints.filter((constraint): constraint is string => typeof constraint === "string")
      : undefined,
  } as CouncilReviewRequest;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = validateRequest(body);

    if (typeof validated === "string") {
      return NextResponse.json({ error: validated }, { status: 400 });
    }

    const review = await reviewCouncil(validated);

    return NextResponse.json(review);
  } catch (error) {
    console.error("Agent council review error:", error);
    return NextResponse.json(
      {
        error: "Failed to run agent council review",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
