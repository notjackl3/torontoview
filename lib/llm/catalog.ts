import type { LlmProviderId } from "./providers";

export interface CatalogModel {
  id: string;
  displayName: string;
  provider: LlmProviderId;
  contextLength: number;
  recommendedFor: string[];
  description: string;
  badge?: "fine-tuned" | "flagship" | "fast" | "experimental";
}

export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: "meta/llama-3.3-nemotron-super-49b-v1",
    displayName: "Llama 3.3 Nemotron Super 49B",
    provider: "nvidia-nim",
    contextLength: 128_000,
    recommendedFor: ["reasoning", "structured-output", "project-brief"],
    description:
      "NVIDIA's flagship reasoning model — strong at structured JSON output, long context, and the kind of multi-factor reasoning needed for environmental impact reports.",
    badge: "flagship",
  },
  {
    id: "nvidia/llama-3.1-nemotron-70b-instruct",
    displayName: "Llama 3.1 Nemotron 70B Instruct",
    provider: "nvidia-nim",
    contextLength: 128_000,
    recommendedFor: ["chat", "ask", "tree-advisor"],
    description: "General-purpose instruct model tuned by NVIDIA. Good default for the Ask popover and tree advisor.",
  },
  {
    id: "nvidia/nemotron-mini-4b-instruct",
    displayName: "Nemotron Mini 4B Instruct",
    provider: "nvidia-nim",
    contextLength: 8_192,
    recommendedFor: ["voice-design", "low-latency"],
    description: "Tiny, fast model for low-latency parsing — ideal for the voice design endpoint.",
    badge: "fast",
  },
  {
    id: "mistralai/mixtral-8x22b-instruct-v0.1",
    displayName: "Mixtral 8x22B Instruct",
    provider: "nvidia-nim",
    contextLength: 65_536,
    recommendedFor: ["chat", "long-context"],
    description: "Mixtral served via NIM. Useful comparison point against the Nemotron family.",
  },
  {
    id: "toronto-council-lora",
    displayName: "Toronto Council LoRA (DGX-trained)",
    provider: "nvidia-dgx",
    contextLength: 32_768,
    recommendedFor: ["agent-council", "permits", "business-viability"],
    description:
      "Llama-3.1-8B-Instruct base served by self-hosted NIM, with our LoRA fine-tuned on DGX Spark from Toronto's official corpus (building regulations, business bursaries, civil infrastructure). Behavior in the LoRA, facts in the RAG corpus.",
    badge: "fine-tuned",
  },
  {
    id: "unsloth/Qwen3.6-35B-A3B-GGUF",
    displayName: "Qwen3.6 35B (Local GGUF)",
    provider: "local",
    contextLength: 32_768,
    recommendedFor: ["development"],
    description: "Local llama.cpp / vLLM development fallback. No NVIDIA key required.",
  },
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    provider: "openai",
    contextLength: 128_000,
    recommendedFor: ["fallback"],
    description: "OpenAI fallback for environments without NVIDIA credentials.",
  },
];

export function modelsForProvider(provider: LlmProviderId): CatalogModel[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

export function getModel(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}
