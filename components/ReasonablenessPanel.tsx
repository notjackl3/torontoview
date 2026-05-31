"use client";

import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Sparkles,
} from "lucide-react";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";

export type ReviewVerdict =
  | "recommended"
  | "feasible-with-changes"
  | "not-recommended";

export interface ReasonablenessReview {
  verdict: ReviewVerdict;
  score: number;
  headline: string;
  reasons_for: string[];
  reasons_against: string[];
  required_actions: string[];
  key_risks: string[];
}

interface ReasonablenessPanelProps {
  payloadBuilder: () => unknown;
  enabled: boolean;
}

const VERDICT_STYLE: Record<
  ReviewVerdict,
  {
    icon: typeof ShieldCheck;
    text: string;
    bg: string;
    border: string;
    label: string;
  }
> = {
  recommended: {
    icon: ShieldCheck,
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-400/30",
    label: "Recommended",
  },
  "feasible-with-changes": {
    icon: ShieldAlert,
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-400/30",
    label: "Feasible with changes",
  },
  "not-recommended": {
    icon: ShieldX,
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-400/30",
    label: "Not recommended",
  },
};

export default function ReasonablenessPanel({
  payloadBuilder,
  enabled,
}: ReasonablenessPanelProps) {
  const [review, setReview] = useState<ReasonablenessReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runReview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reasonableness-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payloadBuilder()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReasonablenessReview;
      setReview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const style = review ? VERDICT_STYLE[review.verdict] : null;
  const Icon = style?.icon;

  useAskScopeData(
    review
      ? {
          id: "reasonableness",
          title: "Reasonableness Review",
          data: {
            verdict: review.verdict,
            score: review.score,
            headline: review.headline,
            reasonsFor: review.reasons_for,
            reasonsAgainst: review.reasons_against,
            requiredActions: review.required_actions,
            keyRisks: review.key_risks,
          },
        }
      : null,
  );

  return (
    <div data-ask-scope="reasonableness" data-ask-title="Reasonableness Review" className="glass rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-indigo-400" />
          <h3 className="ui-label">Reasonableness review</h3>
        </div>
        <button
          type="button"
          onClick={runReview}
          disabled={!enabled || loading}
          className={`text-[10px] font-black uppercase tracking-tight px-3 py-1.5 rounded-md transition-colors ${
            enabled && !loading
              ? "bg-indigo-500 hover:bg-indigo-400 text-white"
              : "bg-slate-900/10 text-slate-400 cursor-not-allowed"
          }`}
        >
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              Reviewing…
            </span>
          ) : review ? (
            "Re-run"
          ) : (
            "Run review"
          )}
        </button>
      </div>

      {!enabled && !review && (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Place a building to enable the reasonableness review. It combines
          zoning, traffic, stakeholder, and cost signals into a single yes/no
          recommendation.
        </p>
      )}

      {error && (
        <div className="p-2.5 rounded-md border border-red-400/30 bg-red-500/10 text-[11px] text-red-200">
          {error}
        </div>
      )}

      {review && style && Icon && (
        <div className="space-y-3">
          <div
            className={`p-3 rounded-md border ${style.bg} ${style.border} flex items-start gap-3`}
          >
            <Icon size={20} className={`${style.text} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-[10px] font-black uppercase tracking-tight ${style.text}`}
                >
                  {style.label}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  score {review.score}/100
                </span>
              </div>
              <p className="text-[11px] text-slate-200 mt-1 leading-snug">
                {review.headline}
              </p>
            </div>
          </div>

          {review.reasons_for.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-tight text-emerald-300 mb-1">
                Why it works
              </p>
              <ul className="space-y-1">
                {review.reasons_for.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-slate-300"
                  >
                    <CheckCircle2
                      size={11}
                      className="text-emerald-400 mt-0.5 shrink-0"
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.reasons_against.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-tight text-amber-300 mb-1">
                Headwinds
              </p>
              <ul className="space-y-1">
                {review.reasons_against.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-slate-300"
                  >
                    <AlertTriangle
                      size={11}
                      className="text-amber-400 mt-0.5 shrink-0"
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.required_actions.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-tight text-indigo-300 mb-1">
                Required actions
              </p>
              <ul className="space-y-1">
                {review.required_actions.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-slate-300"
                  >
                    <Wrench
                      size={11}
                      className="text-indigo-400 mt-0.5 shrink-0"
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {review.key_risks.length > 0 && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-tight text-red-300 mb-1">
                Key risks
              </p>
              <ul className="space-y-1">
                {review.key_risks.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-1.5 text-[11px] text-slate-300"
                  >
                    <ShieldAlert
                      size={11}
                      className="text-red-400 mt-0.5 shrink-0"
                    />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
