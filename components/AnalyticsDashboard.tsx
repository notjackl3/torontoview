"use client";

import { useState, useEffect } from "react";
import {
  TrafficAnalytics,
  AnalyticsSnapshot,
  IntersectionMetrics,
} from "@/lib/analytics";

interface AnalyticsDashboardProps {
  analytics: TrafficAnalytics | null;
  visible: boolean;
  onClose: () => void;
}

export default function AnalyticsDashboard({
  analytics,
  visible,
  onClose,
}: AnalyticsDashboardProps) {
  const [currentSnapshot, setCurrentSnapshot] =
    useState<AnalyticsSnapshot | null>(null);
  const [history, setHistory] = useState<AnalyticsSnapshot[]>([]);
  const [selectedTab, setSelectedTab] = useState<
    "overview" | "performance" | "traffic" | "intersections" | "safety"
  >("overview");

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

  if (!visible) return null;

  const handleExportCSV = () => {
    if (analytics) {
      analytics.downloadCSV(
        `traffic-analytics-${new Date().toISOString().split("T")[0]}.csv`
      );
    }
  };

  const renderOverview = () => {
    if (!currentSnapshot) return null;
    const { performance, traffic } = currentSnapshot;

    return (
      <div className="space-y-6">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="FPS"
            value={performance.fps}
            unit=""
            color="text-green-500"
            trend={getTrend(history.map((s) => s.performance.fps))}
          />
          <MetricCard
            title="Active Vehicles"
            value={traffic.vehicleCount}
            unit=""
            color="text-blue-500"
            trend={getTrend(history.map((s) => s.traffic.vehicleCount))}
          />
          <MetricCard
            title="Avg Speed"
            value={traffic.averageSpeed.toFixed(1)}
            unit="km/h"
            color="text-purple-500"
            trend={getTrend(history.map((s) => s.traffic.averageSpeed))}
          />
          <MetricCard
            title="Near Misses"
            value={currentSnapshot.nearMisses.length}
            unit="/s"
            color="text-red-500"
            trend={getTrend(
              history.map((s) => s.nearMisses.length)
            )}
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="FPS Over Time">
            <MiniChart
              data={history.slice(-60).map((s) => s.performance.fps)}
              max={60}
              color="rgb(34, 197, 94)"
            />
          </ChartCard>
          <ChartCard title="Vehicle Count Over Time">
            <MiniChart
              data={history.slice(-60).map((s) => s.traffic.vehicleCount)}
              max={50}
              color="rgb(59, 130, 246)"
            />
          </ChartCard>
        </div>

        {/* Vehicle Type Distribution */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Vehicle Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <VehicleTypeBar
              type="Sedans"
              count={traffic.vehiclesByType.sedan}
              total={traffic.vehicleCount}
              color="bg-blue-500"
            />
            <VehicleTypeBar
              type="SUVs"
              count={traffic.vehiclesByType.suv}
              total={traffic.vehicleCount}
              color="bg-green-500"
            />
            <VehicleTypeBar
              type="Trucks"
              count={traffic.vehiclesByType.truck}
              total={traffic.vehicleCount}
              color="bg-yellow-500"
            />
            <VehicleTypeBar
              type="Compacts"
              count={traffic.vehiclesByType.compact}
              total={traffic.vehicleCount}
              color="bg-purple-500"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderPerformance = () => {
    if (!currentSnapshot) return null;
    const { performance } = currentSnapshot;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Frame Time"
            value={performance.frameTime.toFixed(2)}
            unit="ms"
            color="text-cyan-500"
          />
          <MetricCard
            title="Update Time"
            value={performance.updateTime.toFixed(2)}
            unit="ms"
            color="text-indigo-500"
          />
          <MetricCard
            title="Render Time"
            value={performance.renderTime.toFixed(2)}
            unit="ms"
            color="text-pink-500"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Frame Time History">
            <MiniChart
              data={history.slice(-60).map((s) => s.performance.frameTime)}
              max={33.33}
              color="rgb(6, 182, 212)"
            />
          </ChartCard>
          <ChartCard title="Update Time History">
            <MiniChart
              data={history.slice(-60).map((s) => s.performance.updateTime)}
              max={16.67}
              color="rgb(99, 102, 241)"
            />
          </ChartCard>
        </div>

        {performance.memoryUsage && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Memory Usage</h3>
            <div className="text-3xl font-bold text-orange-500">
              {performance.memoryUsage.toFixed(0)} MB
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTraffic = () => {
    if (!currentSnapshot) return null;
    const { traffic } = currentSnapshot;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Total Spawned"
            value={traffic.totalVehiclesSpawned}
            unit=""
            color="text-green-500"
          />
          <MetricCard
            title="Total Despawned"
            value={traffic.totalVehiclesDespawned}
            unit=""
            color="text-red-500"
          />
          <MetricCard
            title="Net Change"
            value={
              traffic.totalVehiclesSpawned - traffic.totalVehiclesDespawned
            }
            unit=""
            color="text-yellow-500"
          />
        </div>

        <ChartCard title="Average Speed Over Time">
          <MiniChart
            data={history.slice(-60).map((s) => s.traffic.averageSpeed)}
            max={60}
            color="rgb(168, 85, 247)"
          />
        </ChartCard>

        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">Speed Distribution</h3>
          <div className="text-sm text-gray-400">
            Current Average: {traffic.averageSpeed.toFixed(1)} km/h
          </div>
          <div className="mt-4 h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
              style={{ width: `${(traffic.averageSpeed / 60) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0 km/h</span>
            <span>60 km/h</span>
          </div>
        </div>
      </div>
    );
  };

  const renderIntersections = () => {
    if (!currentSnapshot) return null;

    return (
      <div className="space-y-4">
        {currentSnapshot.intersections.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
            No intersection data available
          </div>
        ) : (
          currentSnapshot.intersections.map((intersection) => (
            <IntersectionCard
              key={intersection.id}
              intersection={intersection}
            />
          ))
        )}
      </div>
    );
  };

  const renderSafety = () => {
    if (!analytics) return null;

    const recentNearMisses = analytics.getRecentNearMisses(60);
    const highSeverity = recentNearMisses.filter((m) => m.severity === "high");
    const mediumSeverity = recentNearMisses.filter(
      (m) => m.severity === "medium"
    );
    const lowSeverity = recentNearMisses.filter((m) => m.severity === "low");

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="High Severity"
            value={highSeverity.length}
            unit="events"
            color="text-red-500"
          />
          <MetricCard
            title="Medium Severity"
            value={mediumSeverity.length}
            unit="events"
            color="text-yellow-500"
          />
          <MetricCard
            title="Low Severity"
            value={lowSeverity.length}
            unit="events"
            color="text-blue-500"
          />
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-3">
            Recent Near Misses (Last 60s)
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentNearMisses.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No near misses detected
              </p>
            ) : (
              recentNearMisses.reverse().map((miss, idx) => (
                <div
                  key={idx}
                  className="bg-gray-700 rounded p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="text-sm font-mono">
                      {miss.car1Id.slice(0, 8)} ↔ {miss.car2Id.slice(0, 8)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(miss.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm">{miss.distance.toFixed(2)}m</div>
                    <div
                      className={`text-xs font-bold ${
                        miss.severity === "high"
                          ? "text-red-500"
                          : miss.severity === "medium"
                            ? "text-yellow-500"
                            : "text-blue-500"
                      }`}
                    >
                      {miss.severity.toUpperCase()}
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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold text-white">
            Traffic Analytics Dashboard
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white text-sm font-medium transition-colors"
            >
              Export CSV
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 px-6">
          <TabButton
            active={selectedTab === "overview"}
            onClick={() => setSelectedTab("overview")}
          >
            Overview
          </TabButton>
          <TabButton
            active={selectedTab === "performance"}
            onClick={() => setSelectedTab("performance")}
          >
            Performance
          </TabButton>
          <TabButton
            active={selectedTab === "traffic"}
            onClick={() => setSelectedTab("traffic")}
          >
            Traffic
          </TabButton>
          <TabButton
            active={selectedTab === "intersections"}
            onClick={() => setSelectedTab("intersections")}
          >
            Intersections
          </TabButton>
          <TabButton
            active={selectedTab === "safety"}
            onClick={() => setSelectedTab("safety")}
          >
            Safety
          </TabButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedTab === "overview" && renderOverview()}
          {selectedTab === "performance" && renderPerformance()}
          {selectedTab === "traffic" && renderTraffic()}
          {selectedTab === "intersections" && renderIntersections()}
          {selectedTab === "safety" && renderSafety()}
        </div>
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
      className={`px-6 py-3 text-sm font-medium transition-colors ${
        active
          ? "text-blue-500 border-b-2 border-blue-500"
          : "text-gray-400 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function MetricCard({
  title,
  value,
  unit,
  color,
  trend,
}: {
  title: string;
  value: number | string;
  unit: string;
  color: string;
  trend?: "up" | "down" | "stable";
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-1">{title}</div>
      <div className="flex items-end justify-between">
        <div className={`text-3xl font-bold ${color}`}>
          {value}
          <span className="text-base ml-1">{unit}</span>
        </div>
        {trend && (
          <div
            className={`text-xs ${
              trend === "up"
                ? "text-green-500"
                : trend === "down"
                  ? "text-red-500"
                  : "text-gray-500"
            }`}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm text-gray-400 mb-3">{title}</h3>
      {children}
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
    return <div className="h-24 flex items-center justify-center text-gray-500">No data</div>;
  }

  const width = 100;
  const height = 100;
  const padding = 5;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1 || 1)) * (width - padding * 2) + padding;
    const y = height - (value / max) * (height - padding * 2) - padding;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-24"
      preserveAspectRatio="none"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
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
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{type}</span>
        <span className="text-white font-semibold">{count}</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500 mt-1">
        {percentage.toFixed(1)}%
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
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold">Intersection {intersection.id}</h3>
        <span className="text-xs text-gray-400">
          Cycle: {(intersection.cycleTime / 1000).toFixed(0)}s
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-400">Avg Delay</div>
          <div className="text-lg font-semibold text-yellow-500">
            {intersection.averageDelay.toFixed(1)}s
          </div>
        </div>
        <div>
          <div className="text-gray-400">Queue Length</div>
          <div className="text-lg font-semibold text-blue-500">
            {intersection.queueLength.toFixed(1)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">Crossings</div>
          <div className="text-lg font-semibold text-green-500">
            {intersection.totalCrossingVehicles}
          </div>
        </div>
      </div>
    </div>
  );
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
