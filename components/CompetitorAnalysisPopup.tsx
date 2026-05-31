"use client";

import { useEffect, useState } from "react";
import { X, AlertTriangle, Shield, Sparkles, RefreshCw } from "lucide-react";
import type { CompetitorAnalysisResponse } from "@/app/api/competitor-analysis/route";
import {
  cacheKey,
  readAnalysis,
  writeAnalysis,
  type CachedCompetitorAnalysis,
} from "@/lib/competitorAnalysisCache";
import type { BusinessPlan } from "@/lib/businessPlan";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";

export interface CompetitorPopupInput {
  name: string;
  category: string;
  lat: number;
  lng: number;
  distanceM?: number;
  address?: string;
}

interface Props {
  competitor: CompetitorPopupInput;
  plan: BusinessPlan | null;
  buildingLatLng?: { lat: number; lng: number } | null;
  neighbourhood?: string | null;
  onClose: () => void;
  /** Fires when an analysis is first generated (or regenerated) so the parent
   *  can repaint the corresponding pin green. */
  onAnalyzed?: () => void;
}

export default function CompetitorAnalysisPopup({
  competitor,
  plan,
  buildingLatLng,
  neighbourhood,
  onClose,
  onAnalyzed,
}: Props) {
  const key = cacheKey({
    planId: plan?.id ?? null,
    competitorName: competitor.name,
    lat: competitor.lat,
    lng: competitor.lng,
  });

  const [data, setData] = useState<CachedCompetitorAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read cache on mount + whenever the key changes. If miss, fetch.
  useEffect(() => {
    const cached = readAnalysis(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }
    void runAnalysis(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function runAnalysis(force: boolean): Promise<void> {
    if (loading) return;
    if (!force) {
      const cached = readAnalysis(key);
      if (cached) {
        setData(cached);
        return;
      }
    }
    setLoading(true);
    setError(null);
    try {
      const body = {
        competitor: {
          name: competitor.name,
          category: competitor.category,
          lat: competitor.lat,
          lng: competitor.lng,
          distanceM: competitor.distanceM,
          address: competitor.address,
        },
        business: plan
          ? {
              name: plan.concept.name,
              category: plan.concept.category,
              valueProp: plan.concept.valueProp,
              targetAgeMin: plan.concept.targetAgeMin,
              targetAgeMax: plan.concept.targetAgeMax,
              targetIncomeTier: plan.concept.targetIncomeTier,
              monthlyRent: plan.financials.rent,
              seatingCapacity: plan.operations.seatingCapacity,
              buildingLat: buildingLatLng?.lat,
              buildingLng: buildingLatLng?.lng,
              neighbourhood,
            }
          : {},
      };
      const res = await fetch("/api/competitor-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: CompetitorAnalysisResponse | { error: string } = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      writeAnalysis(key, json);
      setData({ ...json, createdAt: Date.now() });
      onAnalyzed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  // Register this popup with the highlight-ask system so selecting text
  // inside it surfaces the same "Ask something" affordance as the side
  // panels. The scope data mirrors what's rendered so the LLM has the full
  // analysis (not just the highlighted sentence) when answering.
  useAskScopeData(
    data
      ? {
          id: "competitor-analysis",
          title: `Competitor — ${competitor.name}`,
          data: {
            competitor: {
              name: competitor.name,
              category: competitor.category,
              lat: competitor.lat,
              lng: competitor.lng,
              distanceM: competitor.distanceM ?? null,
              address: competitor.address ?? null,
            },
            analysis: {
              threatLevel: data.threatLevel,
              headline: data.headline,
              risks: data.risks,
              differentiators: data.differentiators,
              recommendation: data.recommendation,
              generatedAt: new Date(data.createdAt).toISOString(),
            },
            plan: plan
              ? {
                  id: plan.id,
                  name: plan.concept.name,
                  category: plan.concept.category,
                  valueProp: plan.concept.valueProp,
                  monthlyRent: plan.financials.rent,
                  buildingId: plan.buildingId ?? null,
                }
              : null,
            buildingLatLng: buildingLatLng ?? null,
            neighbourhood: neighbourhood ?? null,
          },
        }
      : null,
  );

  const threatBadge = data
    ? data.threatLevel === "high"
      ? { label: "HIGH THREAT", cls: "bg-red-100 text-red-700 border-red-300" }
      : data.threatLevel === "moderate"
        ? {
            label: "MODERATE",
            cls: "bg-amber-100 text-amber-700 border-amber-300",
          }
        : { label: "LOW THREAT", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" }
    : null;

  return (
    <div
      className="absolute z-30 top-6 left-1/2 -translate-x-1/2 w-[420px] max-w-[calc(100vw-3rem)] pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      data-ask-scope="competitor-analysis"
      data-ask-title={`Competitor — ${competitor.name}`}
    >
      <div className="glass rounded-lg shadow-2xl border border-slate-900/10 p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
              Competitor analysis
            </p>
            <h3 className="text-base font-black text-slate-900 truncate">
              {competitor.name}
            </h3>
            <p className="text-[11px] text-slate-500">
              {competitor.category}
              {typeof competitor.distanceM === "number"
                ? ` · ${Math.round(competitor.distanceM)} m away`
                : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-slate-900/10 transition-colors shrink-0"
          >
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {loading && (
          <div className="py-8 flex flex-col items-center gap-3 text-slate-500">
            <Sparkles className="animate-pulse" size={22} />
            <p className="text-[11px] font-semibold uppercase tracking-wider">
              Generating analysis…
            </p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-[11px] font-bold text-red-700 mb-1">
              Couldn&apos;t generate the analysis
            </p>
            <p className="text-[10px] text-red-600 mb-2">{error}</p>
            <button
              onClick={() => runAnalysis(true)}
              className="text-[10px] font-bold uppercase tracking-wide bg-red-600 text-white px-2.5 py-1 rounded hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {threatBadge && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black tracking-wide ${threatBadge.cls}`}
                >
                  {threatBadge.label}
                </span>
              )}
              <span className="text-[9px] text-slate-400">
                {new Date(data.createdAt).toLocaleString()}
              </span>
            </div>

            <p className="text-[12px] font-semibold text-slate-800 leading-snug">
              {data.headline}
            </p>

            {data.risks.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-red-600 mb-1.5">
                  <AlertTriangle size={11} /> Risks
                </p>
                <ul className="space-y-1">
                  {data.risks.map((r, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-slate-700 pl-3 relative leading-snug"
                    >
                      <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-red-500" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.differentiators.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-600 mb-1.5">
                  <Shield size={11} /> How you can win
                </p>
                <ul className="space-y-1">
                  {data.differentiators.map((d, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-slate-700 pl-3 relative leading-snug"
                    >
                      <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-emerald-500" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md bg-blue-50 border border-blue-200 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-blue-700 mb-1">
                Do this next
              </p>
              <p className="text-[11px] text-slate-800 leading-snug">
                {data.recommendation}
              </p>
            </div>

            <button
              onClick={() => runAnalysis(true)}
              disabled={loading}
              className="w-full mt-1 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800 py-1.5 transition-colors"
            >
              <RefreshCw size={11} /> Regenerate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
