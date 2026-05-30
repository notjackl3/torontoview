"use client";

import { useMemo } from "react";
import { X, Car, AlertTriangle, Construction, Trash2, RefreshCw, Radio } from "lucide-react";
import {
  TrafficImpactResult,
  getLOSDescription,
} from "@/lib/trafficImpact";

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
      <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-400 w-8 text-right">{pct}%</span>
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
}: TrafficImpactPanelProps) {
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

  if (!visible) return null;

  const { buildings, totalDailyTrips, totalPeakHourTrips, congestedIntersections } =
    impactResult || { buildings: [], totalDailyTrips: 0, totalPeakHourTrips: 0, congestedIntersections: [] };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center">
            <Car className="text-white" size={14} />
          </div>
          <div>
            <h3 className="text-[10px] font-black text-white uppercase tracking-tight">
              Traffic Impact
            </h3>
            {/* Data source badge */}
            {useRealTrafficData ? (
              <span className="inline-flex items-center gap-1 px-1 py-0.5 text-[8px] font-bold rounded bg-green-600/30 border border-green-400/30 text-green-300">
                <Radio size={7} /> Live Data
              </span>
            ) : (
              <span className="inline-flex items-center px-1 py-0.5 text-[8px] font-bold rounded bg-zinc-600/30 border border-zinc-400/20 text-zinc-400">
                Estimated
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-3">
          {!impactResult ? (
            <div className="text-center py-8 text-zinc-500 text-sm">
              Place buildings with zoning types to see traffic impact analysis.
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
                        : "bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10"
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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isLoadingMapbox ? "animate-spin" : ""} />
                    {isLoadingMapbox ? "Loading..." : useRealTrafficData ? "Refresh Traffic Data" : "Fetch Live Data"}
                  </button>
                )}
              </div>

              {/* Mapbox data timestamp */}
              {mapboxDataTimestamp && useRealTrafficData && (
                <p className="text-[9px] text-zinc-500">
                  Last updated: {mapboxDataTimestamp.toLocaleTimeString()}
                </p>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">
                    Daily Trips
                  </div>
                  <div className="text-xl font-black text-zinc-100">
                    {totalDailyTrips.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">
                    Peak Hour
                  </div>
                  <div className="text-xl font-black text-zinc-100">
                    {totalPeakHourTrips.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">
                    Congested
                  </div>
                  <div className={`text-xl font-black ${congestedIntersections.length > 0 ? "text-red-400" : "text-green-400"}`}>
                    {congestedIntersections.length}
                  </div>
                  <div className="text-[9px] text-zinc-500">intersections</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="text-[10px] font-bold text-zinc-500 uppercase">
                    Barricades
                  </div>
                  <div className={`text-xl font-black ${barricadeList.length > 0 ? "text-red-400" : "text-zinc-400"}`}>
                    {barricadeList.length}
                  </div>
                  <div className="text-[9px] text-zinc-500">road blocks</div>
                </div>
              </div>

              {/* Barricaded roads list */}
              {barricadeList.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-2">
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
                <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-2">
                  Trip Generation by Building
                </h4>
                <div className="space-y-2">
                  {buildings.map((b) => (
                    <div
                      key={b.buildingId}
                      className="bg-white/5 rounded-lg p-3 border border-white/10"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-zinc-200">
                          {b.iteRate.label}
                        </span>
                        <span className="text-[10px] text-zinc-400 bg-white/10 px-1.5 py-0.5 rounded">
                          {b.units}{" "}
                          {b.iteRate.unitType === "dwelling_unit"
                            ? "units"
                            : b.iteRate.unitType === "1000_sqft"
                              ? "k sqft"
                              : b.iteRate.unitType}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">
                          <span className="font-bold text-zinc-200">{b.dailyTrips}</span> daily
                          {" / "}
                          <span className="font-bold text-orange-400">{b.peakHourTrips}</span> peak hr
                        </span>
                        <span className="text-zinc-500">
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
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-2">
                    Most Impacted Road Segments
                  </h4>
                  <div className="space-y-2">
                    {sortedEdges.map((edge) => (
                      <div
                        key={edge.edgeId}
                        className="bg-white/5 rounded-lg p-3 border border-white/10"
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-zinc-200 truncate max-w-[200px]">
                            {edge.edgeName || `Segment ${edge.edgeId.slice(4, 16)}`}
                          </span>
                          <LOSBadge los={edge.los} />
                        </div>
                        <CongestionBar level={edge.level} />
                        <div className="flex items-center justify-between mt-1.5 text-[10px]">
                          <span className="text-zinc-400">
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
