"use client";

import { useState, useEffect } from "react";
import { X, Building2, AlertTriangle, Pencil } from "lucide-react";
import Link from "next/link";
import { TORONTO_ZONE_TYPES, type TorontoZoneCode } from "@/lib/torontoZoning";
import {
  fetchZoneAtPoint,
  getZoneCompatibilityWarning,
} from "@/lib/zoneCompatibility";

export interface BuildingPlacementDetails {
  zoneType: TorontoZoneCode;
  startDate: string; // ISO date
  durationDays: number;
}

interface BuildingPlacementFormProps {
  lat: number;
  lng: number;
  onSubmit: (details: BuildingPlacementDetails) => void;
  onCancel: () => void;
}

const DEFAULT_DURATION_DAYS = 180;

export function BuildingPlacementForm({
  lat,
  lng,
  onSubmit,
  onCancel,
}: BuildingPlacementFormProps) {
  const [zoneType, setZoneType] = useState<TorontoZoneCode>("MU1");
  const [durationDays, setDurationDays] = useState(DEFAULT_DURATION_DAYS);
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [officialPlanZone, setOfficialPlanZone] = useState<string | null>(null);
  const [zoneLoading, setZoneLoading] = useState(true);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ zoneType, startDate, durationDays });
  };

  const categories = [...new Set(TORONTO_ZONE_TYPES.map((z) => z.category))];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="glass rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 glass border-b border-white/10 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-400" size={20} />
            <h2 className="text-base font-black text-zinc-100 uppercase tracking-tight">
              Building Details
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-zinc-200"
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
              <Pencil size={14} className="text-indigo-300" />
              <span className="text-[11px] font-bold text-indigo-200 uppercase tracking-tight">
                Design a Building First
              </span>
            </div>
            <span className="text-[10px] text-indigo-400 group-hover:text-indigo-300 transition-colors">
              Go to Build Mode →
            </span>
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Zone at location */}
          {!zoneLoading && officialPlanZone && (
            <div className="text-[10px] text-zinc-400">
              <span className="font-bold uppercase">Official Plan zone at this location:</span>{" "}
              {officialPlanZone}
            </div>
          )}

          {/* Zone Type */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-2">
              Toronto Zoning Type (building use)
            </label>
            <select
              value={zoneType}
              onChange={(e) => setZoneType(e.target.value as TorontoZoneCode)}
              className="w-full px-3 py-2.5 text-sm border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 bg-white/5 text-zinc-200"
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

          {/* Construction duration */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-2">
              Construction Duration (days)
            </label>
            <input
              type="number"
              min={1}
              max={1095}
              value={durationDays}
              onChange={(e) => setDurationDays(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2.5 text-sm border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 bg-white/5 text-zinc-200"
            />
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase mb-2">
              Construction Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-white/10 rounded-lg focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 bg-white/5 text-zinc-200"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-sm font-bold text-zinc-300 border border-white/10 rounded-lg hover:bg-white/5 transition-colors uppercase"
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
