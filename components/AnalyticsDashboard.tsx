"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  Car,
  Clock3,
  Download,
  DollarSign,
  Gauge,
  Route,
  ShieldAlert,
  TrendingUp,
  X,
} from "lucide-react";
import {
  AnalyticsSnapshot,
  IntersectionMetrics,
  TrafficAnalytics,
} from "@/lib/analytics";

interface AnalyticsDashboardProps {
  analytics: TrafficAnalytics | null;
  visible: boolean;
  onClose: () => void;
}

type DashboardTab =
  | "overview"
  | "economy"
  | "traffic"
  | "intersections"
  | "safety"
  | "performance";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default function AnalyticsDashboard({
  analytics,
  visible,
  onClose,
}: AnalyticsDashboardProps) {
  const [currentSnapshot, setCurrentSnapshot] =
    useState<AnalyticsSnapshot | null>(null);
  const [history, setHistory] = useState<AnalyticsSnapshot[]>([]);
  const [selectedTab, setSelectedTab] = useState<DashboardTab>("overview");

  useEffect(() => {
    if (!analytics || !visible) return;

    const interval = setInterval(() => {
      const historyData = analytics.getHistory();
      setHistory(historyData);
      if (historyData.length > 0) {
        setCurrentSnapshot(historyData[historyData.length - 1]);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [analytics, visible]);

  const economicModel = useMemo(
    () => (currentSnapshot ? buildEconomicModel(currentSnapshot) : null),
    [currentSnapshot],
  );

  if (!visible) return null;

  const handleExportCSV = () => {
    if (analytics) {
      analytics.downloadCSV(
        `torontoview-economic-dashboard-${new Date().toISOString().split("T")[0]}.csv`,
      );
    }
  };

  const renderOverview = () => {
    if (!currentSnapshot || !economicModel) return <EmptyState />;
    const { traffic } = currentSnapshot;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<DollarSign size={17} />}
            label="Local spend capacity"
            value={currency.format(economicModel.hourlySpendCapacity)}
            meta="Hourly access proxy"
            tone="emerald"
            trend={getTrend(history.map((s) => buildEconomicModel(s).hourlySpendCapacity))}
          />
          <MetricCard
            icon={<Building2 size={17} />}
            label="Market access"
            value={`${economicModel.marketAccessScore}/100`}
            meta={`${traffic.vehicleCount} active trips`}
            tone="blue"
            trend={getTrend(history.map((s) => buildEconomicModel(s).marketAccessScore))}
          />
          <MetricCard
            icon={<Gauge size={17} />}
            label="Network speed"
            value={traffic.averageSpeed.toFixed(1)}
            unit="km/h"
            meta="Customer + staff mobility"
            tone="amber"
            trend={getTrend(history.map((s) => s.traffic.averageSpeed))}
          />
          <MetricCard
            icon={<ShieldAlert size={17} />}
            label="Safety friction"
            value={currentSnapshot.nearMisses.length}
            unit="/s"
            meta="Near-miss signal"
            tone="rose"
            trend={getTrend(history.map((s) => s.nearMisses.length))}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <ChartCard
            eyebrow="Economic throughput"
            title="Access Flow Trend"
            subtitle="Combines vehicle flow and average speed into a local commerce access proxy."
          >
            <MiniChart
              data={history.slice(-90).map((s) => buildEconomicModel(s).accessFlow)}
              max={Math.max(1, ...history.slice(-90).map((s) => buildEconomicModel(s).accessFlow))}
              color="#047857"
            />
          </ChartCard>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">
                  Board readout
                </p>
                <h3 className="mt-1 text-base font-black text-slate-950">
                  Economic operating posture
                </h3>
              </div>
              <span className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                Live model
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Readout label="Freight share" value={`${economicModel.freightShare}%`} />
              <Readout label="Delay exposure" value={currency.format(economicModel.delayCostProxy)} />
              <Readout label="Retail reach" value={`${economicModel.retailReachScore}/100`} />
              <Readout label="Operational risk" value={economicModel.riskBand} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <VehicleTypeBar type="Sedans" count={traffic.vehiclesByType.sedan} total={traffic.vehicleCount} color="bg-sky-600" />
          <VehicleTypeBar type="SUVs" count={traffic.vehiclesByType.suv} total={traffic.vehicleCount} color="bg-emerald-600" />
          <VehicleTypeBar type="Trucks" count={traffic.vehiclesByType.truck} total={traffic.vehicleCount} color="bg-amber-600" />
          <VehicleTypeBar type="Compacts" count={traffic.vehiclesByType.compact} total={traffic.vehicleCount} color="bg-violet-600" />
        </div>
      </div>
    );
  };

  const renderEconomy = () => {
    if (!currentSnapshot || !economicModel) return <EmptyState />;

    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <MetricCard
            icon={<TrendingUp size={17} />}
            label="Daily spend potential"
            value={currency.format(economicModel.dailySpendPotential)}
            meta="12-hour operating window proxy"
            tone="emerald"
          />
          <MetricCard
            icon={<Clock3 size={17} />}
            label="Delay cost proxy"
            value={currency.format(economicModel.delayCostProxy)}
            meta="Delay-sensitive operating loss signal"
            tone="rose"
          />
          <MetricCard
            icon={<Route size={17} />}
            label="Commercial mobility"
            value={`${economicModel.commercialMobilityScore}/100`}
            meta="Trips, speed, freight balance"
            tone="blue"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase text-slate-500">
            Business viability signals
          </p>
          <h3 className="mt-1 text-lg font-black text-slate-950">
            Area economy pulse
          </h3>
          <div className="mt-5 space-y-4">
            <EconomicSignal
              label="Customer access"
              value={economicModel.marketAccessScore}
              detail="Higher when traffic is moving and active trip volume is healthy."
            />
            <EconomicSignal
              label="Retail reach"
              value={economicModel.retailReachScore}
              detail="Proxy for nearby demand exposure around the simulated corridor."
            />
            <EconomicSignal
              label="Logistics fit"
              value={economicModel.logisticsFitScore}
              detail="Uses truck mix and speed stability to flag delivery readiness."
            />
            <EconomicSignal
              label="Safety confidence"
              value={economicModel.safetyConfidenceScore}
              detail="Reduced by near-miss frequency and intersection queue pressure."
            />
          </div>
        </div>
      </div>
    );
  };

  const renderPerformance = () => {
    if (!currentSnapshot) return <EmptyState />;
    const { performance } = currentSnapshot;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard icon={<Activity size={17} />} label="FPS" value={performance.fps} meta="Rendering health" tone="emerald" />
          <MetricCard icon={<Clock3 size={17} />} label="Frame time" value={performance.frameTime.toFixed(2)} unit="ms" meta="Frame budget" tone="blue" />
          <MetricCard icon={<BarChart3 size={17} />} label="Render time" value={performance.renderTime.toFixed(2)} unit="ms" meta="GPU draw signal" tone="amber" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard eyebrow="System" title="Frame Time History">
            <MiniChart data={history.slice(-60).map((s) => s.performance.frameTime)} max={33.33} color="#2563eb" />
          </ChartCard>
          <ChartCard eyebrow="System" title="Update Time History">
            <MiniChart data={history.slice(-60).map((s) => s.performance.updateTime)} max={16.67} color="#d97706" />
          </ChartCard>
        </div>
      </div>
    );
  };

  const renderTraffic = () => {
    if (!currentSnapshot) return <EmptyState />;
    const { traffic } = currentSnapshot;

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard icon={<Car size={17} />} label="Total spawned" value={traffic.totalVehiclesSpawned} meta="Trips entering model" tone="emerald" />
          <MetricCard icon={<Route size={17} />} label="Total cleared" value={traffic.totalVehiclesDespawned} meta="Trips completed" tone="blue" />
          <MetricCard
            icon={<TrendingUp size={17} />}
            label="Net flow"
            value={traffic.totalVehiclesSpawned - traffic.totalVehiclesDespawned}
            meta="System accumulation"
            tone="amber"
          />
        </div>

        <ChartCard eyebrow="Mobility" title="Average Speed Over Time">
          <MiniChart data={history.slice(-60).map((s) => s.traffic.averageSpeed)} max={60} color="#047857" />
        </ChartCard>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">
                Corridor speed
              </p>
              <h3 className="text-base font-black text-slate-950">
                {traffic.averageSpeed.toFixed(1)} km/h average
              </h3>
            </div>
            <span className="text-[11px] font-bold text-slate-500">0-60 km/h</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-sm bg-slate-100">
            <div
              className="h-full bg-gradient-to-r from-rose-600 via-amber-500 to-emerald-600"
              style={{ width: `${Math.min(100, (traffic.averageSpeed / 60) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderIntersections = () => {
    if (!currentSnapshot) return <EmptyState />;

    return (
      <div className="space-y-3">
        {currentSnapshot.intersections.length === 0 ? (
          <EmptyState title="No intersection data available" />
        ) : (
          currentSnapshot.intersections.map((intersection) => (
            <IntersectionCard key={intersection.id} intersection={intersection} />
          ))
        )}
      </div>
    );
  };

  const renderSafety = () => {
    if (!analytics) return <EmptyState />;

    const recentNearMisses = analytics.getRecentNearMisses(60);
    const highSeverity = recentNearMisses.filter((m) => m.severity === "high");
    const mediumSeverity = recentNearMisses.filter((m) => m.severity === "medium");
    const lowSeverity = recentNearMisses.filter((m) => m.severity === "low");

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <MetricCard icon={<ShieldAlert size={17} />} label="High severity" value={highSeverity.length} unit="events" meta="Immediate attention" tone="rose" />
          <MetricCard icon={<ShieldAlert size={17} />} label="Medium severity" value={mediumSeverity.length} unit="events" meta="Monitor" tone="amber" />
          <MetricCard icon={<ShieldAlert size={17} />} label="Low severity" value={lowSeverity.length} unit="events" meta="Observed" tone="blue" />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-black text-slate-950">
            Recent Near Misses
          </h3>
          <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
            {recentNearMisses.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No near misses detected in the last 60 seconds.
              </p>
            ) : (
              recentNearMisses.reverse().map((miss, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3"
                >
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">
                      {miss.car1Id.slice(0, 8)} to {miss.car2Id.slice(0, 8)}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(miss.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold text-slate-900">
                      {miss.distance.toFixed(2)}m
                    </div>
                    <div className={`text-[10px] font-black uppercase ${severityColor(miss.severity)}`}>
                      {miss.severity}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-2xl">
        <header className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded bg-slate-950 text-white">
                <BarChart3 size={22} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-emerald-700">
                  TorontoView Economic Command Centre
                </p>
                <h2 className="text-xl font-black text-slate-950">
                  Mobility, Market Access, and Safety Dashboard
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-800 shadow-sm transition-colors hover:bg-slate-100"
              >
                <Download size={14} />
                Export CSV
              </button>
              <button
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-950 text-white transition-colors hover:bg-slate-800"
                aria-label="Close dashboard"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-6">
          {([
            ["overview", "Overview"],
            ["economy", "Economy"],
            ["traffic", "Mobility"],
            ["intersections", "Intersections"],
            ["safety", "Safety"],
            ["performance", "System"],
          ] as const).map(([tab, label]) => (
            <TabButton
              key={tab}
              active={selectedTab === tab}
              onClick={() => setSelectedTab(tab)}
            >
              {label}
            </TabButton>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-5">
          {selectedTab === "overview" && renderOverview()}
          {selectedTab === "economy" && renderEconomy()}
          {selectedTab === "traffic" && renderTraffic()}
          {selectedTab === "intersections" && renderIntersections()}
          {selectedTab === "safety" && renderSafety()}
          {selectedTab === "performance" && renderPerformance()}
        </main>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-4 py-3 text-xs font-black uppercase transition-colors ${
        active
          ? "border-emerald-700 text-slate-950"
          : "border-transparent text-slate-500 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  meta,
  tone,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  unit?: string;
  meta: string;
  tone: "emerald" | "blue" | "amber" | "rose";
  trend?: "up" | "down" | "stable";
}) {
  const toneClass = {
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded border ${toneClass}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[10px] font-black uppercase ${trendTextColor(trend)}`}>
            {trend === "up" ? "Up" : trend === "down" ? "Down" : "Stable"}
          </span>
        )}
      </div>
      <p className="mt-4 text-[10px] font-black uppercase text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-black text-slate-950">{value}</span>
        {unit && <span className="text-xs font-bold text-slate-500">{unit}</span>}
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-500">{meta}</p>
    </div>
  );
}

function ChartCard({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      {eyebrow && (
        <p className="text-[10px] font-black uppercase text-slate-500">
          {eyebrow}
        </p>
      )}
      <h3 className="mt-1 text-base font-black text-slate-950">{title}</h3>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function MiniChart({
  data,
  max,
  color,
}: {
  data: number[];
  max: number;
  color: string;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
        No data
      </div>
    );
  }

  const width = 100;
  const height = 100;
  const padding = 6;
  const safeMax = Math.max(max, 1);

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1 || 1)) * (width - padding * 2) + padding;
    const y = height - (value / safeMax) * (height - padding * 2) - padding;
    return `${x},${Math.max(padding, Math.min(height - padding, y))}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-28 w-full rounded-md bg-slate-50"
      preserveAspectRatio="none"
    >
      <line x1="6" y1="82" x2="94" y2="82" stroke="#e2e8f0" strokeWidth="1" />
      <line x1="6" y1="50" x2="94" y2="50" stroke="#e2e8f0" strokeWidth="1" />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function VehicleTypeBar({
  type,
  count,
  total,
  color,
}: {
  type: string;
  count: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex justify-between text-xs">
        <span className="font-bold text-slate-600">{type}</span>
        <span className="font-black text-slate-950">{count}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-sm bg-slate-100">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="mt-2 text-[10px] font-bold text-slate-500">
        {percentage.toFixed(1)}% of modeled trips
      </div>
    </div>
  );
}

function IntersectionCard({
  intersection,
}: {
  intersection: IntersectionMetrics;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase text-slate-500">
            Intersection
          </p>
          <h3 className="font-mono text-sm font-black text-slate-950">
            {intersection.id}
          </h3>
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
          {(intersection.cycleTime / 1000).toFixed(0)}s cycle
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <Readout label="Avg delay" value={`${intersection.averageDelay.toFixed(1)}s`} />
        <Readout label="Queue" value={intersection.queueLength.toFixed(1)} />
        <Readout label="Crossings" value={intersection.totalCrossingVehicles} />
      </div>
    </div>
  );
}

function EconomicSignal({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">{detail}</p>
        </div>
        <span className="font-mono text-sm font-black text-slate-950">
          {value}/100
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-sm bg-slate-100">
        <div
          className="h-full bg-emerald-700"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function EmptyState({ title = "Waiting for live analytics" }: { title?: string }) {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm font-bold text-slate-500">
      {title}
    </div>
  );
}

function buildEconomicModel(snapshot: AnalyticsSnapshot) {
  const { traffic, intersections, nearMisses } = snapshot;
  const activeVehicles = traffic.vehicleCount;
  const averageDelay =
    intersections.length > 0
      ? intersections.reduce((sum, item) => sum + item.averageDelay, 0) /
        intersections.length
      : 0;
  const freightShare =
    activeVehicles > 0
      ? Math.round((traffic.vehiclesByType.truck / activeVehicles) * 100)
      : 0;
  const accessFlow = activeVehicles * Math.max(traffic.averageSpeed, 1);
  const marketAccessScore = score(
    42 + traffic.averageSpeed * 0.7 + activeVehicles * 1.1 - averageDelay * 0.8,
  );
  const retailReachScore = score(35 + activeVehicles * 2 + traffic.averageSpeed * 0.55);
  const logisticsFitScore = score(50 + freightShare * 1.2 + traffic.averageSpeed * 0.45 - averageDelay);
  const safetyConfidenceScore = score(92 - nearMisses.length * 8 - averageDelay * 0.6);
  const commercialMobilityScore = score(
    marketAccessScore * 0.45 + logisticsFitScore * 0.3 + safetyConfidenceScore * 0.25,
  );
  const hourlySpendCapacity = Math.round(activeVehicles * 42 + traffic.averageSpeed * 180);
  const dailySpendPotential = hourlySpendCapacity * 12;
  const delayCostProxy = Math.round(activeVehicles * averageDelay * 3.25);
  const riskBand =
    safetyConfidenceScore < 55 || delayCostProxy > 600
      ? "Elevated"
      : safetyConfidenceScore < 75
        ? "Moderate"
        : "Low";

  return {
    accessFlow,
    commercialMobilityScore,
    dailySpendPotential,
    delayCostProxy,
    freightShare,
    hourlySpendCapacity,
    logisticsFitScore,
    marketAccessScore,
    retailReachScore,
    riskBand,
    safetyConfidenceScore,
  };
}

function score(value: number) {
  return Math.round(Math.max(0, Math.min(100, value)));
}

function getTrend(data: number[]): "up" | "down" | "stable" {
  if (data.length < 2) return "stable";

  const recent = data.slice(-10);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const lastValue = recent[recent.length - 1];

  if (lastValue > avg * 1.1) return "up";
  if (lastValue < avg * 0.9) return "down";
  return "stable";
}

function trendTextColor(trend: "up" | "down" | "stable") {
  if (trend === "up") return "text-emerald-700";
  if (trend === "down") return "text-rose-700";
  return "text-slate-500";
}

function severityColor(severity: "low" | "medium" | "high") {
  if (severity === "high") return "text-rose-700";
  if (severity === "medium") return "text-amber-700";
  return "text-blue-700";
}
