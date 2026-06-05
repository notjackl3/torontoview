"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  llmPreferenceHeaders,
  useLlmPreferences,
} from "@/lib/llm/clientPreferences";
import {
  LLM_PROVIDERS,
  PROVIDER_ORDER,
  type LlmProviderId,
} from "@/lib/llm/providers";
import { modelsForProvider } from "@/lib/llm/catalog";
import { ModelPicker } from "@/components/ModelPicker";

interface ProviderStatus {
  id: LlmProviderId;
  displayName: string;
  shortName: string;
  vendor: "nvidia" | "openai" | "other";
  description: string;
  baseUrl: string | null;
  defaultModel: string;
  apiKeyEnv: string;
  baseUrlEnv: string;
  configured: boolean;
  hasApiKey: boolean;
}

interface ProbeResult {
  ok: boolean;
  provider?: string;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export default function SettingsPage() {
  const { prefs, update, clear } = useLlmPreferences();
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [activeTab, setActiveTab] = useState<LlmProviderId>("nvidia-nim");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/llm/health")
      .then((r) => r.json())
      .then((data: { providers: ProviderStatus[] }) => {
        if (cancelled) return;
        setStatuses(data.providers);
      })
      .catch(() => {
        // ignore — leave statuses empty
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (prefs.provider) setActiveTab(prefs.provider);
  }, [prefs.provider]);

  const activeStatus = statuses.find((s) => s.id === activeTab);
  const modelsForTab = modelsForProvider(activeTab);

  async function runProbe() {
    setProbing(true);
    setProbe(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...llmPreferenceHeaders({
          provider: activeTab,
          model: prefs.provider === activeTab ? prefs.model : null,
        }),
      };
      const res = await fetch("/api/llm/health", { method: "POST", headers });
      const data: ProbeResult = await res.json();
      setProbe(data);
    } catch (err) {
      setProbe({ ok: false, error: err instanceof Error ? err.message : "probe failed" });
    } finally {
      setProbing(false);
    }
  }

  function applyProvider() {
    const defaultModel = modelsForTab[0]?.id ?? null;
    update({ provider: activeTab, model: prefs.provider === activeTab ? prefs.model : defaultModel });
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold">LLM Settings</h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Pick the NVIDIA inference provider and model that powers TorontoView. All
              LLM-backed features — voice design, environmental reports, agent council,
              and the new AI Insights layer — route through this selection.
            </p>
          </div>
          <Link href="/map" className="text-sm text-neutral-500 hover:underline">
            ← Back to map
          </Link>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex flex-wrap gap-1 border-b border-neutral-200 px-4 pt-4 dark:border-neutral-800">
            {PROVIDER_ORDER.map((id) => {
              const provider = LLM_PROVIDERS[id];
              const status = statuses.find((s) => s.id === id);
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`relative rounded-t-md px-4 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100"
                      : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  <span>{provider.shortName}</span>
                  {status && (
                    <span
                      className={`ml-2 inline-block h-2 w-2 rounded-full ${
                        status.configured ? "bg-emerald-500" : "bg-neutral-400"
                      }`}
                      title={status.configured ? "Configured" : "Not configured"}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {activeStatus && (
            <div className="p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{activeStatus.displayName}</h2>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {activeStatus.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    activeStatus.configured
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  }`}
                >
                  {activeStatus.configured ? "Configured" : "Not configured"}
                </span>
              </div>

              <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">Base URL env</dt>
                  <dd className="mt-1 font-mono text-xs">{activeStatus.baseUrlEnv}</dd>
                  <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
                    {activeStatus.baseUrl ?? "— not set —"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-neutral-500">API key env</dt>
                  <dd className="mt-1 font-mono text-xs">{activeStatus.apiKeyEnv}</dd>
                  <dd className="mt-1 text-neutral-600 dark:text-neutral-400">
                    {activeStatus.hasApiKey ? "Set on server" : "Not set"}
                  </dd>
                </div>
              </dl>

              <div className="mt-6">
                <ModelPicker
                  provider={activeTab}
                  model={prefs.provider === activeTab ? (prefs.model ?? modelsForTab[0]?.id ?? null) : (modelsForTab[0]?.id ?? null)}
                  onChange={(model) => update({ provider: activeTab, model })}
                />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={applyProvider}
                  className="rounded-md bg-[#76b900] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#5fa000] disabled:opacity-40"
                  disabled={!activeStatus.configured}
                >
                  Use this provider
                </button>
                <button
                  type="button"
                  onClick={runProbe}
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-40"
                  disabled={!activeStatus.configured || probing}
                >
                  {probing ? "Testing…" : "Test connection"}
                </button>
                {prefs.provider && (
                  <button
                    type="button"
                    onClick={clear}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Reset to server default
                  </button>
                )}
              </div>

              {probe && (
                <div
                  className={`mt-4 rounded-md border px-4 py-3 text-sm ${
                    probe.ok
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                  }`}
                >
                  {probe.ok
                    ? `OK — ${probe.provider} / ${probe.model} (${probe.latencyMs}ms round-trip)`
                    : `Failed — ${probe.error}`}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-base font-semibold">Currently active</h3>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Provider: <span className="font-mono">{prefs.provider ?? "(server default)"}</span>
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Model: <span className="font-mono">{prefs.model ?? "(server default)"}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
