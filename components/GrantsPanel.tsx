"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Coins,
  ExternalLink,
  Sparkles,
  X,
} from "lucide-react";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";
import { StatCard, StatGrid } from "@/components/panels/StatCard";
import { GRANTS, scoreGrant, type Grant } from "@/lib/grantsCatalog";
import type { BusinessCategory } from "@/lib/businessPlan";
import { type BuildMode, BUILD_MODE_LABELS } from "@/lib/buildMode";

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  anchorBuildingId?: string;
  buildMode?: BuildMode;
}

interface PlanSnapshot {
  id: string;
  buildingId?: string;
  updatedAt: number;
  name: string;
  category: BusinessCategory | "";
  employees: number | null;
  serviceModel: string | null;
}

const PLAN_PREFIX = "tv:plan:";

function loadPlansFromStorage(): PlanSnapshot[] {
  if (typeof window === "undefined") return [];
  const out: PlanSnapshot[] = [];
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
        concept?: { name?: string; category?: BusinessCategory; serviceModel?: string };
        staffing?: { roles?: Array<{ headcount?: number }> };
      };
      if (!parsed?.concept) continue;
      const employees =
        parsed.staffing?.roles?.reduce(
          (acc, r) => acc + (Number(r.headcount) || 0),
          0,
        ) ?? null;
      out.push({
        id: parsed.id,
        buildingId: parsed.buildingId,
        updatedAt: parsed.updatedAt ?? 0,
        name: parsed.concept.name ?? "",
        category: parsed.concept.category ?? "",
        employees,
        serviceModel: parsed.concept.serviceModel ?? null,
      });
    } catch {
      // ignore
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

interface CkanGrantPackage {
  id: string;
  slug: string;
  title: string;
  notes: string | null;
  resources: number;
  updated: string | null;
  url: string;
}

interface ApiResponse {
  packages: CkanGrantPackage[];
  total: number;
  attribution: string;
  sourceUrl: string;
  error?: string;
}

interface GrantsPanelProps {
  visible: boolean;
  onClose: () => void;
  buildings: PlacedBuilding[];
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

const STOREFRONT_CATEGORIES = new Set<BusinessCategory>([
  "cafe",
  "full-service-restaurant",
  "quick-serve-restaurant",
  "bar",
  "retail-apparel",
  "retail-grocery",
  "bakery",
  "bookstore",
  "salon-spa",
]);

export default function GrantsPanel({
  visible,
  onClose,
  buildings,
}: GrantsPanelProps) {
  const [plans, setPlans] = useState<PlanSnapshot[]>([]);
  const [live, setLive] = useState<ApiResponse | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const anchor = buildings[buildings.length - 1] ?? null;

  const matchedPlan = useMemo(() => {
    if (plans.length === 0) return null;
    if (anchor?.anchorBuildingId) {
      const tied = plans.find((p) => p.buildingId === anchor.anchorBuildingId);
      if (tied) return tied;
    }
    return plans[0];
  }, [plans, anchor]);

  // Build the profile used to score grants. We don't have a live BIA polygon
  // map here, so treat insideBia as unknown — the panel still scores all
  // BIA-only grants, just flags eligibility uncertainty.
  const buildMode: BuildMode | undefined = anchor?.buildMode;
  const profile = useMemo(() => {
    const cat = matchedPlan?.category ?? "";
    return {
      category: cat as BusinessCategory | "",
      employees: matchedPlan?.employees ?? null,
      insideBia: null,
      isStorefront: cat ? STOREFRONT_CATEGORIES.has(cat as BusinessCategory) : null,
      buildMode,
    };
  }, [matchedPlan, buildMode]);

  // Score and rank all grants
  const scored = useMemo(() => {
    if (!matchedPlan) return [];
    return GRANTS.map((g) => {
      const result = scoreGrant(g, profile);
      if (!result) return null;
      return { grant: g, ...result };
    })
      .filter((x): x is { grant: Grant; score: number; matched: string[]; disqualified: string[] } => x !== null)
      .sort((a, b) => b.score - a.score);
  }, [matchedPlan, profile]);

  const totalUpperBound = useMemo(
    () =>
      scored
        .filter((s) => s.score > 0.4)
        .reduce((acc, s) => acc + s.grant.amountRangeCad[1], 0),
    [scored],
  );

  useEffect(() => {
    if (!visible) return;
    setPlans(loadPlansFromStorage());
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingLive(true);
    setLiveError(null);
    fetch("/api/grants")
      .then(async (res) => {
        const body = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || body.error) {
          setLiveError(body.error ?? `HTTP ${res.status}`);
          setLive({ ...body, packages: body.packages ?? [] });
        } else {
          setLive(body);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLiveError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingLive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useAskScopeData(
    visible
      ? {
          id: "grants",
          title: "Grants & Funding",
          data: {
            category: matchedPlan?.category ?? null,
            employees: matchedPlan?.employees ?? null,
            totalUpperBoundCad: totalUpperBound,
            matchedGrants: scored
              .filter((s) => s.score > 0.4)
              .map((s) => ({ name: s.grant.name, level: s.grant.level })),
          },
        }
      : null,
  );

  if (!visible) return null;

  const goodMatches = scored.filter((s) => s.score >= 0.6);
  const possibleMatches = scored.filter((s) => s.score > 0.3 && s.score < 0.6);

  return (
    <div data-ask-scope="grants" data-ask-title="Grants & Funding">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Coins className="text-amber-600" size={20} />
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
            Grants &amp; Funding
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-900/8 rounded"
          aria-label="Close grants panel"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
        Curated catalog of City of Toronto, Ontario, and federal small-business
        grants, scored against your plan. Live dataset list pulled from{" "}
        <a
          href="https://open.toronto.ca/"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-amber-700"
        >
          open.toronto.ca
        </a>{" "}
        (CKAN package_search).
      </p>

      {!matchedPlan ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] text-amber-900">
            <AlertTriangle size={12} className="inline mr-1" />
            Save a business plan first — we&rsquo;ll match grants against the
            category, employees, and location.
          </p>
        </div>
      ) : (
        <>
          {/* Profile + bound */}
          <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200">
            <p className="text-[9px] font-bold text-amber-700 uppercase tracking-wide">
              Matching against
            </p>
            <p className="text-sm font-black text-amber-900">
              {matchedPlan.name || "Untitled"}
            </p>
            <p className="text-[10px] text-amber-800 mt-0.5">
              {matchedPlan.category || "no category set"}
              {matchedPlan.employees != null && (
                <> · {matchedPlan.employees} staff</>
              )}
              {buildMode && <> · {BUILD_MODE_LABELS[buildMode]}</>}
            </p>
          </div>

          <StatGrid className="mb-4">
            <StatCard label="Strong" value={String(goodMatches.length)} tone="ok" />
            <StatCard label="Possible" value={String(possibleMatches.length)} />
            <StatCard
              label="Max stack"
              value={formatMoney(totalUpperBound)}
              hint="Upper bound across all matches"
              tone="accent"
            />
          </StatGrid>

          {goodMatches.length > 0 && (
            <Section title="Strong matches">
              {goodMatches.map((s) => (
                <GrantCard key={s.grant.id} grant={s.grant} matched={s.matched} score={s.score} />
              ))}
            </Section>
          )}

          {possibleMatches.length > 0 && (
            <Section title="Possible matches (check eligibility)">
              {possibleMatches.map((s) => (
                <GrantCard
                  key={s.grant.id}
                  grant={s.grant}
                  matched={s.matched}
                  score={s.score}
                  disqualified={s.disqualified}
                />
              ))}
            </Section>
          )}

          {goodMatches.length === 0 && possibleMatches.length === 0 && (
            <p className="text-[11px] text-slate-500 italic">
              No grants in the catalog match this plan yet. Fill in Category +
              Staffing to widen the search.
            </p>
          )}
        </>
      )}

      {/* Live CKAN datasets */}
      <div className="pt-4 mt-4 border-t border-slate-900/10">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600 mb-2 flex items-center gap-1">
          <Sparkles size={11} className="text-amber-600" />
          Toronto Open Data — grant / funding datasets
        </p>
        {loadingLive && (
          <p className="text-[11px] text-slate-500">Loading from open.toronto.ca…</p>
        )}
        {liveError && (
          <p className="text-[11px] text-rose-600">
            Couldn&rsquo;t reach Toronto Open Data: {liveError}
          </p>
        )}
        {!loadingLive && live && live.packages.length > 0 && (
          <ul className="space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
            {live.packages.slice(0, 10).map((pkg) => (
              <li
                key={pkg.id}
                className="rounded border border-slate-900/8 bg-slate-50 px-2.5 py-1.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={pkg.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-slate-800 hover:text-amber-700 leading-tight"
                  >
                    {pkg.title}
                  </a>
                  <ExternalLink size={10} className="text-slate-400 shrink-0 mt-0.5" />
                </div>
                {pkg.notes && (
                  <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 mt-0.5">
                    {pkg.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        {!loadingLive && live && live.packages.length === 0 && (
          <p className="text-[11px] text-slate-500 italic">
            No grant-related datasets returned by CKAN.
          </p>
        )}
      </div>

      <p className="text-[9px] text-slate-400 mt-4 leading-snug">
        Match scores are a planning aid — confirm eligibility on each program
        page and check application windows (many grants are seasonal).
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-600 mb-2">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function GrantCard({
  grant,
  matched,
  score,
  disqualified,
}: {
  grant: Grant;
  matched: string[];
  score: number;
  disqualified?: string[];
}) {
  const levelChip =
    grant.level === "City of Toronto"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : grant.level === "Province of Ontario"
        ? "bg-blue-100 text-blue-800 border-blue-200"
        : "bg-purple-100 text-purple-800 border-purple-200";

  return (
    <div className="rounded-lg border border-slate-900/10 bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-bold text-slate-900 leading-snug">
            {grant.name}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span
              className={`text-[9px] font-black uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-full border ${levelChip}`}
            >
              {grant.level}
            </span>
            <span className="text-[10px] font-bold text-slate-700 tabular-nums">
              {formatMoney(grant.amountRangeCad[0])}–{formatMoney(grant.amountRangeCad[1])}
            </span>
          </div>
        </div>
        <a
          href={grant.applyUrl}
          target="_blank"
          rel="noreferrer"
          className="text-slate-400 hover:text-amber-700 shrink-0 mt-0.5"
          title="Open application page"
        >
          <ExternalLink size={12} />
        </a>
      </div>
      <p className="text-[11px] text-slate-600 mt-2 leading-snug">
        {grant.funds}
      </p>
      {(matched.length > 0 || (disqualified && disqualified.length > 0)) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {matched.map((m) => (
            <span
              key={m}
              className="text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full"
            >
              {m}
            </span>
          ))}
          {disqualified?.map((d) => (
            <span
              key={d}
              className="text-[9px] font-bold text-rose-800 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-full"
            >
              ⚠ {d}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full"
            style={{ width: `${Math.round(score * 100)}%` }}
          />
        </div>
        <p className="text-[9px] font-bold text-slate-500 tabular-nums shrink-0">
          {(score * 100).toFixed(0)}% match
        </p>
      </div>
    </div>
  );
}

