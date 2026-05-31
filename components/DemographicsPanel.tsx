"use client";

import { useEffect, useMemo, useState } from "react";
import { Users, Home, TrendingUp, X, MapPin } from "lucide-react";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";
import { StatCard, StatGrid } from "@/components/panels/StatCard";

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  /** Optional anchor id used to find the active business plan for this site. */
  anchorBuildingId?: string;
}

interface NeighbourhoodFeature {
  name: string;
  polygons: number[][][][]; // MultiPolygon
  population: number | null;
  densityPerKm2: number | null;
  households: number | null;
  avgHouseholdSize: number | null;
  incomeRecipients: number | null;
  ageGroups?: {
    children0to14: number | null;
    youth15to24: number | null;
    workingAge25to54: number | null;
    preRetire55to64: number | null;
    seniors65plus: number | null;
  };
}

// Minimal subset of the BusinessPlan we read out of localStorage so the panel
// can compare the user's targeting against the neighbourhood. Full schema lives
// in lib/businessPlan.ts; we only need concept fields here.
interface PlanConceptSnapshot {
  id: string;
  buildingId?: string;
  updatedAt: number;
  name: string;
  category: string;
  targetAgeMin: number;
  targetAgeMax: number;
  targetIncomeTier: "$" | "$$" | "$$$" | "$$$$";
}

const PLAN_PREFIX = "tv:plan:";

function loadPlansFromStorage(): PlanConceptSnapshot[] {
  if (typeof window === "undefined") return [];
  const out: PlanConceptSnapshot[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(PLAN_PREFIX)) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        id: string;
        buildingId?: string;
        updatedAt: number;
        concept?: {
          name?: string;
          category?: string;
          targetAgeMin?: number;
          targetAgeMax?: number;
          targetIncomeTier?: "$" | "$$" | "$$$" | "$$$$";
        };
      };
      if (!parsed?.concept) continue;
      out.push({
        id: parsed.id,
        buildingId: parsed.buildingId,
        updatedAt: parsed.updatedAt ?? 0,
        name: parsed.concept.name ?? "",
        category: parsed.concept.category ?? "",
        targetAgeMin: parsed.concept.targetAgeMin ?? 25,
        targetAgeMax: parsed.concept.targetAgeMax ?? 54,
        targetIncomeTier: parsed.concept.targetIncomeTier ?? "$$",
      });
    } catch {
      // ignore malformed entries
    }
  }
  return out;
}

/** Pick the plan that best describes "the user's active plan" for this site. */
function pickActivePlan(
  plans: PlanConceptSnapshot[],
  anchorBuildingId?: string,
): PlanConceptSnapshot | null {
  if (plans.length === 0) return null;
  if (anchorBuildingId) {
    const match = plans.find((p) => p.buildingId === anchorBuildingId);
    if (match) return match;
  }
  // Otherwise: most recently updated.
  return plans.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

/**
 * Overlap between the plan's target age window and the neighbourhood's
 * 25–54 working-age band, expressed as a 0–1 share.
 */
function ageOverlapShare(min: number, max: number): number {
  const overlap = Math.max(0, Math.min(max, 54) - Math.max(min, 25));
  const targetSpan = Math.max(1, max - min);
  return Math.min(1, overlap / targetSpan);
}

/** Coarse income-tier compatibility from density + household size. */
function incomeTierMatch(
  tier: "$" | "$$" | "$$$" | "$$$$",
  densityPerKm2: number | null,
  avgHHSize: number | null,
): { score: number; note: string } {
  // Downtown rule of thumb (open.toronto.ca 2016 profiles):
  //   - High density + small HH (< 2.0) = young professional / single market
  //     → fits $$ and $$$; weaker fit for $ and $$$$ extremes.
  //   - Lower density + larger HH (>= 2.0) = families → fits $ and $$.
  const dens = densityPerKm2 ?? 0;
  const hh = avgHHSize ?? 2;
  const youngProAreaScore = dens > 12000 && hh < 2.1 ? 1 : 0.5;
  const familyAreaScore = dens < 12000 && hh >= 2 ? 1 : 0.5;
  switch (tier) {
    case "$":
      return {
        score: Math.max(youngProAreaScore * 0.7, familyAreaScore),
        note:
          familyAreaScore === 1
            ? "Mix of households here is consistent with everyday/value spending."
            : "Dense single-occupant area — value pricing still works, but rent will be high.",
      };
    case "$$":
      return {
        score: 0.85,
        note: "Mid-tier price points fit downtown spend patterns well.",
      };
    case "$$$":
      return {
        score: youngProAreaScore,
        note:
          youngProAreaScore === 1
            ? "Density + small household size signal a young-professional spend bracket."
            : "Premium pricing may be harder outside the densest CBD blocks.",
      };
    case "$$$$":
      return {
        score: youngProAreaScore * 0.7,
        note: "Luxury tier — sustainable only in the highest-density CBD blocks (Bay/King area).",
      };
  }
}

interface DemographicsPanelProps {
  visible: boolean;
  onClose: () => void;
  buildings: PlacedBuilding[];
}

// Ray-casting point-in-polygon for [lng, lat] rings.
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInFeature(
  lng: number,
  lat: number,
  feature: NeighbourhoodFeature,
): boolean {
  for (const poly of feature.polygons) {
    if (pointInRing(lng, lat, poly[0])) return true;
  }
  return false;
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US") + suffix;
}

// Legacy local Stat removed — see <StatCard /> from components/panels/StatCard.

export default function DemographicsPanel({
  visible,
  onClose,
  buildings,
}: DemographicsPanelProps) {
  const [data, setData] = useState<NeighbourhoodFeature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanConceptSnapshot[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (data) return;
    let cancelled = false;
    fetch("/map-data/neighbourhoods.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        if (!cancelled) setData(j as NeighbourhoodFeature[]);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, data]);

  // Re-read business plans from localStorage every time the panel opens so
  // a freshly-saved plan shows up without a hard refresh.
  useEffect(() => {
    if (!visible) return;
    setPlans(loadPlansFromStorage());
  }, [visible]);

  // Use the most recently placed building as the analysis anchor; if none, the
  // panel asks the user to place one.
  const anchor = buildings[buildings.length - 1];

  const matched = useMemo(() => {
    if (!data || !anchor) return null;
    return (
      data.find((n) => pointInFeature(anchor.lng, anchor.lat, n)) ?? null
    );
  }, [data, anchor]);

  // Aggregate for the full downtown bbox so users can compare neighbourhood vs.
  // wider catchment.
  const totals = useMemo(() => {
    if (!data) return null;
    const sum = (key: keyof NeighbourhoodFeature) =>
      data.reduce<number>(
        (acc, n) => acc + ((n[key] as number | null) ?? 0),
        0,
      );
    return {
      population: sum("population"),
      households: sum("households"),
      neighbourhoodCount: data.length,
    };
  }, [data]);

  // Register the visible data so the highlight-ask provider can pull it
  // into the AI context bundle when the user highlights text in this panel.
  useAskScopeData(
    visible
      ? {
          id: "demographics",
          title: "Demographics & Catchment",
          data: {
            neighbourhood: matched?.name ?? null,
            population: matched?.population ?? null,
            densityPerKm2: matched?.densityPerKm2 ?? null,
            households: matched?.households ?? null,
            avgHouseholdSize: matched?.avgHouseholdSize ?? null,
            incomeRecipients: matched?.incomeRecipients ?? null,
            workingAge25to54: matched?.ageGroups?.workingAge25to54 ?? null,
            youth15to24: matched?.ageGroups?.youth15to24 ?? null,
            seniors65plus: matched?.ageGroups?.seniors65plus ?? null,
            anchorLat: anchor?.lat ?? null,
            anchorLng: anchor?.lng ?? null,
            widerCatchment: totals,
          },
        }
      : null,
  );

  if (!visible) return null;

  return (
    <div data-ask-scope="demographics" data-ask-title="Demographics & Catchment">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="text-blue-500" size={20} />
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
            Demographics &amp; Catchment
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-900/8 rounded"
          aria-label="Close demographics panel"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      <p className="text-[10px] text-slate-500 mb-4">
        Source: City of Toronto Neighbourhood Profiles (2016 census,
        open.toronto.ca). Numbers are at the neighbourhood level — your
        catchment within walking distance will be a subset.
      </p>

      {error && (
        <p className="text-[11px] text-red-600 mb-3">
          Couldn&rsquo;t load neighbourhood data: {error}
        </p>
      )}

      {!anchor ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-50 p-3">
          <p className="text-[11px] text-amber-900">
            <MapPin size={12} className="inline mr-1" />
            Place a building first to see the demographics of the surrounding
            neighbourhood.
          </p>
        </div>
      ) : !data ? (
        <p className="text-[11px] text-slate-500">Loading…</p>
      ) : !matched ? (
        <div className="rounded-md border border-slate-900/10 bg-slate-50 p-3">
          <p className="text-[11px] text-slate-600">
            The site sits outside the loaded downtown neighbourhoods. Move the
            building inside the downtown bbox to see a profile.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 px-3 py-2 rounded-md bg-blue-50 border border-blue-200">
            <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wide">
              Site neighbourhood
            </p>
            <p className="text-sm font-black text-blue-900">{matched.name}</p>
          </div>

          <StatGrid cols={2}>
            <StatCard
              label="Population"
              value={fmt(matched.population)}
              icon={<Users size={10} />}
            />
            <StatCard
              label="Density /km²"
              value={fmt(matched.densityPerKm2)}
              icon={<TrendingUp size={10} />}
            />
            <StatCard
              label="Households"
              value={fmt(matched.households)}
              icon={<Home size={10} />}
            />
            <StatCard
              label="Avg HH size"
              value={
                matched.avgHouseholdSize != null
                  ? matched.avgHouseholdSize.toFixed(2)
                  : "—"
              }
              icon={<Users size={10} />}
            />
            <StatCard
              label="Earners 15+"
              value={fmt(matched.incomeRecipients)}
              icon={<TrendingUp size={10} />}
            />
            <StatCard
              label="Working age 25-54"
              value={fmt(matched.ageGroups?.workingAge25to54 ?? null)}
              icon={<Users size={10} />}
            />
          </StatGrid>

          {/* Plan-vs-site match — only renders when there's an active plan
              we can compare against. */}
          {(() => {
            const plan = pickActivePlan(plans, anchor?.anchorBuildingId);
            if (!plan || !matched) return null;

            const workShare =
              matched.population && matched.ageGroups?.workingAge25to54
                ? (matched.ageGroups.workingAge25to54 / matched.population) *
                  100
                : null;
            const youthShare =
              matched.population && matched.ageGroups?.youth15to24
                ? (matched.ageGroups.youth15to24 / matched.population) * 100
                : null;
            const seniorShare =
              matched.population && matched.ageGroups?.seniors65plus
                ? (matched.ageGroups.seniors65plus / matched.population) * 100
                : null;

            // Age match: overlap between plan's target range and the 25–54
            // band, weighted by how much of the neighbourhood actually sits in
            // that band.
            const ageOverlap = ageOverlapShare(
              plan.targetAgeMin,
              plan.targetAgeMax,
            );
            const workShareNorm = workShare != null ? workShare / 100 : 0.55;
            const ageScore = ageOverlap * (0.6 + workShareNorm * 0.4);

            const income = incomeTierMatch(
              plan.targetIncomeTier,
              matched.densityPerKm2,
              matched.avgHouseholdSize,
            );

            const matchPct = Math.round(
              (ageScore * 0.55 + income.score * 0.45) * 100,
            );
            const verdict =
              matchPct >= 70
                ? { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-300", word: "Strong fit" }
                : matchPct >= 50
                  ? { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-300", word: "Mixed fit" }
                  : { color: "text-red-700", bg: "bg-red-50", border: "border-red-300", word: "Weak fit" };

            return (
              <div className="mt-4 pt-4 border-t border-slate-900/10">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Plan vs. site
                </p>
                <div
                  className={`mb-2 px-3 py-2 rounded-md border ${verdict.bg} ${verdict.border}`}
                >
                  <div className="flex items-baseline justify-between">
                    <p
                      className={`text-[9px] font-bold ${verdict.color} uppercase tracking-wide`}
                    >
                      {verdict.word}
                    </p>
                    <p className={`text-lg font-black ${verdict.color}`}>
                      {matchPct}%
                    </p>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    Match between &ldquo;{plan.name || "your plan"}&rdquo;{" "}
                    target customer and {matched.name}.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="rounded border border-slate-200 p-2">
                    <p className="font-bold text-slate-500 uppercase tracking-wide text-[9px] mb-0.5">
                      Your target
                    </p>
                    <p className="text-slate-800">
                      Age {plan.targetAgeMin}–{plan.targetAgeMax}
                    </p>
                    <p className="text-slate-800">
                      {plan.targetIncomeTier} spend tier
                    </p>
                  </div>
                  <div className="rounded border border-slate-200 p-2">
                    <p className="font-bold text-slate-500 uppercase tracking-wide text-[9px] mb-0.5">
                      This neighbourhood
                    </p>
                    <p className="text-slate-800">
                      {workShare != null
                        ? `${workShare.toFixed(0)}% age 25-54`
                        : "Age mix —"}
                    </p>
                    <p className="text-slate-800">
                      {youthShare != null && seniorShare != null
                        ? `${youthShare.toFixed(0)}% youth · ${seniorShare.toFixed(0)}% 65+`
                        : "—"}
                    </p>
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-slate-600 leading-snug">
                  {income.note}
                </p>
              </div>
            );
          })()}
        </>
      )}

      {totals && (
        <div className="mt-5 pt-4 border-t border-slate-900/10">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-2">
            Wider downtown catchment
          </p>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-slate-500">Neighbourhoods</p>
              <p className="font-black text-slate-900 text-sm">
                {totals.neighbourhoodCount}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Total pop.</p>
              <p className="font-black text-slate-900 text-sm">
                {fmt(totals.population)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Households</p>
              <p className="font-black text-slate-900 text-sm">
                {fmt(totals.households)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
