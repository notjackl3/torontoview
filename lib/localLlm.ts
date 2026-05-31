interface LocalChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GenerateLocalCompletionOptions {
  messages: LocalChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Forwarded to OpenAI-compatible servers. Use `{ type: "json_object" }`
   *  to force a valid-JSON response when the prompt asks for one. */
  responseFormat?: { type: "json_object" } | { type: "text" };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
    text?: string;
  }>;
}

const DEFAULT_LOCAL_MODEL = "unsloth/Qwen3.6-35B-A3B-GGUF";
const DEFAULT_LOCAL_BASE_URL = "http://127.0.0.1:8000/v1";
const HOSTED_OPENAI_BASE_URL = "https://api.openai.com/v1";
const HOSTED_OPENAI_DEFAULT_MODEL = "gpt-4o-mini";

/**
 * True when the user has configured an OpenAI API key but NOT pointed the
 * client at any specific base URL — i.e. they want hosted OpenAI rather than
 * a local llama.cpp server. .env.local in this repo documents exactly this
 * setup: uncomment OPENAI_BASE_URL to keep the local server, otherwise the
 * key-only case should route to OpenAI's hosted API.
 */
function shouldUseHostedOpenAI(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY &&
      !process.env.LOCAL_LLM_BASE_URL &&
      !process.env.OPENAI_BASE_URL,
  );
}

function localLlmBaseUrl() {
  const explicit = process.env.LOCAL_LLM_BASE_URL || process.env.OPENAI_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (shouldUseHostedOpenAI()) return HOSTED_OPENAI_BASE_URL;
  return DEFAULT_LOCAL_BASE_URL;
}

export function localLlmModel() {
  if (process.env.LOCAL_LLM_MODEL) return process.env.LOCAL_LLM_MODEL;
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  if (shouldUseHostedOpenAI()) return HOSTED_OPENAI_DEFAULT_MODEL;
  return DEFAULT_LOCAL_MODEL;
}

export async function generateLocalCompletion({
  messages,
  maxTokens = 2048,
  temperature = 0.2,
  responseFormat,
}: GenerateLocalCompletionOptions): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LOCAL_LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const payload: Record<string, unknown> = {
    model: localLlmModel(),
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (responseFormat) payload.response_format = responseFormat;

  const response = await fetch(`${localLlmBaseUrl()}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Local LLM request failed (${response.status}): ${errorText || response.statusText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
  if (!text) throw new Error("Local LLM returned no text.");
  return text;
}

export async function generateLocalCompletionWithRetry(
  options: GenerateLocalCompletionOptions,
  maxAttempts = 3
): Promise<string> {
  let lastError: unknown;
  for (let attempts = 1; attempts <= maxAttempts; attempts += 1) {
    try {
      return await generateLocalCompletion(options);
    } catch (error) {
      lastError = error;
      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Local LLM request failed.");
}
