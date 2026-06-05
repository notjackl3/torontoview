export type LlmProviderId =
  | "nvidia-nim"
  | "nvidia-dgx"
  | "local"
  | "openai";

export interface LlmProvider {
  id: LlmProviderId;
  displayName: string;
  shortName: string;
  description: string;
  baseUrlEnv: string;
  apiKeyEnv: string;
  defaultBaseUrl: string | null;
  defaultModelEnv: string;
  defaultModel: string;
  vendor: "nvidia" | "openai" | "other";
}

export const LLM_PROVIDERS: Record<LlmProviderId, LlmProvider> = {
  "nvidia-nim": {
    id: "nvidia-nim",
    displayName: "NVIDIA NIM (build.nvidia.com)",
    shortName: "NVIDIA NIM",
    description:
      "Hosted NVIDIA Inference Microservices. Nemotron, Llama-3.3-Nemotron, Mixtral and more — served from NVIDIA's GPU cloud with one API key.",
    baseUrlEnv: "NVIDIA_NIM_BASE_URL",
    apiKeyEnv: "NVIDIA_API_KEY",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModelEnv: "NVIDIA_NIM_DEFAULT_MODEL",
    defaultModel: "meta/llama-3.3-nemotron-super-49b-v1",
    vendor: "nvidia",
  },
  "nvidia-dgx": {
    id: "nvidia-dgx",
    displayName: "NVIDIA DGX (self-hosted)",
    shortName: "DGX",
    description:
      "An OpenAI-compatible inference endpoint running on a DGX Spark box — used to serve the agent-council LoRA fine-tuned in training/agent-council-lora.",
    baseUrlEnv: "DGX_INFERENCE_BASE_URL",
    apiKeyEnv: "DGX_INFERENCE_API_KEY",
    defaultBaseUrl: null,
    defaultModelEnv: "DGX_INFERENCE_MODEL",
    defaultModel: "toronto-council-lora",
    vendor: "nvidia",
  },
  local: {
    id: "local",
    displayName: "Local llama.cpp / vLLM",
    shortName: "Local",
    description:
      "Any OpenAI-compatible local server (llama.cpp, vLLM, LM Studio). Useful for offline development.",
    baseUrlEnv: "LOCAL_LLM_BASE_URL",
    apiKeyEnv: "LOCAL_LLM_API_KEY",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    defaultModelEnv: "LOCAL_LLM_MODEL",
    defaultModel: "unsloth/Qwen3.6-35B-A3B-GGUF",
    vendor: "other",
  },
  openai: {
    id: "openai",
    displayName: "OpenAI",
    shortName: "OpenAI",
    description: "Hosted OpenAI API. Fallback for environments without an NVIDIA key.",
    baseUrlEnv: "OPENAI_BASE_URL",
    apiKeyEnv: "OPENAI_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    vendor: "openai",
  },
};

export const PROVIDER_ORDER: LlmProviderId[] = [
  "nvidia-nim",
  "nvidia-dgx",
  "local",
  "openai",
];

export function getProvider(id: LlmProviderId): LlmProvider {
  return LLM_PROVIDERS[id];
}

export function resolveBaseUrl(provider: LlmProvider): string | null {
  const fromEnv = process.env[provider.baseUrlEnv];
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return provider.defaultBaseUrl ? provider.defaultBaseUrl.replace(/\/$/, "") : null;
}

export function resolveApiKey(provider: LlmProvider): string | undefined {
  return process.env[provider.apiKeyEnv];
}

export function resolveDefaultModel(provider: LlmProvider): string {
  return process.env[provider.defaultModelEnv] || provider.defaultModel;
}

/**
 * Decide which provider to use when no explicit pick has been made.
 * Order: LLM_PROVIDER env → NVIDIA_API_KEY present → OPENAI_API_KEY present
 * → fall back to local.
 */
export function defaultProviderId(): LlmProviderId {
  const explicit = process.env.LLM_PROVIDER as LlmProviderId | undefined;
  if (explicit && explicit in LLM_PROVIDERS) return explicit;
  if (process.env.NVIDIA_API_KEY) return "nvidia-nim";
  if (process.env.DGX_INFERENCE_BASE_URL) return "nvidia-dgx";
  if (process.env.OPENAI_API_KEY && !process.env.LOCAL_LLM_BASE_URL) return "openai";
  return "local";
}

export function isProviderConfigured(provider: LlmProvider): boolean {
  if (provider.id === "local") {
    return Boolean(resolveBaseUrl(provider));
  }
  return Boolean(resolveApiKey(provider) && resolveBaseUrl(provider));
}
