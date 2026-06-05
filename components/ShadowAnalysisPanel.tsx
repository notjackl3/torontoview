"use client";

import { useState } from "react";
import {
  Sun,
  Calendar,
  AlertTriangle,
  Eye,
  EyeOff,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  type ShadowAnalysisSummary,
  type BuildingShadowImpact,
  SEASON_PRESETS,
  dayOfYearToLabel,
} from "@/lib/sun/shadowAnalysis";
import type { BuildMode } from "@/lib/buildMode";
import { InsightButton } from "./InsightButton";

interface ShadowAnalysisPanelProps {
  /** Whether shadow analysis mode is enabled */
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Current analysis results (null if not yet computed) */
  results: ShadowAnalysisSummary | null;
  /** Whether analysis is currently running */
  isAnalyzing: boolean;
  /** Trigger a new analysis */
  onRunAnalysis: (dayOfYear: number) => void;
  /** Day of year for analysis */
  dayOfYear: number;
  onDayOfYearChange: (day: number) => void;
  /** Before/after toggle */
  showProposedBuilding: boolean;
  onToggleProposedBuilding: (show: boolean) => void;
  /** Shadow overlay toggle */
  showShadowOverlay: boolean;
  onToggleShadowOverlay: (show: boolean) => void;
  /** Whether there are placed buildings to analyze */
  hasPlacedBuildings: boolean;
  /**
   * Build modes of the placed buildings on the parcel. Shadow analysis is
   * only meaningful for new massing — move-in inherits the existing
   * building's shadow, so we render a banner instead of running the analysis
   * when every placed building is a move-in.
   */
  placedBuildModes?: BuildMode[];
}

export default function ShadowAnalysisPanel({
  isEnabled,
  onToggle,
  results,
  isAnalyzing,
  onRunAnalysis,
  dayOfYear,
  onDayOfYearChange,
  showProposedBuilding,
  onToggleProposedBuilding,
  showShadowOverlay,
  onToggleShadowOverlay,
  hasPlacedBuildings,
  placedBuildModes,
}: ShadowAnalysisPanelProps) {
  const [showDetails, setShowDetails] = useState(false);

  const allMoveIn =
    hasPlacedBuildings &&
    !!placedBuildModes &&
    placedBuildModes.length > 0 &&
    placedBuildModes.every((m) => m === "move-in");

  return (
    <div className="space-y-3">
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <h3 className="ui-label">Shadow Analysis</h3>
        <button
          onClick={() => onToggle(!isEnabled)}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            isEnabled ? "bg-amber-500" : "bg-slate-900/12"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
              isEnabled ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {isEnabled && allMoveIn && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-1">
            No new shadow
          </p>
          <p className="text-[10px] text-emerald-900/80 leading-relaxed">
            You&rsquo;re moving into an existing building, so the massing — and
            its shadow on neighbours — doesn&rsquo;t change. Shadow analysis is
            only meaningful for new-build or demolish-and-rebuild projects.
          </p>
        </div>
      )}

      {isEnabled && !allMoveIn && (
        <div className="rounded-md p-3 border border-slate-900/10 bg-slate-900/5 space-y-3">
          {/* Date / Season Picker */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar size={11} className="text-slate-500" />
              <span className="text-[9px] text-slate-500 font-bold uppercase">
                Date (Season)
              </span>
            </div>

            {/* Season preset buttons */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {SEASON_PRESETS.map((preset) => {
                const isActive = Math.abs(dayOfYear - preset.dayOfYear) < 5;
                return (
                  <button
                    key={preset.dayOfYear}
                    onClick={() => onDayOfYearChange(preset.dayOfYear)}
                    className={`py-1 px-2 rounded text-[9px] font-bold transition-all ${
                      isActive
                        ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                        : "bg-slate-900/5 text-slate-500 border border-transparent hover:bg-slate-900/8 hover:text-slate-800"
                    }`}
                  >
                    {preset.label.split("(")[0].trim()}
                  </button>
                );
              })}
            </div>

            {/* Date slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-slate-400">Day of Year</span>
                <span className="text-[10px] font-bold text-slate-800 font-mono">
                  {dayOfYearToLabel(dayOfYear)}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="365"
                step="1"
                value={dayOfYear}
                onChange={(e) => onDayOfYearChange(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-900/8 rounded-full appearance-none cursor-pointer accent-amber-400 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-300 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
              />
              <div className="flex justify-between text-[8px] text-slate-300 mt-0.5">
                <span>Jan</span>
                <span>Apr</span>
                <span>Jul</span>
                <span>Oct</span>
                <span>Dec</span>
              </div>
            </div>
          </div>

          {/* Before/After Toggle */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-900/8">
            <div className="flex items-center gap-1.5">
              {showProposedBuilding ? (
                <Eye size={11} className="text-blue-400" />
              ) : (
                <EyeOff size={11} className="text-slate-500" />
              )}
              <span className="text-[10px] font-bold text-slate-700">
                {showProposedBuilding ? "With Proposed" : "Without Proposed"}
              </span>
            </div>
            <button
              onClick={() => onToggleProposedBuilding(!showProposedBuilding)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showProposedBuilding ? "bg-blue-500" : "bg-slate-900/12"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  showProposedBuilding ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>

          {/* Shadow Overlay Toggle */}
          <div className="flex items-center justify-between border-t border-slate-900/8 pt-1">
            <div className="flex items-center gap-1.5">
              <BarChart3 size={11} className="text-amber-400" />
              <span className="text-[10px] font-bold text-slate-700">
                Shadow Heatmap
              </span>
            </div>
            <button
              onClick={() => onToggleShadowOverlay(!showShadowOverlay)}
              disabled={!results}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                showShadowOverlay ? "bg-amber-500" : "bg-slate-900/12"
              } ${!results ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  showShadowOverlay ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>

          {/* Run Analysis Button */}
          <button
            onClick={() => onRunAnalysis(dayOfYear)}
            disabled={isAnalyzing || !hasPlacedBuildings}
            className={`w-full py-2 rounded-md text-[11px] font-bold uppercase tracking-wide transition-all ${
              isAnalyzing
                ? "bg-amber-500/20 text-amber-300 cursor-wait"
                : !hasPlacedBuildings
                  ? "bg-slate-900/5 text-slate-400 cursor-not-allowed"
                  : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-400/20 hover:border-amber-400/40"
            }`}
          >
            {isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                Analyzing shadows...
              </span>
            ) : !hasPlacedBuildings ? (
              "Place a building first"
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <Sun size={12} />
                Run Shadow Analysis
              </span>
            )}
          </button>

          {/* Results */}
          {results && (
            <div className="space-y-2 pt-1 border-t border-slate-900/8">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Results — {results.dateLabel}
              </div>

              <InsightButton
                endpoint="/api/insights/shadow-impact"
                label="Generate NVIDIA shadow recommendation"
                buildPayload={() => ({
                  projectDescription: "Toronto building proposal — shadow / daylight review",
                  simulation: {
                    dateLabel: results.dateLabel,
                    totalAffected: results.totalAffected,
                    severelyAffected: results.severelyAffected,
                    residentialUnitsAffected: results.residentialUnitsAffected,
                    topImpacts: results.impacts.slice(0, 10).map((impact) => ({
                      buildingId: impact.buildingId,
                      buildingType: impact.buildingType,
                      hoursLost: impact.hoursLost,
                      baselineSunHours: impact.baselineSunHours,
                      isResidential: impact.isResidential,
                    })),
                  },
                  context: {
                    dayOfYear,
                  },
                })}
              />

              {/* Summary stats */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/5 rounded p-2">
                  <div className="text-[18px] font-black text-amber-300">
                    {results.totalAffected}
                  </div>
                  <div className="text-[8px] text-slate-400 uppercase font-bold">
                    Buildings Affected
                  </div>
                </div>
                <div className="bg-slate-900/5 rounded p-2">
                  <div className="text-[18px] font-black text-red-400">
                    {results.severelyAffected}
                  </div>
                  <div className="text-[8px] text-slate-400 uppercase font-bold">
                    Losing &gt;2h Sun
                  </div>
                </div>
              </div>

              {/* Key stat */}
              {results.residentialUnitsAffected > 0 && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-400/20 rounded-md p-2">
                  <AlertTriangle
                    size={14}
                    className="text-red-400 flex-shrink-0 mt-0.5"
                  />
                  <div className="text-[10px] text-red-300">
                    <span className="font-black">
                      {results.residentialUnitsAffected} residential units
                    </span>{" "}
                    lose &gt;2 hours of direct sunlight
                  </div>
                </div>
              )}

              {results.totalAffected === 0 && (
                <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-400/20 rounded-md p-2">
                  <Sun
                    size={14}
                    className="text-emerald-400 flex-shrink-0 mt-0.5"
                  />
                  <div className="text-[10px] text-emerald-300">
                    No significant shadow impact detected.
                  </div>
                </div>
              )}

              {/* Detailed building list */}
              {results.impacts.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="flex items-center gap-1 text-[9px] font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase"
                  >
                    {showDetails ? (
                      <ChevronUp size={10} />
                    ) : (
                      <ChevronDown size={10} />
                    )}
                    {showDetails ? "Hide" : "Show"} Details (
                    {results.impacts.length})
                  </button>

                  {showDetails && (
                    <div className="mt-2 max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                      {results.impacts.slice(0, 20).map((impact) => (
                        <ImpactRow key={impact.buildingId} impact={impact} />
                      ))}
                      {results.impacts.length > 20 && (
                        <div className="text-[9px] text-slate-400 py-1">
                          +{results.impacts.length - 20} more buildings...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ImpactRow({ impact }: { impact: BuildingShadowImpact }) {
  const severityColor =
    impact.hoursLost > 3
      ? "text-red-400"
      : impact.hoursLost > 2
        ? "text-orange-400"
        : impact.hoursLost > 1
          ? "text-yellow-400"
          : "text-slate-500";

  const barWidth = Math.min(100, (impact.hoursLost / 6) * 100);

  return (
    <div className="flex items-center gap-2 py-1 px-1.5 rounded bg-slate-900/[0.04] hover:bg-slate-900/[0.07] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-mono text-slate-400 truncate max-w-[80px]">
            {impact.buildingId.slice(0, 12)}
          </span>
          {impact.isResidential && (
            <span className="text-[7px] bg-blue-500/20 text-blue-300 px-1 rounded font-bold">
              RES
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <div className="flex-1 h-1 bg-slate-900/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-500 to-red-500 rounded-full"
              style={{ width: `${barWidth}%` }}
            />
          </div>
        </div>
      </div>
      <div className={`text-[10px] font-black ${severityColor} w-12 text-right`}>
        -{impact.hoursLost}h
      </div>
    </div>
  );
}
