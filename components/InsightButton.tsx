"use client";

import { Sparkles, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  llmPreferenceHeaders,
  readLlmPreferencesSync,
} from "@/lib/llm/clientPreferences";
import type { InsightResponse } from "@/lib/insights/schemas";

interface InsightButtonProps {
  endpoint: string;
  label?: string;
  /** Returns the payload the route expects: { projectDescription?, simulation, context? }. */
  buildPayload: () => {
    projectDescription?: string;
    simulation: Record<string, unknown>;
    context?: Record<string, unknown>;
  } | null;
  className?: string;
}

interface InsightState {
  loading: boolean;
  result: InsightResponse | null;
  error: string | null;
  meta: { provider: string; model: string; latencyMs: number } | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40",
  moderate: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  high: "bg-orange-500/15 text-orange-700 border-orange-500/40",
  critical: "bg-red-500/15 text-red-700 border-red-500/40",
};

export function InsightButton({
  endpoint,
  label = "Ask NVIDIA AI",
  buildPayload,
  className,
}: InsightButtonProps) {
  const [state, setState] = useState<InsightState>({
    loading: false,
    result: null,
    error: null,
    meta: null,
  });

  async function run() {
    const payload = buildPayload();
    if (!payload) {
      setState({ loading: false, result: null, meta: null, error: "Nothing to analyze yet." });
      return;
    }
    setState({ loading: true, result: null, meta: null, error: null });
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...llmPreferenceHeaders(readLlmPreferencesSync()),
      };
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setState({
          loading: false,
          result: null,
          meta: null,
          error: data?.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      const { _meta, ...rest } = data as InsightResponse & {
        _meta?: { provider: string; model: string; latencyMs: number };
      };
      setState({
        loading: false,
        result: rest as InsightResponse,
        meta: _meta ?? null,
        error: null,
      });
    } catch (err) {
      setState({
        loading: false,
        result: null,
        meta: null,
        error: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={run}
        disabled={state.loading}
        className="inline-flex items-center gap-1.5 rounded-md border border-[#76b900]/50 bg-[#76b900]/10 px-3 py-1.5 text-xs font-semibold text-[#5fa000] transition hover:bg-[#76b900]/20 disabled:opacity-50"
      >
        {state.loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {state.loading ? "Reasoning on NVIDIA…" : label}
      </button>

      {state.error && (
        <div className="mt-2 rounded-md border border-red-400/40 bg-red-50 p-2 text-[11px] text-red-700">
          {state.error}
        </div>
      )}

      {state.result && (
        <div className="mt-3 space-y-3 rounded-md border border-[#76b900]/30 bg-[#76b900]/5 p-3 text-[11px]">
          <p className="font-medium text-slate-800">{state.result.summary}</p>

          {state.result.risks.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Risks
              </p>
              <ul className="space-y-1.5">
                {state.result.risks.map((risk, i) => (
                  <li
                    key={i}
                    className={`rounded-md border px-2 py-1 ${SEVERITY_STYLES[risk.severity] ?? SEVERITY_STYLES.moderate}`}
                  >
                    <div className="flex items-center gap-1 font-semibold">
                      <AlertTriangle size={10} />
                      {risk.title}
                      <span className="ml-auto text-[9px] uppercase opacity-70">
                        {risk.severity}
                      </span>
                    </div>
                    <p className="mt-0.5 opacity-90">{risk.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.result.recommendations.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Recommendations
              </p>
              <ul className="space-y-1.5">
                {state.result.recommendations.map((rec, i) => (
                  <li key={i} className="rounded-md border border-slate-200 bg-white p-2">
                    <div className="flex items-center gap-1 font-semibold text-slate-800">
                      <CheckCircle2 size={10} className="text-[#76b900]" />
                      {rec.action}
                      {rec.effort && (
                        <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase text-slate-500">
                          {rec.effort} effort
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-slate-600">{rec.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.meta && (
            <p className="pt-1 text-[9px] uppercase tracking-wide text-slate-400">
              {state.meta.provider} · {state.meta.model} · {state.meta.latencyMs}ms
            </p>
          )}
        </div>
      )}
    </div>
  );
}
