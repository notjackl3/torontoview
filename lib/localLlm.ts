interface LocalChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface GenerateLocalCompletionOptions {
  messages: LocalChatMessage[];
  maxTokens?: number;
  temperature?: number;
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

function localLlmBaseUrl() {
  return (process.env.LOCAL_LLM_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_LOCAL_BASE_URL).replace(/\/$/, "");
}

export function localLlmModel() {
  return process.env.LOCAL_LLM_MODEL || process.env.OPENAI_MODEL || DEFAULT_LOCAL_MODEL;
}

export async function generateLocalCompletion({
  messages,
  maxTokens = 2048,
  temperature = 0.2,
}: GenerateLocalCompletionOptions): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LOCAL_LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(`${localLlmBaseUrl()}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: localLlmModel(),
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
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
