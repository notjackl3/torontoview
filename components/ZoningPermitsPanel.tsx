"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  ShieldAlert,
  X,
} from "lucide-react";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";
import { StatCard, StatGrid } from "@/components/panels/StatCard";
import { getRequiredPermits, type RequiredPermit } from "@/lib/permitsCatalog";
import {
  fetchZoneAtPoint,
  getCategoryUseCompatibility,
  type UseCompatibility,
} from "@/lib/zoneCompatibility";
import {
  type BuildMode,
  type LeaseTerm,
  BUILD_MODE_LABELS,
  involvesNewConstruction,
} from "@/lib/buildMode";
import type { BusinessCategory } from "@/lib/businessPlan";

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  anchorBuildingId?: string;
  existingBuildingId?: string;
  buildMode?: BuildMode;
  leaseTerm?: LeaseTerm;
  leaseMonths?: number;
}

interface PlanSnapshot {
  id: string;
  buildingId?: string;
  updatedAt: number;
  name: string;
  category: BusinessCategory | "";
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
        concept?: { name?: string; category?: BusinessCategory };
      };
      if (!parsed?.concept) continue;
      out.push({
        id: parsed.id,
        buildingId: parsed.buildingId,
        updatedAt: parsed.updatedAt ?? 0,
        name: parsed.concept.name ?? "",
        category: parsed.concept.category ?? "",
      });
    } catch {
      // ignore parse failures
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

interface ZoningPermitsPanelProps {
  visible: boolean;
  onClose: () => void;
  buildings: PlacedBuilding[];
}

const USE_COMPAT_COPY: Record<UseCompatibility, {
  label: string;
  tone: "ok" | "warn" | "bad" | "info";
  detail: string;
}> = {
  "as-of-right": {
    label: "As-of-right",
    tone: "ok",
    detail:
      "This use is permitted by the Official Plan at this address — no zoning relief needed before permits.",
  },
  "minor-variance": {
    label: "Minor variance likely",
    tone: "warn",
    detail:
      "The OP zone here doesn't list this use directly, but does allow related uses — Committee of Adjustment relief is the usual path.",
  },
  rezoning: {
    label: "Rezoning required",
    tone: "bad",
    detail:
      "The OP zone here doesn't permit this use at all. A full Zoning By-law Amendment will likely be required before any permit can issue.",
  },
  unknown: {
    label: "Zone lookup pending",
    tone: "info",
    detail:
      "Zone information not yet available for this point — verdict will refine once the Official Plan layer responds.",
  },
};

export default function ZoningPermitsPanel({
  visible,
  onClose,
  buildings,
}: ZoningPermitsPanelProps) {
  const [plans, setPlans] = useState<PlanSnapshot[]>([]);
  const [opZone, setOpZone] = useState<string | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);

  const anchor = buildings[buildings.length - 1] ?? null;
  const buildMode: BuildMode = anchor?.buildMode ?? "new-build";

  // Find the most recent plan, prefer one tied to the anchor building.
  const matchedPlan = useMemo(() => {
    if (plans.length === 0) return null;
    if (anchor?.anchorBuildingId) {
      const tied = plans.find((p) => p.buildingId === anchor.anchorBuildingId);
      if (tied) return tied;
    }
    return plans[0];
  }, [plans, anchor]);

  // Resolve the Official Plan zone at the actual placement coordinate. The
  // verdict ("as-of-right" / "minor-variance" / "rezoning") feeds into the
  // permits catalog so we inject Committee-of-Adjustment / rezoning entries
  // only when warranted.
  useEffect(() => {
    if (!visible || !anchor) {
      setOpZone(null);
      return;
    }
    let cancelled = false;
    setZoneLoading(true);
    fetchZoneAtPoint(anchor.lat, anchor.lng)
      .then((code) => {
        if (!cancelled) setOpZone(code);
      })
      .catch(() => {
        if (!cancelled) setOpZone(null);
      })
      .finally(() => {
        if (!cancelled) setZoneLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, anchor?.lat, anchor?.lng, anchor]);

  const useCompat: UseCompatibility = useMemo(() => {
    if (!matchedPlan?.category) return "unknown";
    if (zoneLoading) return "unknown";
    return getCategoryUseCompatibility(opZone, matchedPlan.category);
  }, [opZone, matchedPlan, zoneLoading]);

  const requiredPermits: RequiredPermit[] = useMemo(() => {
    if (!matchedPlan?.category) return [];
    return getRequiredPermits({
      category: matchedPlan.category,
      buildMode,
      useCompatibility: useCompat,
    });
  }, [matchedPlan, buildMode, useCompat]);

  useEffect(() => {
    if (!visible) return;
    setPlans(loadPlansFromStorage());
  }, [visible]);

  // Surface to the ask-highlight provider so the agent can read this panel.
  useAskScopeData(
    visible
      ? {
          id: "zoning-permits",
          title: "Zoning & Permits",
          data: {
            category: matchedPlan?.category ?? null,
            buildMode,
            officialPlanZone: opZone,
            useCompatibility: useCompat,
            requiredPermits: requiredPermits.map((p) => ({
              name: p.name,
              authority: p.authority,
              blocker: p.blocker,
            })),
            anchorLat: anchor?.lat ?? null,
            anchorLng: anchor?.lng ?? null,
          },
        }
      : null,
  );

  if (!visible) return null;

  const blockerCount = requiredPermits.filter((p) => p.blocker).length;
  const totalWeeksMin = requiredPermits.reduce(
    (acc, p) => acc + p.typicalWeeks[0],
    0,
  );
  const totalWeeksMax = requiredPermits.reduce(
    (acc, p) => acc + p.typicalWeeks[1],
    0,
  );
  // Real-world: many permits run in parallel. Show a parallel estimate by
  // taking the longest blocker rather than the sum.
  const parallelWeeksMax = requiredPermits.reduce(
    (acc, p) => (p.blocker ? Math.max(acc, p.typicalWeeks[1]) : acc),
    0,
  );

  const compat = USE_COMPAT_COPY[useCompat];

  return (
    <div data-ask-scope="zoning-permits" data-ask-title="Zoning & Permits">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-emerald-600" size={20} />
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
            Zoning &amp; Permits
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-900/8 rounded"
          aria-label="Close zoning panel"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
        Required-permit catalog branches on how you&rsquo;re taking the site
        (rent / build / demo-rebuild) and on the Official Plan zone at the
        building coordinate. Sourced from Toronto bylaws, Toronto Public
        Health, AGCO, and Toronto Fire.
      </p>

      {!matchedPlan ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] text-amber-900">
            <AlertTriangle size={12} className="inline mr-1" />
            Save a business plan first (set a Category in Concept) and we&rsquo;ll
            show which permits you need.
          </p>
        </div>
      ) : !matchedPlan.category ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-[11px] text-amber-900">
            <AlertTriangle size={12} className="inline mr-1" />
            Your plan &ldquo;{matchedPlan.name || "Untitled"}&rdquo; has no
            Category yet — pick one in the Concept step.
          </p>
        </div>
      ) : (
        <>
          {/* Plan + site banner — includes how the user is taking the site
              and the OP zone at the placed coordinate. */}
          <div className="mb-3 px-3 py-2 rounded-md bg-emerald-50 border border-emerald-200">
            <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide">
              Active plan
            </p>
            <p className="text-sm font-black text-emerald-900">
              {matchedPlan.name || "Untitled"}
            </p>
            <p className="text-[10px] text-emerald-800 mt-0.5">
              {matchedPlan.category} · {BUILD_MODE_LABELS[buildMode]}
              {buildMode === "move-in" && anchor?.leaseMonths
                ? ` · ${anchor.leaseMonths}-mo lease`
                : ""}
            </p>
            {anchor && (
              <p className="text-[10px] text-emerald-700/80 mt-1 flex items-center gap-1">
                <MapPin size={10} />
                <span className="tabular-nums">
                  {anchor.lat.toFixed(5)}, {anchor.lng.toFixed(5)}
                </span>
                {opZone && (
                  <span className="ml-1 rounded-full bg-emerald-100 border border-emerald-300 px-1.5 py-px text-[9px] font-black uppercase tracking-wide">
                    OP {opZone}
                  </span>
                )}
                {zoneLoading && (
                  <span className="ml-1 text-emerald-700/60 italic">loading zone…</span>
                )}
              </p>
            )}
          </div>

          {/* Use-vs-zone verdict — drives whether CoA / rezoning are listed. */}
          <div
            className={`mb-4 rounded-md border p-3 ${
              compat.tone === "ok"
                ? "border-emerald-300 bg-emerald-50"
                : compat.tone === "warn"
                  ? "border-amber-300 bg-amber-50"
                  : compat.tone === "bad"
                    ? "border-rose-300 bg-rose-50"
                    : "border-slate-300 bg-slate-50"
            }`}
          >
            <p
              className={`text-[10px] font-black uppercase tracking-wide ${
                compat.tone === "ok"
                  ? "text-emerald-800"
                  : compat.tone === "warn"
                    ? "text-amber-800"
                    : compat.tone === "bad"
                      ? "text-rose-800"
                      : "text-slate-700"
              }`}
            >
              Use vs. zone: {compat.label}
            </p>
            <p
              className={`text-[10px] mt-1 leading-snug ${
                compat.tone === "ok"
                  ? "text-emerald-900/80"
                  : compat.tone === "warn"
                    ? "text-amber-900/80"
                    : compat.tone === "bad"
                      ? "text-rose-900/80"
                      : "text-slate-700"
              }`}
            >
              {compat.detail}
            </p>
          </div>

          {/* Summary stats — labels reflect the build mode. */}
          <StatGrid className="mb-4">
            <StatCard
              label="Required"
              value={String(requiredPermits.length)}
              hint={
                involvesNewConstruction(buildMode)
                  ? "Permits for ground-up build"
                  : "Permits for fit-out + opening"
              }
            />
            <StatCard
              label="Blockers"
              value={String(blockerCount)}
              tone={blockerCount > 0 ? "warn" : "ok"}
              hint={blockerCount > 0 ? "Must clear before opening" : "None"}
            />
            <StatCard
              label="Timeline"
              value={`${parallelWeeksMax}w`}
              hint={`Sequential: ${totalWeeksMin}–${totalWeeksMax}w`}
              tone="info"
            />
          </StatGrid>

          {/* Required permits list */}
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.06em] text-slate-600 mb-2">
              You will need
            </p>
            <ul className="space-y-2">
              {requiredPermits.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-slate-900/10 bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`shrink-0 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                        p.blocker
                          ? "bg-rose-50 text-rose-600"
                          : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {p.blocker ? <ShieldAlert size={12} /> : <CheckCircle2 size={12} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[12px] font-bold text-slate-900 leading-snug">
                          {p.name}
                        </p>
                        <a
                          href={p.applyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-emerald-700 shrink-0 mt-0.5"
                          title="Open application page"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {p.authority}
                      </p>
                      <p className="text-[11px] text-slate-600 mt-2 leading-snug">
                        {p.why}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 tabular-nums">
                          <Clock size={9} />
                          {p.typicalWeeks[0]}–{p.typicalWeeks[1]}w
                        </span>
                        {p.blocker && (
                          <span className="rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-tight">
                            Blocker
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="text-[9px] text-slate-400 mt-4 leading-snug">
        <FileText size={10} className="inline mr-1" />
        This is a planning aid — confirm against the City of Toronto Zoning
        By-law (Chapter 569-2013) and your business licence category before
        signing a lease.
      </p>
    </div>
  );
}
