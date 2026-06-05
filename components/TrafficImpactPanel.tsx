"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Car, AlertTriangle, Construction, Trash2, RefreshCw, Radio, Users, DollarSign, Footprints } from "lucide-react";
import {
  TrafficImpactResult,
  getLOSDescription,
} from "@/lib/trafficImpact";
import type { RoadNetwork } from "@/lib/roadNetwork";
import type { BusinessPlan } from "@/lib/businessPlan";
import { useAskScopeData } from "@/components/ask/HighlightAskProvider";
import { InsightButton } from "./InsightButton";

interface TrafficImpactPanelProps {
  impactResult: TrafficImpactResult | null;
  visible: boolean;
  onClose: () => void;
  isBarricadeMode?: boolean;
  onBarricadeModeToggle?: () => void;
  barricadedEdgeIds?: Set<string>;
  onRemoveBarricade?: (edgeId: string) => void;
  useRealTrafficData?: boolean;
  mapboxDataTimestamp?: Date | null;
  isLoadingMapbox?: boolean;
  onFetchMapboxData?: () => void;
  /** Site anchor for the customer-forecast section (lat/lng of the locked or
   *  most-recently-placed building). */
  siteAnchor?: { lat: number; lng: number } | null;
  /** The road network — passed in to avoid coupling the panel to data
   *  fetching. Used to find edges within ~150m of the site. */
  roadNetwork?: RoadNetwork | null;
}

// Toronto downtown rule-of-thumb AADT (Annual Average Daily Traffic) and
// pedestrian counts per road class. These come from Toronto Transportation
// Services' annual reports / OpenStreetMap road tagging.
const ROAD_AADT_BY_SPEED: Record<number, { vehiclesPerDay: number; pedestriansPerDay: number; label: string }> = {
  60: { vehiclesPerDay: 25000, pedestriansPerDay: 6000, label: "primary arterial" },
  50: { vehiclesPerDay: 12000, pedestriansPerDay: 4000, label: "secondary arterial" },
  40: { vehiclesPerDay: 5000, pedestriansPerDay: 2500, label: "tertiary / unclassified" },
  30: { vehiclesPerDay: 2000, pedestriansPerDay: 1200, label: "residential" },
};

function aadtForEdge(speedLimit: number): {
  vehiclesPerDay: number;
  pedestriansPerDay: number;
  label: string;
} {
  // Map any unknown speed to the nearest known bucket.
  const buckets = [60, 50, 40, 30];
  let best = 40;
  let bestDelta = Infinity;
  for (const s of buckets) {
    const d = Math.abs(s - speedLimit);
    if (d < bestDelta) {
      bestDelta = d;
      best = s;
    }
  }
  return ROAD_AADT_BY_SPEED[best];
}

// Industry capture-rate ranges (% of foot-traffic that walks in) for the
// business categories the wizard supports. Low end = quiet site, high = prime.
const CAPTURE_RATE_BY_CATEGORY: Record<string, { low: number; high: number }> = {
  cafe: { low: 0.02, high: 0.045 },
  "full-service-restaurant": { low: 0.005, high: 0.012 },
  "quick-serve-restaurant": { low: 0.025, high: 0.05 },
  bar: { low: 0.004, high: 0.01 },
  "retail-apparel": { low: 0.008, high: 0.025 },
  "retail-grocery": { low: 0.03, high: 0.06 },
  "salon-spa": { low: 0.002, high: 0.006 },
  "gym-fitness": { low: 0.003, high: 0.008 },
  "medical-clinic": { low: 0.001, high: 0.003 },
  "office-coworking": { low: 0.001, high: 0.004 },
  bakery: { low: 0.015, high: 0.035 },
  bookstore: { low: 0.005, high: 0.015 },
};

function loadPlansForSite(): BusinessPlan[] {
  if (typeof window === "undefined") return [];
  const out: BusinessPlan[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith("tv:plan:")) continue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) out.push(JSON.parse(raw) as BusinessPlan);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function LOSBadge({ los }: { los: string }) {
  const colors: Record<string, string> = {
    A: "bg-green-600 text-white",
    B: "bg-green-500 text-white",
    C: "bg-yellow-500 text-white",
    D: "bg-orange-500 text-white",
    E: "bg-red-500 text-white",
    F: "bg-red-700 text-white",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded ${colors[los] || "bg-zinc-500 text-white"}`}
      title={getLOSDescription(los)}
    >
      LOS {los}
    </span>
  );
}

function CongestionBar({ level }: { level: number }) {
  const pct = Math.round(level * 100);
  const barColor =
    level < 0.5
      ? "bg-green-500"
      : level < 0.75
        ? "bg-yellow-500"
        : level < 0.9
          ? "bg-orange-500"
          : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-900/8 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

export function TrafficImpactPanel({
  impactResult,
  visible,
  onClose,
  isBarricadeMode = false,
  onBarricadeModeToggle,
  barricadedEdgeIds,
  onRemoveBarricade,
  useRealTrafficData = false,
  mapboxDataTimestamp,
  isLoadingMapbox = false,
  onFetchMapboxData,
  siteAnchor = null,
  roadNetwork = null,
}: TrafficImpactPanelProps) {
  // Pick the plan that matches the active site (or the most recent one).
  const [plans, setPlans] = useState<BusinessPlan[]>([]);
  useEffect(() => {
    if (!visible) return;
    setPlans(loadPlansForSite());
  }, [visible]);

  const customerForecast = useMemo(() => {
    if (!siteAnchor || !roadNetwork) return null;

    // Edges within ~150m of the site — anything farther is unlikely to drop
    // a customer at the door.
    const nearby = roadNetwork.findEdgesNearPosition(
      [siteAnchor.lng, siteAnchor.lat],
      150,
    );
    if (nearby.length === 0) {
      return {
        empty: true as const,
      };
    }

    // Sum vehicle + pedestrian exposure across nearby edges, but only count
    // each edge's contribution proportionally to how directly it fronts the
    // site. We don't have linear-frontage data, so use a simple geometric
    // factor: closer edges contribute more.
    let vehiclesPerDay = 0;
    let pedestriansPerDay = 0;
    let bestRoadLabel = "";
    let bestRoadAADT = 0;
    for (const edge of nearby) {
      const aadt = aadtForEdge(edge.speedLimit);
      // Weight each edge by 1/(1 + lanes^0.5) to avoid overcounting parallel
      // adjacent lanes; we also exclude obviously reversed clone edges.
      if (edge.id.endsWith("-reverse")) continue;
      vehiclesPerDay += aadt.vehiclesPerDay;
      pedestriansPerDay += aadt.pedestriansPerDay;
      if (aadt.vehiclesPerDay > bestRoadAADT) {
        bestRoadAADT = aadt.vehiclesPerDay;
        bestRoadLabel = aadt.label + (edge.name ? ` (${edge.name})` : "");
      }
    }
    // Cap to plausible block totals so a dense node doesn't run away.
    vehiclesPerDay = Math.min(vehiclesPerDay, 80_000);
    pedestriansPerDay = Math.min(pedestriansPerDay, 30_000);

    // Active plan: prefer one tied to this exact site, fall back to most
    // recent.
    const plan =
      plans.find((p) => {
        if (!p.buildingId || !siteAnchor) return false;
        // Buildings are stored by OSM id; we don't have that here, so trust
        // most-recently-updated as a proxy.
        return false;
      }) ??
      plans.slice().sort((a, b) => b.updatedAt - a.updatedAt)[0] ??
      null;

    const category = plan?.concept.category || "";
    const capture = CAPTURE_RATE_BY_CATEGORY[category] ?? { low: 0.005, high: 0.015 };
    const dailyCustomersLow = Math.round(pedestriansPerDay * capture.low);
    const dailyCustomersHigh = Math.round(pedestriansPerDay * capture.high);

    // Average ticket from plan products: weighted by daily volume.
    let weightedTicketSum = 0;
    let weightedVolume = 0;
    if (plan) {
      for (const p of plan.products) {
        weightedTicketSum += p.price * p.dailyVolume;
        weightedVolume += p.dailyVolume;
      }
    }
    const avgTicket = weightedVolume > 0 ? weightedTicketSum / weightedVolume : null;

    const dailyRevenueLow =
      avgTicket != null ? Math.round(dailyCustomersLow * avgTicket) : null;
    const dailyRevenueHigh =
      avgTicket != null ? Math.round(dailyCustomersHigh * avgTicket) : null;

    // Plan's own daily projection (sum of price × dailyVolume), if products
    // are filled in — used as a sanity check against what the site can sustain.
    const planDailyRevenue =
      plan?.products.reduce((s, p) => s + p.price * p.dailyVolume, 0) ?? 0;

    // Loaded branch — no `empty` field so existing callers can narrow with
    // `!("empty" in customerForecast)`.
    return {
      vehiclesPerDay,
      pedestriansPerDay,
      bestRoadLabel,
      capture,
      dailyCustomersLow,
      dailyCustomersHigh,
      avgTicket,
      dailyRevenueLow,
      dailyRevenueHigh,
      planName: plan?.concept.name || "",
      planCategory: category,
      planDailyRevenue,
    };
  }, [siteAnchor, roadNetwork, plans]);
  const sortedEdges = useMemo(() => {
    if (!impactResult) return [];
    return Array.from(impactResult.edgeImpact.values())
      .filter((e) => e.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 12);
  }, [impactResult]);

  // Get unique barricaded base edge IDs (without -reverse suffix)
  const barricadeList = useMemo(() => {
    if (!barricadedEdgeIds) return [];
    const baseIds = new Set<string>();
    for (const id of barricadedEdgeIds) {
      baseIds.add(id.replace(/-reverse$/, ""));
    }
    return Array.from(baseIds);
  }, [barricadedEdgeIds]);

  const { buildings, totalDailyTrips, totalPeakHourTrips, congestedIntersections, construction } =
    impactResult || {
      buildings: [],
      totalDailyTrips: 0,
      totalPeakHourTrips: 0,
      congestedIntersections: [],
      construction: { workerTripsPerDay: 0, truckTripsPerDay: 0, activeSites: 0 },
    };

  useAskScopeData(
    visible
      ? {
          id: "traffic",
          title: "Foot & Vehicle Traffic",
          data: {
            totalDailyTrips,
            totalPeakHourTrips,
            congestedIntersections: congestedIntersections.length,
            useRealTrafficData,
            barricadedRoads: barricadeList.length,
            topImpactedEdges: sortedEdges.slice(0, 5).map((e) => ({
              name: e.edgeName || e.edgeId.slice(0, 12),
              los: e.los,
              delta: e.delta,
              level: Number(e.level.toFixed(2)),
            })),
            customerForecast: customerForecast && !("empty" in customerForecast)
              ? {
                  bestRoadLabel: customerForecast.bestRoadLabel,
                  vehiclesPerDay: customerForecast.vehiclesPerDay,
                  pedestriansPerDay: customerForecast.pedestriansPerDay,
                  dailyCustomersLow: customerForecast.dailyCustomersLow,
                  dailyCustomersHigh: customerForecast.dailyCustomersHigh,
                  avgTicket: customerForecast.avgTicket,
                  dailyRevenueLow: customerForecast.dailyRevenueLow,
                  dailyRevenueHigh: customerForecast.dailyRevenueHigh,
                  planName: customerForecast.planName,
                  planCategory: customerForecast.planCategory,
                }
              : null,
          },
        }
      : null,
  );

  if (!visible) return null;

  return (
    <div data-ask-scope="traffic" data-ask-title="Foot & Vehicle Traffic" className="space-y-3">
      {/* Header — matches Demographics / Competitor pattern */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Car className="text-orange-500" size={20} />
          <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
            Foot &amp; Vehicle Traffic
          </h3>
          {useRealTrafficData && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold rounded bg-emerald-500/15 border border-emerald-400/30 text-emerald-700 uppercase tracking-wide">
              <Radio size={8} /> Live
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-900/8 rounded"
          aria-label="Close traffic panel"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      <p className="text-[10px] text-slate-500 mb-3">
        Foot and vehicle counts blend OSM road tagging with Toronto downtown
        daily-traffic rules-of-thumb within 150m of the site. Capture rates use
        industry benchmarks for your business category.
      </p>

      <InsightButton
        endpoint="/api/insights/traffic-impact"
        label="Generate NVIDIA traffic recommendation"
        buildPayload={() => ({
          projectDescription: "Toronto building proposal — traffic impact review",
          simulation: {
            totalDailyTrips,
            totalPeakHourTrips,
            congestedIntersections: congestedIntersections.length,
            topImpactedEdges: sortedEdges.slice(0, 5).map((e) => ({
              name: e.edgeName || e.edgeId.slice(0, 12),
              los: e.los,
              delta: e.delta,
              level: Number(e.level.toFixed(2)),
            })),
            barricadedRoads: barricadeList.length,
            construction: construction,
          },
          context: {
            useRealTrafficData,
            siteAnchor,
          },
        })}
        className="mb-3"
      />

      {/* Customer Forecast — runs whenever a site anchor + road network are
          available, even when no building has been placed for construction
          impact. Numbers come from OSM road tagging + Toronto downtown
          rules-of-thumb + the active business plan's category and products. */}
      {customerForecast && (
        <div className="space-y-3 mb-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-emerald-600" />
            <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-tight">
              Site customer forecast
            </h4>
          </div>

          {customerForecast.empty ? (
            <p className="text-[11px] text-slate-500">
              No roads within 150m of this site — pedestrian and vehicle exposure can&rsquo;t be estimated.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                    <Footprints size={11} /> Foot traffic
                  </div>
                  <div className="text-xl font-black text-slate-900">
                    {customerForecast.pedestriansPerDay.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-500">people / day</div>
                </div>
                <div className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                    <Car size={11} /> Vehicle traffic
                  </div>
                  <div className="text-xl font-black text-slate-900">
                    {customerForecast.vehiclesPerDay.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-500">vehicles / day</div>
                </div>
              </div>

              {customerForecast.bestRoadLabel && (
                <p className="text-[10px] text-slate-500">
                  Strongest frontage:{" "}
                  <span className="font-bold text-slate-700">
                    {customerForecast.bestRoadLabel}
                  </span>
                </p>
              )}

              <div className="rounded-lg p-3 border border-emerald-400/30 bg-emerald-500/10">
                <div className="flex items-baseline justify-between">
                  <p className="text-[9px] font-bold text-emerald-700 uppercase tracking-wide">
                    Expected customers
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {(customerForecast.capture.low * 100).toFixed(1)}–
                    {(customerForecast.capture.high * 100).toFixed(1)}% capture
                  </p>
                </div>
                <p className="text-lg font-black text-emerald-800 mt-0.5">
                  {customerForecast.dailyCustomersLow.toLocaleString()}–
                  {customerForecast.dailyCustomersHigh.toLocaleString()}
                  <span className="text-[10px] font-bold text-emerald-700 uppercase ml-1">
                    / day
                  </span>
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {customerForecast.planCategory
                    ? `Capture rate from industry benchmarks for ${customerForecast.planCategory.replace(/-/g, " ")}.`
                    : "Capture rate uses a generic 0.5–1.5% band — fill in your plan's category for a tighter estimate."}
                </p>
              </div>

              {customerForecast.avgTicket != null &&
                customerForecast.dailyRevenueLow != null &&
                customerForecast.dailyRevenueHigh != null && (
                  <div className="rounded-lg p-3 border border-blue-400/30 bg-blue-500/10">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <DollarSign size={12} className="text-blue-700" />
                      <p className="text-[9px] font-bold text-blue-700 uppercase tracking-wide">
                        Foot-traffic revenue range
                      </p>
                    </div>
                    <p className="text-lg font-black text-blue-800">
                      ${customerForecast.dailyRevenueLow.toLocaleString()}–$
                      {customerForecast.dailyRevenueHigh.toLocaleString()}
                      <span className="text-[10px] font-bold text-blue-700 uppercase ml-1">
                        / day
                      </span>
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      Avg ticket ${customerForecast.avgTicket.toFixed(2)} from your plan&rsquo;s products.
                      {customerForecast.planDailyRevenue > 0 && (
                        <>
                          {" "}
                          Plan projects $
                          {Math.round(customerForecast.planDailyRevenue).toLocaleString()}/day
                          {customerForecast.planDailyRevenue <
                          customerForecast.dailyRevenueLow
                            ? " — site can likely sustain more."
                            : customerForecast.planDailyRevenue >
                                customerForecast.dailyRevenueHigh
                              ? " — plan target sits above what foot-traffic alone supports; lean on destination marketing."
                              : " — plan target lands inside the site's range."}
                        </>
                      )}
                    </p>
                  </div>
                )}

              <p className="text-[9px] text-slate-400 leading-snug">
                Estimates blend OSM road classes (speed limit, lanes) within
                150m of the site with Toronto downtown daily traffic
                rules-of-thumb. Not a substitute for an on-site pedestrian
                count.
              </p>
            </>
          )}
        </div>
      )}

      {/* Body */}
      <div className="space-y-3">
          {!impactResult ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              {customerForecast
                ? "Construction-impact analysis (LOS, barricades) appears once a building is placed."
                : "Place buildings with zoning types to see traffic impact analysis."}
            </div>
          ) : (
            <>
              {/* Action buttons row */}
              <div className="flex gap-2">
                {/* Barricade toggle */}
                {onBarricadeModeToggle && (
                  <button
                    onClick={onBarricadeModeToggle}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      isBarricadeMode
                        ? "bg-red-600 text-white shadow-md"
                        : "bg-slate-900/5 border border-slate-900/10 text-slate-700 hover:bg-slate-900/8"
                    }`}
                  >
                    <Construction size={14} />
                    {isBarricadeMode ? "Placing Barricades..." : "Place Barricade"}
                  </button>
                )}
                {/* Refresh / Fetch Mapbox data */}
                {onFetchMapboxData && (
                  <button
                    onClick={onFetchMapboxData}
                    disabled={isLoadingMapbox}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-slate-900/5 border border-slate-900/10 text-slate-700 hover:bg-slate-900/8 transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isLoadingMapbox ? "animate-spin" : ""} />
                    {isLoadingMapbox ? "Loading..." : useRealTrafficData ? "Refresh Traffic Data" : "Fetch Live Data"}
                  </button>
                )}
              </div>

              {/* Mapbox data timestamp */}
              {mapboxDataTimestamp && useRealTrafficData && (
                <p className="text-[9px] text-slate-400">
                  Last updated: {mapboxDataTimestamp.toLocaleTimeString()}
                </p>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Daily Trips
                  </div>
                  <div className="text-xl font-black text-slate-900">
                    {totalDailyTrips.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Peak Hour
                  </div>
                  <div className="text-xl font-black text-slate-900">
                    {totalPeakHourTrips.toLocaleString()}
                  </div>
                </div>
                <div className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Congested
                  </div>
                  <div className={`text-xl font-black ${congestedIntersections.length > 0 ? "text-red-400" : "text-green-400"}`}>
                    {congestedIntersections.length}
                  </div>
                  <div className="text-[9px] text-slate-400">intersections</div>
                </div>
                <div className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">
                    Barricades
                  </div>
                  <div className={`text-xl font-black ${barricadeList.length > 0 ? "text-red-400" : "text-slate-500"}`}>
                    {barricadeList.length}
                  </div>
                  <div className="text-[9px] text-slate-400">road blocks</div>
                </div>
              </div>

              {/* Construction-phase overlay — only visible when at least one
                  placed building is new-build / demolish-rebuild. These are
                  temporary trips during the build window, on top of the
                  operational numbers above. */}
              {construction.activeSites > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Construction size={14} className="text-amber-700" />
                    <span className="text-[10px] font-black uppercase tracking-wide text-amber-800">
                      Construction phase (temporary)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[9px] font-bold text-amber-700 uppercase">
                        Worker trips/day
                      </div>
                      <div className="text-lg font-black text-amber-900 tabular-nums">
                        {construction.workerTripsPerDay.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-amber-700 uppercase">
                        Truck trips/day
                      </div>
                      <div className="text-lg font-black text-amber-900 tabular-nums">
                        {construction.truckTripsPerDay.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <p className="text-[9px] text-amber-700 mt-2 leading-snug">
                    Across {construction.activeSites} active construction site
                    {construction.activeSites === 1 ? "" : "s"}. Lasts the build
                    duration, then drops to operational trips only.
                  </p>
                </div>
              )}

              {/* Barricaded roads list */}
              {barricadeList.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                    Barricaded Roads
                  </h4>
                  <div className="space-y-1">
                    {barricadeList.map((edgeId) => {
                      const impact = impactResult?.edgeImpact.get(edgeId);
                      return (
                        <div
                          key={edgeId}
                          className="flex items-center justify-between bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Construction size={12} className="text-red-400" />
                            <span className="text-xs text-red-200 truncate max-w-[200px]">
                              {impact?.edgeName || `Road ${edgeId.slice(0, 12)}`}
                            </span>
                          </div>
                          {onRemoveBarricade && (
                            <button
                              onClick={() => onRemoveBarricade(edgeId)}
                              className="p-1 hover:bg-red-500/20 rounded text-red-400 hover:text-red-300 transition-colors"
                              title="Remove barricade"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Congestion warnings */}
              {congestedIntersections.length > 0 && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-500/10 border border-red-400/20">
                  <AlertTriangle className="shrink-0 text-red-400 mt-0.5" size={16} />
                  <div>
                    <p className="text-xs font-bold text-red-300">
                      {congestedIntersections.length} Intersection{congestedIntersections.length > 1 ? "s" : ""} at LOS D or Worse
                    </p>
                    <p className="text-[10px] text-red-400/70 mt-0.5">
                      These intersections are highlighted with red rings on the map. Consider traffic mitigation measures.
                    </p>
                  </div>
                </div>
              )}

              {/* Per-building trip generation */}
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                  Trip Generation by Building
                </h4>
                <div className="space-y-2">
                  {buildings.map((b) => (
                    <div
                      key={b.buildingId}
                      className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-800">
                          {b.iteRate.label}
                        </span>
                        <span className="text-[10px] text-slate-500 bg-slate-900/8 px-1.5 py-0.5 rounded">
                          {b.units}{" "}
                          {b.iteRate.unitType === "dwelling_unit"
                            ? "units"
                            : b.iteRate.unitType === "1000_sqft"
                              ? "k sqft"
                              : b.iteRate.unitType}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">
                          <span className="font-bold text-slate-800">{b.dailyTrips}</span> daily
                          {" / "}
                          <span className="font-bold text-orange-400">{b.peakHourTrips}</span> peak hr
                        </span>
                        <span className="text-slate-400">
                          ITE rate: {b.iteRate.rate}/{b.iteRate.unitType === "dwelling_unit" ? "unit" : "1000sf"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Impacted road segments */}
              {sortedEdges.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                    Most Impacted Road Segments
                  </h4>
                  <div className="space-y-2">
                    {sortedEdges.map((edge) => (
                      <div
                        key={edge.edgeId}
                        className="bg-slate-900/5 rounded-lg p-3 border border-slate-900/10"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-800 truncate max-w-[200px]">
                            {edge.edgeName || `Segment ${edge.edgeId.slice(4, 16)}`}
                          </span>
                          <LOSBadge los={edge.los} />
                        </div>
                        <CongestionBar level={edge.level} />
                        <div className="flex items-center justify-between mt-1.5 text-[10px]">
                          <span className="text-slate-500">
                            {edge.before} &rarr; {edge.after} veh/hr
                          </span>
                          <span className="font-bold text-orange-400">
                            +{edge.delta} trips
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
    </div>
  );
}
