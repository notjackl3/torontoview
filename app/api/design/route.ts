import { NextRequest, NextResponse } from 'next/server';
import { BuildingConfigSchema, type BuildingConfig } from '@/lib/buildingConfig';
import { generateCompletionText } from '@/lib/llm/client';
import { extractJsonObject } from '@/lib/llm/json';
import { resolveLlmPreferences } from '@/lib/llm/preferences';
import type { ResolvedLlmPreferences } from '@/lib/llm/preferences';

const SCHEMA_DESCRIPTION = `{
  "floors": number (integer, 1 to 200),
  "width": number (0.5 to 500, in meters),
  "length": number (0.5 to 500, in meters),
  "heightPerFloor": number (2 to 10, in meters),
  "wallColor": string (a basic color name like "gray", "white", "red", or a hex code like "#cc3333"),
  "windowStyle": "none" | "basic" | "glass" | "arched" | "circular" | "triangular",
  "style": "modern" | "classic" | "industrial" | "minimal",
  "texture": "smooth" | "concrete" | "brick" | "wood" | "glass",
  "roofStyle": "flat" | "gable" | "hip",
  "notes": string (optional, for anything that does not fit the schema)
}`;

async function callDesignModel(
  prompt: string,
  prefs: ResolvedLlmPreferences,
): Promise<string> {
  return generateCompletionText({
    provider: prefs.provider,
    model: prefs.model,
    messages: [
      {
        role: 'system',
        content: 'You convert building design requests into strict JSON. Return only the JSON object requested by the user prompt.',
      },
      { role: 'user', content: prompt },
    ],
    maxTokens: 1200,
    temperature: 0.1,
  });
}

function buildPrompt(
  userText: string,
  previousConfig?: Partial<BuildingConfig>
): string {
  let previousConfigSection = '';
  if (previousConfig) {
    previousConfigSection = `

IMPORTANT: The user already has a building with these settings:
${JSON.stringify(previousConfig, null, 2)}
Only change the fields the user explicitly mentions. Keep ALL other fields exactly as they are above. Do not alter dimensions, colors, textures, or styles unless the user specifically asks for it.`;
  }

  return `You are a building design parser. Output only JSON.

The user will describe a building they want. You must return a JSON object matching this exact schema:
${SCHEMA_DESCRIPTION}

Rules:
- Return ONLY a single JSON object with keys exactly matching the schema above.
- Do not include markdown, code fences, or any text outside the JSON object.
- Choose reasonable defaults when the user does not specify a value.
- If the user asks for something that does not fit any field, put a short note in "notes".
- Keep dimensions reasonable for real buildings unless the user asks for something extreme.
${previousConfigSection}

Also include a "confirmation" key (string) with a one-sentence summary of what you designed. Keep it under 20 words.

Example output format:
{
  "floors": 5,
  "width": 30,
  "length": 20,
  "heightPerFloor": 3.5,
  "wallColor": "white",
  "windowStyle": "glass",
  "style": "modern",
  "texture": "concrete",
  "roofStyle": "flat",
  "notes": "",
  "confirmation": "I designed a 5-story modern glass tower with a flat roof."
}

User request: "${userText}"`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, previousConfig } = body as {
      text: string;
      previousConfig?: Partial<BuildingConfig>;
    };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Text input is required.' },
        { status: 400 }
      );
    }

    const prefs = resolveLlmPreferences(request);

    // First attempt
    const prompt = buildPrompt(text.trim(), previousConfig);
    const rawResponse = await callDesignModel(prompt, prefs);
    let parsed = extractJsonObject(rawResponse);

    if (!parsed) {
      return NextResponse.json(
        { error: 'Model returned an unparseable response. Please try again.' },
        { status: 500 }
      );
    }

    // Extract confirmation before Zod validation (it is not part of BuildingConfig)
    const confirmation =
      (parsed as Record<string, unknown>).confirmation as string ||
      'Building designed based on your request.';

    // Remove confirmation from the object before validation
    const { confirmation: _, ...configFields } = parsed as Record<string, unknown>;

    // Validate with Zod
    let validationResult = BuildingConfigSchema.safeParse(configFields);

    if (!validationResult.success) {
      // Retry: tell the local model what went wrong
      const errorDetails = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');

      const retryPrompt = `${prompt}

Your previous response had validation errors: ${errorDetails}
Please fix these errors and return valid JSON matching the schema exactly.`;

      const retryResponse = await callDesignModel(retryPrompt, prefs);
      const retryParsed = extractJsonObject(retryResponse);

      if (!retryParsed) {
        return NextResponse.json(
          {
            error: `Model response failed validation: ${errorDetails}`,
          },
          { status: 400 }
        );
      }

      const { confirmation: _retry, ...retryConfigFields } =
        retryParsed as Record<string, unknown>;
      validationResult = BuildingConfigSchema.safeParse(retryConfigFields);

      if (!validationResult.success) {
        const retryErrors = validationResult.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        return NextResponse.json(
          {
            error: `Could not produce valid building config: ${retryErrors}`,
          },
          { status: 400 }
        );
      }
    }

    const config: BuildingConfig = validationResult.data;

    return NextResponse.json({
      config,
      confirmation,
    });
  } catch (error) {
    console.error('Design API error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
      },
      { status: 500 }
    );
  }
}
