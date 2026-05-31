"use client";

import { useState, useMemo } from "react";
import {
  X,
  Users,
  Building2,
  Sun,
  Volume2,
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type {
  StakeholderAnalysis,
  BuildingImpactResult,
  ImpactRadius,
  ImpactSeverity,
} from "@/lib/stakeholderImpact";

interface StakeholderImpactPanelProps {
  analysis: StakeholderAnalysis | null;
  visible: boolean;
  onClose: () => void;
  radius: ImpactRadius;
  onRadiusChange: (r: ImpactRadius) => void;
}

const SEVERITY_COLORS: Record<ImpactSeverity, string> = {
  none: "bg-zinc-500",
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-red-500",
};

function SeverityBadge({ severity }: { severity: ImpactSeverity }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${SEVERITY_COLORS[severity]} text-white`}
    >
      {severity}
    </span>
  );
}

function ImpactBar({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-500 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-900/8 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-700 font-mono w-8 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function BuildingRow({
  impact,
  expanded,
  onToggle,
}: {
  impact: BuildingImpactResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-slate-900/10 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-900/5 transition-colors"
      >
        {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
        <span className="flex-1 text-xs text-slate-800 truncate">
          {impact.type || "unknown"} &middot;{" "}
          {Math.round(impact.distanceMeters)}m
        </span>
        <SeverityBadge severity={impact.overallSeverity} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-slate-900/8 pt-2">
          <ImpactBar value={impact.shadowImpact} label="Shadow" color="bg-amber-500" />
          <ImpactBar value={impact.noiseImpact} label="Noise" color="bg-red-400" />
          <ImpactBar value={impact.viewObstruction} label="View" color="bg-blue-500" />
          <div className="text-[10px] text-slate-400 mt-1">
            Height: {impact.height.toFixed(1)}m &middot; ID: {impact.buildingId.slice(0, 12)}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StakeholderImpactPanel({
  analysis,
  visible,
  onClose,
  radius,
  onRadiusChange,
}: StakeholderImpactPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<ImpactSeverity | "all">("all");

  const filteredImpacts = useMemo(() => {
    if (!analysis) return [];
    if (filterSeverity === "all") return analysis.impacts.filter(i => i.overallSeverity !== "none");
    return analysis.impacts.filter((i) => i.overallSeverity === filterSeverity);
  }, [analysis, filterSeverity]);

  if (!visible) return null;

  const s = analysis?.summary;

  return (
    <div>
      {/* Header */}
      <div className="pb-3 mb-3 border-b border-slate-900/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="text-indigo-400" size={20} />
            <h3 className="font-bold text-white text-sm uppercase tracking-tight">
              Stakeholder Impact
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-900/8 rounded transition-colors text-slate-500 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">
          {s
            ? `${s.totalAffected} buildings within ${s.radiusMeters}m radius`
            : "Place a building to analyze impact"}
        </p>
      </div>

      {/* Radius selector */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-slate-400 font-medium">Radius:</span>
        {([100, 250, 500] as ImpactRadius[]).map((r) => (
          <button
            key={r}
            onClick={() => onRadiusChange(r)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
              radius === r
                ? "bg-indigo-600 text-white"
                : "bg-slate-900/5 text-slate-500 hover:bg-slate-900/8 hover:text-slate-800"
            }`}
          >
            {r}m
          </button>
        ))}
      </div>

      {!analysis && (
        <div className="text-center py-8 text-slate-400">
          <Building2 size={36} className="mx-auto mb-2 opacity-40" />
          <p className="font-medium text-sm">No analysis available</p>
          <p className="text-xs mt-1">
            Place a building on the map to see stakeholder impact
          </p>
        </div>
      )}

      {analysis && s && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2 items-stretch">
            <SummaryCard
              icon={<Building2 size={14} />}
              label="Residential"
              value={s.residentialAffected}
              color="text-blue-700"
            />
            <SummaryCard
              icon={<Building2 size={14} />}
              label="Commercial"
              value={s.commercialAffected}
              color="text-emerald-700"
            />
            <SummaryCard
              icon={<Building2 size={14} />}
              label="Institutional"
              value={s.institutionalAffected}
              color="text-purple-700"
            />
            <SummaryCard
              icon={<Building2 size={14} />}
              label="Other"
              value={s.otherAffected}
              color="text-slate-600"
            />
          </div>

          {/* Key impact stats */}
          <div className="grid grid-cols-3 gap-2 items-stretch">
            <ImpactStat
              icon={<Sun size={14} />}
              value={s.significantSunlightLoss}
              label="Lose sunlight"
              color="text-amber-700"
              bg="bg-amber-50 border-amber-200"
            />
            <ImpactStat
              icon={<Volume2 size={14} />}
              value={s.highNoiseExposure}
              label="High noise"
              color="text-rose-700"
              bg="bg-rose-50 border-rose-200"
            />
            <ImpactStat
              icon={<Eye size={14} />}
              value={s.highViewObstruction}
              label="View blocked"
              color="text-blue-700"
              bg="bg-blue-50 border-blue-200"
            />
          </div>

          {/* Severity distribution */}
          <div className="bg-slate-900/5 border border-slate-900/10 rounded-lg p-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
              <AlertTriangle size={14} />
              Impact Distribution
            </h4>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-3 bg-slate-900/8 rounded-full overflow-hidden flex">
                {s.totalAffected > 0 && (
                  <>
                    <div
                      className="bg-green-500 h-full"
                      style={{
                        width: `${(s.impactByCategory.low / s.totalAffected) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-yellow-500 h-full"
                      style={{
                        width: `${(s.impactByCategory.medium / s.totalAffected) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-red-500 h-full"
                      style={{
                        width: `${(s.impactByCategory.high / s.totalAffected) * 100}%`,
                      }}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Low: {s.impactByCategory.low}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                Med: {s.impactByCategory.medium}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                High: {s.impactByCategory.high}
              </span>
            </div>
          </div>

          {/* Filter + building list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-500 uppercase">
                Affected ({filteredImpacts.length})
              </h4>
              <div className="flex gap-1">
                {(["all", "high", "medium", "low"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilterSeverity(f)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                      filterSeverity === f
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-900/5 text-slate-500 hover:bg-slate-900/8"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
              {filteredImpacts.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">
                  No buildings match this filter
                </p>
              ) : (
                filteredImpacts.slice(0, 50).map((imp) => (
                  <BuildingRow
                    key={imp.buildingId}
                    impact={imp}
                    expanded={expandedId === imp.buildingId}
                    onToggle={() =>
                      setExpandedId(
                        expandedId === imp.buildingId ? null : imp.buildingId
                      )
                    }
                  />
                ))
              )}
              {filteredImpacts.length > 50 && (
                <p className="text-xs text-slate-400 text-center pt-2">
                  Showing top 50 of {filteredImpacts.length} buildings
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactStat({
  icon,
  value,
  label,
  color,
  bg,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      className={`h-full min-h-[78px] flex flex-col items-center justify-center text-center rounded-lg border px-2 py-2.5 ${bg}`}
    >
      <div className={`${color} mb-1`}>{icon}</div>
      <p className={`text-base font-black tabular-nums leading-none ${color}`}>{value}</p>
      <p className={`mt-1 text-[9px] font-black uppercase tracking-[0.06em] leading-tight ${color} opacity-80`}>
        {label}
      </p>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="h-full min-h-[78px] flex flex-col items-center justify-center text-center rounded-lg border border-slate-900/10 bg-white/80 px-2 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <div className={`${color} mb-1 flex justify-center`}>{icon}</div>
      <p className={`text-base font-black tabular-nums leading-none ${color}`}>{value}</p>
      <p className="mt-1 text-[9px] font-black text-slate-500 uppercase tracking-[0.06em] leading-tight">
        {label}
      </p>
    </div>
  );
}
