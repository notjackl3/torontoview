"use client";

import { useMemo, useState } from "react";
import {
  Droplets,
  CloudRain,
  Leaf,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  X,
} from "lucide-react";
import {
  analyzeDrainage,
  analyzeMultipleDrainage,
  type DrainageAnalysis,
  type BuildingSpec,
} from "@/lib/water";
import { type BuildMode, involvesNewConstruction } from "@/lib/buildMode";
import { InsightButton } from "./InsightButton";

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  scale?: { x: number; y: number; z: number };
  timeline?: { zoneType?: string; startDate?: string; durationDays?: number };
  buildMode?: BuildMode;
}

interface DrainagePanelProps {
  visible: boolean;
  onClose: () => void;
  buildings: PlacedBuilding[];
}

function buildingToSpec(b: PlacedBuilding): BuildingSpec {
  const scaleX = b.scale?.x ?? 1;
  const scaleY = b.scale?.y ?? 1;
  const scaleZ = b.scale?.z ?? 1;
  // scale units to approximate meters (scale * 10 as a rough conversion)
  const widthM = Math.max(5, Math.round(scaleX * 10));
  const lengthM = Math.max(5, Math.round(scaleZ * 10));
  const heightM = Math.max(3, Math.round(scaleY * 3));
  const floors = Math.max(1, Math.round(heightM / 3.5));
  return {
    widthM,
    lengthM,
    floors,
    roofStyle: "flat",
    zoneType: b.timeline?.zoneType,
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function formatCost(low: number, high: number): string {
  const fmtLow = low >= 1000 ? `$${(low / 1000).toFixed(0)}k` : `$${low}`;
  const fmtHigh = high >= 1000 ? `$${(high / 1000).toFixed(0)}k` : `$${high}`;
  return `${fmtLow} – ${fmtHigh}`;
}

export default function DrainagePanel({
  visible,
  onClose,
  buildings,
}: DrainagePanelProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedMitigation, setExpandedMitigation] = useState<number | null>(null);

  // Only buildings that actually change the site's impervious surface
  // contribute new runoff. Move-in / fit-out reuses the existing footprint,
  // so we skip those from the analysis — their stormwater is unchanged.
  const groundUpBuildings = useMemo(
    () => buildings.filter((b) => involvesNewConstruction(b.buildMode)),
    [buildings],
  );
  const specs = useMemo(
    () => groundUpBuildings.map(buildingToSpec),
    [groundUpBuildings],
  );
  const analysis = useMemo(() => analyzeMultipleDrainage(specs), [specs]);

  if (!visible) return null;

  const current = analysis.buildings[selectedIdx];
  const totals = analysis.totals;

  // Move-in–only state: nothing changes on the parcel, so there's no new
  // drainage impact to compute.
  const allMoveIn =
    buildings.length > 0 && groundUpBuildings.length === 0;

  if (allMoveIn) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Droplets className="text-blue-400" size={20} />
            <h3 className="font-bold text-white text-sm uppercase tracking-tight">
              Drainage Impact
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-900/8 rounded">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3">
          <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide mb-1">
            No new site disturbance
          </p>
          <p className="text-[11px] text-emerald-900/80 leading-relaxed">
            You&rsquo;re moving into an existing building, so the parcel&rsquo;s
            impervious surface and the City&rsquo;s existing stormwater management
            for this site don&rsquo;t change. Drainage / SWM review only applies
            to ground-up construction or demolition-and-rebuild.
          </p>
        </div>
      </div>
    );
  }

  if (!buildings.length) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Droplets className="text-blue-400" size={20} />
            <h3 className="font-bold text-white text-sm uppercase tracking-tight">
              Drainage Impact
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-900/8 rounded">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        <p className="text-slate-500 text-sm">No buildings placed. Add buildings to analyze drainage impact.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="pb-3 mb-3 border-b border-slate-900/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="text-blue-400" size={20} />
            <h3 className="font-bold text-white text-sm uppercase tracking-tight">
              Drainage Impact Analysis
            </h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-900/8 rounded">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
        {buildings.length > 1 && (
          <p className="text-xs text-slate-500 mt-1">
            {groundUpBuildings.length} ground-up site
            {groundUpBuildings.length === 1 ? "" : "s"} analyzed
            {buildings.length > groundUpBuildings.length && (
              <span className="text-slate-400">
                {" "}
                · {buildings.length - groundUpBuildings.length} move-in skipped
              </span>
            )}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {/* Aggregate totals (when multiple buildings) */}
        {groundUpBuildings.length > 1 && (
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Net Impervious"
              value={`+${formatNumber(totals.totalNetIncreaseM2)}`}
              unit="m²"
            />
            <StatCard
              label="2-yr Runoff"
              value={`+${formatNumber(totals.totalRunoffIncreaseL_2yr)}`}
              unit="L"
            />
            <StatCard
              label="100-yr Runoff"
              value={`+${formatNumber(totals.totalRunoffIncreaseL_100yr)}`}
              unit="L"
            />
          </div>
        )}

        {/* Building selector — limited to ground-up builds, since move-in
            sites don't contribute new runoff. */}
        {groundUpBuildings.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {groundUpBuildings.map((b, i) => (
              <button
                key={b.id}
                onClick={() => setSelectedIdx(i)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedIdx === i
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900/5 text-slate-500 hover:bg-slate-900/8 hover:text-slate-800"
                }`}
              >
                Building {i + 1}
              </button>
            ))}
          </div>
        )}

        {current && (
          <>
            {/* Impervious Surface Breakdown */}
            <Section title="Impervious Surface" icon={<CloudRain size={14} />}>
              <div className="space-y-1.5 text-xs">
                <Row label="Building footprint" value={`${formatNumber(current.surface.buildingFootprintM2)} m²`} />
                <Row label="Estimated parking" value={`${formatNumber(current.surface.parkingAreaM2)} m²`} />
                <Row label="Access / sidewalks" value={`${formatNumber(current.surface.sidewalksAndAccessM2)} m²`} />
                <div className="border-t border-slate-900/8 pt-1.5 mt-1.5">
                  <Row label="Total impervious" value={`${formatNumber(current.surface.totalImperviousM2)} m²`} bold />
                  <Row label="Previously impervious" value={`${formatNumber(current.surface.previousImperviousM2)} m²`} />
                  <Row
                    label="Net increase"
                    value={`+${formatNumber(current.surface.netImperviousIncrease)} m²`}
                    bold
                    highlight
                  />
                </div>
                {/* Impervious bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                    <span>Before: {current.surface.imperviousPercentBefore}%</span>
                    <span>After: {current.surface.imperviousPercentAfter}%</span>
                  </div>
                  <div className="h-2 bg-slate-900/8 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${current.surface.imperviousPercentAfter}%` }}
                    />
                  </div>
                </div>
              </div>
            </Section>

            {/* Runoff Impact */}
            <Section title="Stormwater Runoff" icon={<Droplets size={14} />}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase">
                    <th className="text-left font-bold pb-1">Storm</th>
                    <th className="text-right font-bold pb-1">Before</th>
                    <th className="text-right font-bold pb-1">After</th>
                    <th className="text-right font-bold pb-1">Increase</th>
                  </tr>
                </thead>
                <tbody>
                  {current.runoff.map((r) => (
                    <tr
                      key={r.returnPeriod}
                      className={`border-t border-slate-900/8 ${
                        r.returnPeriod === '2-year' || r.returnPeriod === '100-year'
                          ? 'font-semibold text-slate-800'
                          : 'text-slate-500'
                      }`}
                    >
                      <td className="py-1 text-slate-700">{r.returnPeriod}</td>
                      <td className="py-1 text-right">{r.runoffBeforeMm} mm</td>
                      <td className="py-1 text-right">{r.runoffAfterMm} mm</td>
                      <td className="py-1 text-right text-blue-400">
                        +{formatNumber(r.runoffVolumeIncreaseL)} L
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Peak flow */}
              <div className="mt-2 pt-2 border-t border-slate-900/8 space-y-1">
                {current.runoff
                  .filter((r) => r.returnPeriod === '2-year' || r.returnPeriod === '100-year')
                  .map((r) => (
                    <div key={r.returnPeriod} className="flex justify-between text-xs">
                      <span className="text-slate-500">{r.returnPeriod} peak flow increase</span>
                      <span className="font-semibold text-blue-400">
                        +{r.peakFlowIncreaseLps.toFixed(2)} L/s
                      </span>
                    </div>
                  ))}
              </div>
            </Section>

            {/* NVIDIA-served LLM insight */}
            <Section title="NVIDIA AI Insight" icon={<CloudRain size={14} />}>
              <InsightButton
                endpoint="/api/insights/water-impact"
                label="Generate water-impact recommendation"
                buildPayload={() =>
                  current
                    ? {
                        projectDescription: `Toronto building proposal (${groundUpBuildings.length} ground-up site${groundUpBuildings.length === 1 ? "" : "s"})`,
                        simulation: {
                          totalImperviousM2: current.surface.totalImperviousM2,
                          netImperviousIncreaseM2: current.surface.netImperviousIncrease,
                          imperviousPercentBefore: current.surface.imperviousPercentBefore,
                          imperviousPercentAfter: current.surface.imperviousPercentAfter,
                          runoff: current.runoff,
                          mitigationsAvailable: current.mitigations.map((m) => ({
                            name: m.name,
                            volumeReductionL: m.volumeReductionL,
                            applicability: m.applicability,
                          })),
                          offsetPercentIfAllApplied: current.offsetPercent,
                        },
                        context: {
                          zoneType: groundUpBuildings[selectedIdx]?.timeline?.zoneType,
                          coordinates: {
                            lat: groundUpBuildings[selectedIdx]?.lat,
                            lng: groundUpBuildings[selectedIdx]?.lng,
                          },
                        },
                      }
                    : null
                }
              />
            </Section>

            {/* Mitigation Recommendations */}
            <Section title="Mitigation Measures" icon={<Leaf size={14} />}>
              {/* Offset meter */}
              <div className="mb-3">
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-slate-500">Runoff offset (if all applied)</span>
                  <span
                    className={`font-bold ${
                      current.offsetPercent >= 100
                        ? 'text-green-400'
                        : current.offsetPercent >= 70
                        ? 'text-amber-400'
                        : 'text-red-400'
                    }`}
                  >
                    {current.offsetPercent}%
                  </span>
                </div>
                <div className="h-2.5 bg-slate-900/8 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      current.offsetPercent >= 100
                        ? 'bg-green-500'
                        : current.offsetPercent >= 70
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, current.offsetPercent)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                {current.mitigations.map((m, i) => (
                  <div
                    key={i}
                    className="bg-slate-900/5 rounded-lg border border-slate-900/10 overflow-hidden"
                  >
                    <button
                      className="w-full flex items-center justify-between p-2.5 text-left"
                      onClick={() => setExpandedMitigation(expandedMitigation === i ? null : i)}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            m.applicability === 'high'
                              ? 'bg-green-500'
                              : m.applicability === 'medium'
                              ? 'bg-amber-500'
                              : 'bg-zinc-500'
                          }`}
                        />
                        <span className="text-xs font-semibold text-slate-800">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-blue-400 font-medium">
                          −{formatNumber(m.volumeReductionL)} L
                        </span>
                      </div>
                      {expandedMitigation === i ? (
                        <ChevronUp size={12} className="text-slate-500" />
                      ) : (
                        <ChevronDown size={12} className="text-slate-500" />
                      )}
                    </button>
                    {expandedMitigation === i && (
                      <div className="px-2.5 pb-2.5 text-[11px] text-slate-500 space-y-1 border-t border-slate-900/8 pt-2">
                        <p>{m.description}</p>
                        <div className="flex gap-4 mt-1">
                          <span>Area: {formatNumber(m.areaRequiredM2)} m²</span>
                          <span>Cost: {formatCost(m.costEstimateLow, m.costEstimateHigh)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          {m.applicability === 'high' ? (
                            <CheckCircle size={10} className="text-green-400" />
                          ) : (
                            <AlertTriangle size={10} className="text-amber-400" />
                          )}
                          <span className="capitalize">{m.applicability} applicability</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-blue-500/10 rounded-lg p-2 text-center border border-blue-400/20">
      <p className="text-[9px] font-bold text-slate-400 uppercase">{label}</p>
      <p className="text-sm font-bold text-blue-300">{value}</p>
      <p className="text-[9px] text-slate-400">{unit}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900/[0.04] rounded-lg border border-slate-900/10 p-3">
      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={`text-slate-500 ${bold ? 'font-semibold' : ''}`}>{label}</span>
      <span
        className={`${bold ? 'font-semibold' : ''} ${
          highlight ? 'text-blue-400' : 'text-slate-800'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
