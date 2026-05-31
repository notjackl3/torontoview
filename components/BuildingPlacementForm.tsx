"use client";

import { useState, useEffect } from "react";
import { X, Building2, AlertTriangle, Pencil, Hammer, Store } from "lucide-react";
import Link from "next/link";
import { TORONTO_ZONE_TYPES, type TorontoZoneCode } from "@/lib/torontoZoning";
import {
  fetchZoneAtPoint,
  getZoneCompatibilityWarning,
} from "@/lib/zoneCompatibility";
import type { BuildMode, LeaseTerm } from "@/lib/buildMode";

export type { BuildMode, LeaseTerm };

export interface BuildingPlacementDetails {
  zoneType: TorontoZoneCode;
  startDate: string; // ISO date
  durationDays: number;
  buildMode: BuildMode;
  // Only meaningful when buildMode === "move-in"
  leaseTerm?: LeaseTerm;
  leaseMonths?: number;
}

interface BuildModeOption {
  mode: BuildMode;
  label: string;
  description: string;
  icon: typeof Building2;
  defaultDuration: number;
  durationLabel: string;
}

const BUILD_MODES: BuildModeOption[] = [
  {
    mode: "new-build",
    label: "Build on Empty Land",
    description: "Buy land and build from the ground up. Highest cost, full ownership.",
    icon: Building2,
    defaultDuration: 180,
    durationLabel: "Construction Duration (days)",
  },
  {
    mode: "demolish-rebuild",
    label: "Demolish & Rebuild",
    description: "Buy property, tear down existing structure, then build new. Highest total cost.",
    icon: Hammer,
    defaultDuration: 240,
    durationLabel: "Demolition + Construction (days)",
  },
  {
    mode: "move-in",
    label: "Move Into Existing",
    description: "Lease existing space and fit it out. Lowest upfront cost, ongoing rent.",
    icon: Store,
    defaultDuration: 60,
    durationLabel: "Fit-out Duration (days)",
  },
];

const LEASE_TERMS: { term: LeaseTerm; label: string; months: number; description: string }[] = [
  {
    term: "short",
    label: "Short-Term",
    months: 6,
    description: "6-month lease. Flexible exit, ~25% rate premium.",
  },
  {
    term: "long",
    label: "Long-Term",
    months: 60,
    description: "5-year lease. Lower monthly rate, committed term.",
  },
];

interface BuildingPlacementFormProps {
  lat: number;
  lng: number;
  onSubmit: (details: BuildingPlacementDetails) => void;
  onCancel: () => void;
  initialBuildMode?: BuildMode;
  /** Hide the "How will you take this site?" picker. Set when the user has
   *  already chosen a mode upstream (e.g. via /start) so we don't ask twice. */
  lockBuildMode?: boolean;
}

export function BuildingPlacementForm({
  lat,
  lng,
  onSubmit,
  onCancel,
  initialBuildMode,
  lockBuildMode = false,
}: BuildingPlacementFormProps) {
  const [buildMode, setBuildMode] = useState<BuildMode>(
    initialBuildMode ?? "new-build",
  );
  const [zoneType, setZoneType] = useState<TorontoZoneCode>("MU1");
  const [durationDays, setDurationDays] = useState(180);
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [leaseTerm, setLeaseTerm] = useState<LeaseTerm>("long");
  const [officialPlanZone, setOfficialPlanZone] = useState<string | null>(null);
  const [zoneLoading, setZoneLoading] = useState(true);

  // When user changes mode, reset duration to that mode's default
  useEffect(() => {
    const opt = BUILD_MODES.find((m) => m.mode === buildMode);
    if (opt) setDurationDays(opt.defaultDuration);
  }, [buildMode]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setZoneLoading(true);
    });
    fetchZoneAtPoint(lat, lng)
      .then((code) => {
        if (!cancelled) setOfficialPlanZone(code);
      })
      .catch(() => {
        if (!cancelled) setOfficialPlanZone(null);
      })
      .finally(() => {
        if (!cancelled) setZoneLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const zoneWarning = getZoneCompatibilityWarning(officialPlanZone, zoneType);
  const activeMode = BUILD_MODES.find((m) => m.mode === buildMode)!;
  const leaseMonths =
    buildMode === "move-in"
      ? LEASE_TERMS.find((t) => t.term === leaseTerm)?.months
      : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      zoneType,
      startDate,
      durationDays,
      buildMode,
      leaseTerm: buildMode === "move-in" ? leaseTerm : undefined,
      leaseMonths,
    });
  };

  const categories = [...new Set(TORONTO_ZONE_TYPES.map((z) => z.category))];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="glass rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 glass border-b border-slate-900/10 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-400" size={20} />
            <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
              Building Details
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 hover:bg-slate-900/8 rounded-full transition-colors text-slate-500 hover:text-slate-800"
          >
            <X size={18} />
          </button>
        </div>

        {/* Go to Build Mode */}
        <div className="px-6 pt-4 pb-2">
          <Link
            href="/editor"
            className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-indigo-600/20 border border-indigo-400/30 hover:bg-indigo-600/30 hover:border-indigo-400/50 transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Pencil size={14} className="text-indigo-600" />
              <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-tight">
                Design a Building First
              </span>
            </div>
            <span className="text-[10px] font-semibold text-indigo-600 group-hover:text-indigo-800 transition-colors">
              Go to Build Mode →
            </span>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Build Mode Selector — hidden when the user has already picked the
              mode upstream (e.g. on /start), so we don't ask the same question
              twice. The active mode is shown as a read-only chip instead. */}
          {lockBuildMode ? (
            (() => {
              const opt = BUILD_MODES.find((m) => m.mode === buildMode);
              if (!opt) return null;
              const Icon = opt.icon;
              return (
                <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-400/30 bg-blue-500/10">
                  <div className="w-8 h-8 rounded flex items-center justify-center shrink-0 bg-blue-500/20 text-blue-500">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-blue-700/80 uppercase tracking-[0.18em]">
                      Site approach (chosen at start)
                    </p>
                    <p className="text-[12px] font-black text-blue-700 uppercase tracking-tight">
                      {opt.label}
                    </p>
                  </div>
                </div>
              );
            })()
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
                How will you take this site?
              </label>
              <div className="space-y-2">
                {BUILD_MODES.map((opt) => {
                  const Icon = opt.icon;
                  const active = buildMode === opt.mode;
                  return (
                    <button
                      key={opt.mode}
                      type="button"
                      onClick={() => setBuildMode(opt.mode)}
                      className={`w-full flex gap-3 p-3 rounded-lg border text-left transition-all ${
                        active
                          ? "bg-blue-500/15 border-blue-400/60 ring-1 ring-blue-400/40"
                          : "bg-slate-900/5 border-slate-900/10 hover:border-slate-900/20"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${
                          active
                            ? "bg-blue-500/20 text-blue-500"
                            : "bg-slate-900/5 text-slate-500"
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-[11px] font-black uppercase tracking-tight ${
                            active ? "text-blue-700" : "text-slate-800"
                          }`}
                        >
                          {opt.label}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                          {opt.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lease Term (move-in only) */}
          {buildMode === "move-in" && (
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
                Lease Term
              </label>
              <div className="grid grid-cols-2 gap-2">
                {LEASE_TERMS.map((t) => {
                  const active = leaseTerm === t.term;
                  return (
                    <button
                      key={t.term}
                      type="button"
                      onClick={() => setLeaseTerm(t.term)}
                      className={`p-3 rounded-lg border text-left transition-all ${
                        active
                          ? "bg-emerald-500/15 border-emerald-400/60 ring-1 ring-emerald-400/40"
                          : "bg-slate-900/5 border-slate-900/10 hover:border-slate-900/20"
                      }`}
                    >
                      <p
                        className={`text-[11px] font-black uppercase tracking-tight ${
                          active ? "text-emerald-700" : "text-slate-800"
                        }`}
                      >
                        {t.label}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5 leading-snug">
                        {t.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Zone at location */}
          {!zoneLoading && officialPlanZone && (
            <div className="text-[10px] text-slate-500">
              <span className="font-bold uppercase">Official Plan zone at this location:</span>{" "}
              {officialPlanZone}
            </div>
          )}

          {/* Zone Type */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
              Toronto Zoning Type (building use)
            </label>
            <select
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value as TorontoZoneCode)}
              className="w-full px-3 py-2.5 text-sm border border-slate-900/10 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 bg-slate-900/5 text-slate-800"
            >
              {categories.map((cat) => (
                <optgroup key={cat} label={cat}>
                  {TORONTO_ZONE_TYPES.filter((z) => z.category === cat).map(
                    (z) => (
                      <option key={z.code} value={z.code}>
                        {z.code} - {z.name}
                      </option>
                    )
                  )}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Zone compatibility warning */}
          {zoneWarning && (
            <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-400/20">
              <AlertTriangle className="shrink-0 text-amber-400" size={20} />
              <div>
                <p className="text-sm font-bold text-amber-300">Zone compatibility warning</p>
                <p className="text-xs text-amber-400/80 mt-0.5">{zoneWarning}</p>
              </div>
            </div>
          )}

          {/* Duration */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
              {activeMode.durationLabel}
            </label>
            <input
              type="number"
              min={1}
              max={1095}
              value={durationDays}
              onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2.5 text-sm border border-slate-900/10 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 bg-slate-900/5 text-slate-800"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">
              {buildMode === "move-in" ? "Move-In Start Date" : "Construction Start Date"}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-900/10 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 bg-slate-900/5 text-slate-800"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-700 border border-slate-900/10 rounded-lg hover:bg-slate-900/5 transition-colors uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors uppercase"
            >
              Place Building
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
