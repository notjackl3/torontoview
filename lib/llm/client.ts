import {
  defaultProviderId,
  getProvider,
  resolveApiKey,
  resolveBaseUrl,
  resolveDefaultModel,
  type LlmProviderId,
} from "./providers";

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateCompletionOptions {
  messages: LlmChatMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
  provider?: LlmProviderId;
  model?: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
  model?: string;
}

export interface CompletionMeta {
  provider: LlmProviderId;
  model: string;
  baseUrl: string;
  latencyMs: number;
}

export interface CompletionResult {
  text: string;
  meta: CompletionMeta;
}

function pickProvider(opts: GenerateCompletionOptions): LlmProviderId {
  return opts.provider ?? defaultProviderId();
}

function pickModel(providerId: LlmProviderId, modelOpt?: string): string {
  if (modelOpt) return modelOpt;
  return resolveDefaultModel(getProvider(providerId));
}

export async function generateCompletion(
  options: GenerateCompletionOptions,
): Promise<CompletionResult> {
  const providerId = pickProvider(options);
  const provider = getProvider(providerId);
  const baseUrl = resolveBaseUrl(provider);
  if (!baseUrl) {
    throw new Error(
      `LLM provider "${provider.displayName}" has no base URL configured. Set ${provider.baseUrlEnv} in .env.local or switch providers at /settings.`,
    );
  }
  const model = pickModel(providerId, options.model);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = resolveApiKey(provider);
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const payload: Record<string, unknown> = {
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 2048,
    temperature: options.temperature ?? 0.2,
  };
  if (options.responseFormat) payload.response_format = options.responseFormat;

  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `LLM request to ${provider.shortName} (${model}) failed (${response.status}): ${
        errorText || response.statusText
      }`,
    );
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
  if (!text) {
    throw new Error(`LLM provider ${provider.shortName} returned no text.`);
  }

  return {
    text,
    meta: {
      provider: providerId,
      model: data.model || model,
      baseUrl,
      latencyMs: Date.now() - startedAt,
    },
  };
}

export async function generateCompletionWithRetry(
  options: GenerateCompletionOptions,
  maxAttempts = 3,
): Promise<CompletionResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await generateCompletion(options);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("LLM request failed after retries.");
}

/** Convenience wrapper that returns just the completion text. */
export async function generateCompletionText(
  options: GenerateCompletionOptions,
  maxAttempts = 3,
): Promise<string> {
  const { text } = await generateCompletionWithRetry(options, maxAttempts);
  return text;
}
