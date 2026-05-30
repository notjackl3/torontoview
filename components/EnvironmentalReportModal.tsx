"use client";

import { useState } from "react";
import {
  X,
  Leaf,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TreePine,
  Wind,
  Droplets,
  Users,
  Car,
  Volume2,
  DollarSign,
  MapPin,
  Download,
  Loader2,
} from "lucide-react";

interface PlacedBuilding {
  id: string;
  lat: number;
  lng: number;
  scale: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
}

interface BuildingImpact {
  id: string;
  coordinates: { lat: number; lng: number };
  locationDescription: string;
  environmentalImpact: {
    carbonFootprint: string;
    habitatDisruption: string;
    waterImpact: string;
    airQuality: string;
  };
  societalImpact: {
    trafficIncrease: string;
    noiseLevel: string;
    communityEffect: string;
    economicImpact: string;
  };
  riskLevel: "low" | "medium" | "high";
  mitigationMeasures: string[];
}

interface OverallImpact {
  environmentalScore: number;
  societalScore: number;
  sustainabilityRating: string;
  totalCarbonTonnes: number;
  treesRequired: number;
}

interface EnvironmentalReport {
  summary: string;
  buildings: BuildingImpact[];
  overallImpact: OverallImpact;
  recommendations: string[];
}

export interface MetricsSnapshot {
  timelineDate: string;
  co2Emissions: number;
  energyConsumption: number;
  waterUsage: number;
  totalFootprint: number;
  materialComplexity: string;
  sustainabilityScore: number;
  populationHappiness: number;
  avgDb: number;
  activeCount: number;
}

interface EnvironmentalReportModalProps {
  visible: boolean;
  onClose: () => void;
  buildings: PlacedBuilding[];
  /** Snapshot of metrics at current timeline when report is generated */
  snapshot?: MetricsSnapshot | null;
}

export default function EnvironmentalReportModal({
  visible,
  onClose,
  buildings,
  snapshot = null,
}: EnvironmentalReportModalProps) {
  const [report, setReport] = useState<EnvironmentalReport | null>(null);
  const [reportSnapshotDate, setReportSnapshotDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBuildingIndex, setSelectedBuildingIndex] = useState(0);

  const generateReport = async () => {
    if (buildings.length === 0) {
      setError("No buildings active at the current timeline date. Move the timeline to a date with active construction.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/environmental-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildings, snapshot: snapshot ?? undefined }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate report");
      }

      const data = await response.json();
      setReport(data.report);
      setReportSnapshotDate(data.snapshotDate ?? snapshot?.timelineDate ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const exportReport = () => {
    if (!report) return;

    const asOfLabel = reportSnapshotDate
      ? `Report snapshot as of: ${new Date(reportSnapshotDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })}`
      : "";
    const reportText = `
ENVIRONMENTAL IMPACT ASSESSMENT REPORT
${asOfLabel ? asOfLabel + "\n" : ""}Generated: ${new Date().toLocaleDateString()}
Location: Toronto, Ontario, Canada

================================================================================
EXECUTIVE SUMMARY
================================================================================
${report.summary}

================================================================================
OVERALL IMPACT SCORES
================================================================================
Environmental Score: ${report.overallImpact.environmentalScore}/100
Societal Score: ${report.overallImpact.societalScore}/100
Sustainability Rating: ${report.overallImpact.sustainabilityRating}
Total Carbon Impact: ${report.overallImpact.totalCarbonTonnes} tonnes CO2
Trees Required for Offset: ${report.overallImpact.treesRequired} trees

================================================================================
INDIVIDUAL BUILDING ASSESSMENTS
================================================================================
${report.buildings
  .map(
    (b, i) => `
BUILDING ${i + 1}: ${b.id}
Coordinates: ${b.coordinates.lat.toFixed(6)}°N, ${b.coordinates.lng.toFixed(6)}°W
Location: ${b.locationDescription}
Risk Level: ${b.riskLevel.toUpperCase()}

Environmental Impact:
- Carbon Footprint: ${b.environmentalImpact.carbonFootprint}
- Habitat Disruption: ${b.environmentalImpact.habitatDisruption}
- Water Impact: ${b.environmentalImpact.waterImpact}
- Air Quality: ${b.environmentalImpact.airQuality}

Societal Impact:
- Traffic: ${b.societalImpact.trafficIncrease}
- Noise: ${b.societalImpact.noiseLevel}
- Community: ${b.societalImpact.communityEffect}
- Economic: ${b.societalImpact.economicImpact}

Mitigation Measures:
${b.mitigationMeasures.map((m) => `- ${m}`).join("\n")}
`
  )
  .join("\n")}

================================================================================
RECOMMENDATIONS
================================================================================
${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

================================================================================
END OF REPORT
================================================================================
`;

    const blob = new Blob([reportText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `environmental-report-${reportSnapshotDate ? reportSnapshotDate : new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!visible) return null;

  const getRiskColor = (level: "low" | "medium" | "high") => {
    switch (level) {
      case "low":
        return "text-green-400 bg-green-500/10 border-green-500/30";
      case "medium":
        return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      case "high":
        return "text-red-400 bg-red-500/10 border-red-500/30";
    }
  };

  const getRiskIcon = (level: "low" | "medium" | "high") => {
    switch (level) {
      case "low":
        return <CheckCircle size={14} />;
      case "medium":
        return <AlertTriangle size={14} />;
      case "high":
        return <XCircle size={14} />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-amber-400";
    return "text-red-400";
  };

  const selectedBuilding = report?.buildings[selectedBuildingIndex];

  return (
    <div>
      {/* Header */}
      <div className="pb-3 mb-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="text-green-400" size={20} />
            <h3 className="font-bold text-white text-sm uppercase tracking-tight">
              Impact Report
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {report && (
              <button
                onClick={exportReport}
                className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-400 hover:text-white"
                title="Export Report"
              >
                <Download size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded transition-colors text-zinc-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-400 mt-1">
          Toronto, Ontario
          {reportSnapshotDate && (
            <span className="text-green-400 ml-1">
              &middot; {new Date(reportSnapshotDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </p>
      </div>

      {/* Pre-generate state */}
      {!report && !loading && !error && (
        <div className="text-center py-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <TreePine className="text-green-400" size={28} />
          </div>
          <p className="text-zinc-400 text-sm mb-4 px-2">
            {snapshot
              ? `Capture a snapshot of ${buildings.length} active building${buildings.length !== 1 ? "s" : ""} at the current timeline date.`
              : `Analyze the impact of ${buildings.length} proposed building${buildings.length !== 1 ? "s" : ""} in Toronto.`}
          </p>
          <button
            onClick={generateReport}
            disabled={buildings.length === 0}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors"
          >
            {buildings.length === 0
              ? "No Buildings to Analyze"
              : "Generate Report"}
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <Loader2 className="w-10 h-10 mx-auto mb-3 text-green-400 animate-spin" />
          <p className="text-zinc-300 text-sm font-medium">
            Analyzing impacts...
          </p>
          <p className="text-zinc-500 text-xs mt-1">
            This may take a few moments
          </p>
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
            <XCircle className="text-red-400" size={24} />
          </div>
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button
            onClick={generateReport}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-zinc-300 text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {report && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-white/5 rounded-lg p-3 border border-white/10">
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase mb-1.5">
              Executive Summary
            </h4>
            <p className="text-xs text-zinc-300 leading-relaxed">{report.summary}</p>
          </div>

          {/* Overall Scores */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5">
                Environmental
              </p>
              <p className={`text-xl font-bold ${getScoreColor(report.overallImpact.environmentalScore)}`}>
                {report.overallImpact.environmentalScore}
              </p>
              <p className="text-[9px] text-zinc-600">/ 100</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5">
                Societal
              </p>
              <p className={`text-xl font-bold ${getScoreColor(report.overallImpact.societalScore)}`}>
                {report.overallImpact.societalScore}
              </p>
              <p className="text-[9px] text-zinc-600">/ 100</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 text-center">
              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5">
                Rating
              </p>
              <p className="text-sm font-bold text-zinc-200">
                {report.overallImpact.sustainabilityRating.split(" ")[0]}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-orange-500/10 rounded-lg p-2.5 border border-orange-400/20 text-center">
              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5">
                Carbon Impact
              </p>
              <p className="text-lg font-bold text-orange-300">
                {report.overallImpact.totalCarbonTonnes.toLocaleString()}
              </p>
              <p className="text-[9px] text-zinc-500">tonnes CO2</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-2.5 border border-green-400/20 text-center">
              <p className="text-[9px] font-bold text-zinc-500 uppercase mb-0.5">
                Trees Needed
              </p>
              <p className="text-lg font-bold text-green-300">
                {report.overallImpact.treesRequired.toLocaleString()}
              </p>
              <p className="text-[9px] text-zinc-500">for offset</p>
            </div>
          </div>

          {/* Building Selector */}
          {report.buildings.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {report.buildings.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBuildingIndex(i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedBuildingIndex === i
                      ? "bg-green-600 text-white"
                      : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                  }`}
                >
                  Building {i + 1}
                </button>
              ))}
            </div>
          )}

          {/* Selected Building Details */}
          {selectedBuilding && (
            <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden">
              {/* Building Header */}
              <div className="p-3 border-b border-white/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <MapPin size={12} className="text-zinc-500 shrink-0" />
                      <span className="text-[10px] font-mono text-zinc-400 truncate">
                        {selectedBuilding.coordinates.lat.toFixed(4)}°N,{" "}
                        {Math.abs(selectedBuilding.coordinates.lng).toFixed(4)}°W
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 line-clamp-2">
                      {selectedBuilding.locationDescription}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-1 rounded-md border font-bold text-[10px] uppercase flex items-center gap-1 ${getRiskColor(
                      selectedBuilding.riskLevel
                    )}`}
                  >
                    {getRiskIcon(selectedBuilding.riskLevel)}
                    {selectedBuilding.riskLevel}
                  </span>
                </div>
              </div>

              {/* Environmental Impact */}
              <div className="p-3 space-y-2">
                <h4 className="text-[10px] font-bold text-green-400 uppercase flex items-center gap-1.5">
                  <Leaf size={12} />
                  Environmental
                </h4>
                <ImpactItem icon={<Wind size={12} />} label="Carbon" value={selectedBuilding.environmentalImpact.carbonFootprint} />
                <ImpactItem icon={<TreePine size={12} />} label="Habitat" value={selectedBuilding.environmentalImpact.habitatDisruption} />
                <ImpactItem icon={<Droplets size={12} />} label="Water" value={selectedBuilding.environmentalImpact.waterImpact} />
                <ImpactItem icon={<Wind size={12} />} label="Air" value={selectedBuilding.environmentalImpact.airQuality} />
              </div>

              {/* Societal Impact */}
              <div className="p-3 border-t border-white/5 space-y-2">
                <h4 className="text-[10px] font-bold text-blue-400 uppercase flex items-center gap-1.5">
                  <Users size={12} />
                  Societal
                </h4>
                <ImpactItem icon={<Car size={12} />} label="Traffic" value={selectedBuilding.societalImpact.trafficIncrease} />
                <ImpactItem icon={<Volume2 size={12} />} label="Noise" value={selectedBuilding.societalImpact.noiseLevel} />
                <ImpactItem icon={<Users size={12} />} label="Community" value={selectedBuilding.societalImpact.communityEffect} />
                <ImpactItem icon={<DollarSign size={12} />} label="Economic" value={selectedBuilding.societalImpact.economicImpact} />
              </div>

              {/* Mitigation */}
              <div className="p-3 border-t border-white/5 bg-amber-500/5">
                <h4 className="text-[10px] font-bold text-amber-400 uppercase mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Mitigation Measures
                </h4>
                <ul className="space-y-1">
                  {selectedBuilding.mitigationMeasures.map((measure, i) => (
                    <li key={i} className="text-[11px] text-zinc-400 flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5 shrink-0">-</span>
                      {measure}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
            <h4 className="text-[10px] font-bold text-green-400 uppercase mb-2 flex items-center gap-1.5">
              <CheckCircle size={12} />
              Recommendations
            </h4>
            <ol className="space-y-1.5">
              {report.recommendations.map((rec, i) => (
                <li key={i} className="text-[11px] text-zinc-400 flex items-start gap-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-green-600 text-white text-[9px] flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </span>
                  {rec}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white/[0.03] rounded-md p-2 border border-white/5">
      <div className="flex items-center gap-1.5 text-zinc-500 text-[10px] font-bold uppercase mb-0.5">
        {icon}
        {label}
      </div>
      <p className="text-[11px] text-zinc-300">{value}</p>
    </div>
  );
}
