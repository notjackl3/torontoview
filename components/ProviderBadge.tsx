"use client";

import Link from "next/link";
import { useLlmPreferences } from "@/lib/llm/clientPreferences";
import { LLM_PROVIDERS } from "@/lib/llm/providers";
import { MODEL_CATALOG } from "@/lib/llm/catalog";

export function ProviderBadge({ className }: { className?: string }) {
  const { prefs } = useLlmPreferences();
  const providerId = prefs.provider ?? "nvidia-nim";
  const provider = LLM_PROVIDERS[providerId];
  const model = prefs.model
    ? MODEL_CATALOG.find((m) => m.id === prefs.model)
    : undefined;

  const vendorAccent =
    provider.vendor === "nvidia"
      ? "bg-[#76b900]/15 text-[#76b900] border-[#76b900]/40"
      : provider.vendor === "openai"
        ? "bg-neutral-200 text-neutral-800 border-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:border-neutral-600"
        : "bg-blue-500/15 text-blue-600 border-blue-500/40";

  return (
    <Link
      href="/settings"
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:opacity-80 ${vendorAccent} ${className ?? ""}`}
      title="Open LLM settings"
    >
      <span className="font-semibold">{provider.shortName}</span>
      <span className="opacity-60">·</span>
      <span className="truncate max-w-[200px]">
        {model ? model.displayName : (prefs.model ?? provider.defaultModel)}
      </span>
    </Link>
  );
}
