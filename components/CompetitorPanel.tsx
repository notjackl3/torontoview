"use client";

import { useEffect, useMemo, useState } from "react";
import { Store, MapPin, X, Search } from "lucide-react";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
}

interface Business {
  name: string;
  cat: string; // OSM amenity= or shop= tag
  lat: number;
  lng: number;
  addr: string;
}

export interface CompetitorMarker {
  name: string;
  cat: string;
  lat: number;
  lng: number;
}

interface CompetitorPanelProps {
  visible: boolean;
  onClose: () => void;
  buildings: PlacedBuilding[];
  radius: number; // meters
  onRadiusChange: (r: number) => void;
  /** Fires whenever the currently-filtered competitor set changes so the map
   *  can pin them. Caller is expected to render markers; on panel close we
   *  emit [] so the markers disappear. */
  onMarkersChange?: (markers: CompetitorMarker[]) => void;
}

// Category groupings: each label maps to a set of OSM tags that count as
// "competitors of this kind". The user picks the group their planned business
// belongs to; we count anything within that group inside the radius.
const CATEGORY_GROUPS: { label: string; tags: string[] }[] = [
  { label: "Restaurant", tags: ["restaurant", "food_court"] },
  { label: "Cafe", tags: ["cafe", "bakery", "ice_cream"] },
  { label: "Fast food", tags: ["fast_food"] },
  { label: "Bar / Pub", tags: ["bar", "pub", "biergarten", "nightclub"] },
  { label: "Convenience", tags: ["convenience", "kiosk", "newsagent"] },
  { label: "Supermarket", tags: ["supermarket", "greengrocer", "butcher"] },
  { label: "Clothing", tags: ["clothes", "shoes", "jewelry", "boutique"] },
  { label: "Beauty / Hair", tags: ["hairdresser", "beauty", "cosmetics"] },
  { label: "Electronics", tags: ["mobile_phone", "electronics", "computer"] },
  { label: "Pharmacy", tags: ["pharmacy", "optician"] },
];

function metersBetween(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  // Equirectangular approximation — accurate enough at neighbourhood scale.
  const R = 6371000;
  const lat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dx = (bLng - aLng) * (Math.PI / 180) * Math.cos(lat) * R;
  const dy = (bLat - aLat) * (Math.PI / 180) * R;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function CompetitorPanel({
  visible,
  onClose,
  buildings,
  radius,
  onRadiusChange,
  onMarkersChange,
}: CompetitorPanelProps) {
  const [data, setData] = useState<Business[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupIdx, setGroupIdx] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (data) return;
    let cancelled = false;
    fetch("/map-data/businesses.json", { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => {
        if (!cancelled) setData(j as Business[]);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [visible, data]);

  const anchor = buildings[buildings.length - 1];

  const result = useMemo(() => {
    if (!data || !anchor) return null;
    const allowed = new Set(CATEGORY_GROUPS[groupIdx].tags);
    const nearby = data
      .filter((b) => allowed.has(b.cat))
      .map((b) => ({
        ...b,
        distance: metersBetween(anchor.lat, anchor.lng, b.lat, b.lng),
      }))
      .filter((b) => b.distance <= radius)
      .sort((a, b) => a.distance - b.distance);

    // Saturation: density per km² of competitors in this group inside the
    // radius. Rough thresholds: <20 = sparse, 20–80 = healthy, >80 = saturated.
    const areaKm2 = (Math.PI * radius * radius) / 1_000_000;
    const density = nearby.length / areaKm2;
    const saturation =
      density < 20
        ? { label: "Sparse", color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-300" }
        : density < 80
          ? { label: "Healthy", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-300" }
          : { label: "Saturated", color: "text-red-600", bg: "bg-red-50", border: "border-red-300" };

    return { nearby, density, saturation };
  }, [data, anchor, groupIdx, radius]);

  // Push the current visible competitor set up to the parent so the map can
  // pin them. When the panel closes (or has no anchor), emit [] so the
  // markers disappear.
  useEffect(() => {
    if (!onMarkersChange) return;
    if (!visible || !result) {
      onMarkersChange([]);
      return;
    }
    onMarkersChange(
      result.nearby.map((b) => ({
        name: b.name,
        cat: b.cat,
        lat: b.lat,
        lng: b.lng,
      })),
    );
  }, [visible, result, onMarkersChange]);

  useAskScopeData(
    visible
      ? {
          id: "competitor",
          title: "Competitor Analysis",
          data: {
            category: CATEGORY_GROUPS[groupIdx].label,
            categoryTags: CATEGORY_GROUPS[groupIdx].tags,
            radiusM: radius,
            count: result?.nearby.length ?? 0,
            densityPerKm2: result ? Number(result.density.toFixed(1)) : null,
            saturation: result?.saturation.label ?? "unknown",
            nearest: (result?.nearby ?? []).slice(0, 5).map((b) => ({
              name: b.name,
              cat: b.cat,
              distanceM: Math.round(b.distance),
              addr: b.addr,
            })),
            anchorLat: anchor?.lat ?? null,
            anchorLng: anchor?.lng ?? null,
          },
        }
      : null,
  );

  if (!visible) return null;

  return (
    <div data-ask-scope="competitor" data-ask-title="Competitor Analysis" className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Store className="text-indigo-500" size={20} />
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
            Competitor Analysis
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-900/8 rounded"
          aria-label="Close competitor panel"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      <p className="text-[10px] text-slate-500 mb-3">
        Source: OpenStreetMap downtown businesses (~2k tagged). Move your placed
        building to test different sites.
      </p>

      {error && (
        <p className="text-[11px] text-red-600 mb-3">
          Couldn&rsquo;t load businesses: {error}
        </p>
      )}

      {!anchor ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-50 p-3">
          <p className="text-[11px] text-amber-900">
            <MapPin size={12} className="inline mr-1" />
            Place a building first to scan for nearby competitors.
          </p>
        </div>
      ) : !data ? (
        <p className="text-[11px] text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-3">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wide block mb-1">
              Business category
            </label>
            <select
              value={groupIdx}
              onChange={(e) => setGroupIdx(parseInt(e.target.value, 10))}
              className="w-full px-2 py-1.5 text-[11px] bg-white border border-slate-900/15 rounded font-medium text-slate-800"
            >
              {CATEGORY_GROUPS.map((g, i) => (
                <option key={g.label} value={i}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-3">
            <label className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              <span>Catchment radius</span>
              <span className="text-slate-700">{radius} m</span>
            </label>
            <input
              type="range"
              min={100}
              max={1500}
              step={50}
              value={radius}
              onChange={(e) => onRadiusChange(parseInt(e.target.value, 10))}
              className="w-full accent-indigo-500"
            />
          </div>

          {result && (
            <>
              <div
                className={`mb-3 px-3 py-2 rounded-md border ${result.saturation.bg} ${result.saturation.border}`}
              >
                <div className="flex items-baseline justify-between">
                  <p
                    className={`text-[9px] font-bold ${result.saturation.color} uppercase tracking-wide`}
                  >
                    Market: {result.saturation.label}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    {result.density.toFixed(0)} / km²
                  </p>
                </div>
                <p className="text-lg font-black text-slate-900 mt-0.5">
                  {result.nearby.length} competitor
                  {result.nearby.length === 1 ? "" : "s"} within {radius}m
                </p>
              </div>

              <div className="flex flex-col flex-1 min-h-0">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Search size={11} />
                  <span>Nearest competitors</span>
                </p>
                {result.nearby.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No tagged competitors in this group within {radius}m — good
                    sign for an opening, or a category OSM hasn&rsquo;t mapped
                    yet.
                  </p>
                ) : (
                  <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                    {result.nearby.slice(0, 30).map((b, i) => (
                      <li
                        key={`${b.name}-${i}`}
                        className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-900/[0.03] border border-slate-900/10"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-slate-900 truncate">
                            {b.name}
                          </p>
                          <p className="text-[9px] text-slate-500 truncate">
                            {b.cat}
                            {b.addr ? ` · ${b.addr}` : ""}
                          </p>
                        </div>
                        <span className="ml-2 text-[10px] font-mono text-slate-600 tabular-nums">
                          {Math.round(b.distance)}m
                        </span>
                      </li>
                    ))}
                    {result.nearby.length > 30 && (
                      <li className="text-[10px] text-slate-500 px-2 py-1">
                        +{result.nearby.length - 30} more
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
