import { NextRequest, NextResponse } from "next/server";
import { generateCompletion } from "@/lib/llm/client";
import { resolveLlmPreferences } from "@/lib/llm/preferences";
import {
  getProvider,
  isProviderConfigured,
  LLM_PROVIDERS,
  PROVIDER_ORDER,
  resolveBaseUrl,
  resolveDefaultModel,
} from "@/lib/llm/providers";

export async function GET() {
  // Returns the configuration status for every provider so the settings UI
  // can show which providers are usable without leaking secrets.
  const status = PROVIDER_ORDER.map((id) => {
    const provider = getProvider(id);
    return {
      id,
      displayName: provider.displayName,
      shortName: provider.shortName,
      vendor: provider.vendor,
      description: provider.description,
      baseUrl: resolveBaseUrl(provider),
      defaultModel: resolveDefaultModel(provider),
      apiKeyEnv: provider.apiKeyEnv,
      baseUrlEnv: provider.baseUrlEnv,
      configured: isProviderConfigured(provider),
      hasApiKey: Boolean(process.env[provider.apiKeyEnv]),
    };
  });

  const order = PROVIDER_ORDER.filter((id) => Object.prototype.hasOwnProperty.call(LLM_PROVIDERS, id));

  return NextResponse.json({ providers: status, order });
}

/**
 * 1-token probe against the chosen provider/model. The client uses this to
 * confirm the user's selection actually works.
 */
export async function POST(request: NextRequest) {
  const prefs = resolveLlmPreferences(request);
  try {
    const { meta } = await generateCompletion({
      provider: prefs.provider,
      model: prefs.model,
      messages: [
        { role: "system", content: "Reply with the single word OK." },
        { role: "user", content: "Reply with the single word OK." },
      ],
      maxTokens: 5,
      temperature: 0,
    });
    return NextResponse.json({
      ok: true,
      provider: prefs.provider,
      model: meta.model,
      latencyMs: meta.latencyMs,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        provider: prefs.provider,
        model: prefs.model,
        error: err instanceof Error ? err.message : "probe failed",
      },
      { status: 502 },
    );
  }
}
