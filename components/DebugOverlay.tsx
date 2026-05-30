"use client";

import { useState, useEffect } from "react";
import {
  TrafficAnalytics,
  AnalyticsSnapshot,
  NearMissEvent,
} from "@/lib/analytics";

export interface ConstructionZoneMetrics {
  vehiclesInZone: number;
  avgSpeedInZone: number;
}

interface DebugOverlayProps {
  analytics: TrafficAnalytics | null;
  visible: boolean;
  onToggle: () => void;
  /** When set (e.g. when portaled above sidebars), overlay is positioned in center */
  className?: string;
  /** Live construction zone metrics from the animation loop */
  constructionZone?: ConstructionZoneMetrics | null;
}

export default function DebugOverlay({
  analytics,
  visible,
  onToggle,
  className,
  constructionZone,
}: DebugOverlayProps) {
  const [currentSnapshot, setCurrentSnapshot] =
    useState<AnalyticsSnapshot | null>(null);
  const [recentNearMisses, setRecentNearMisses] = useState<NearMissEvent[]>([]);

  useEffect(() => {
    if (!analytics || !visible) return;

    const interval = setInterval(() => {
      const history = analytics.getHistory();
      if (history.length > 0) {
        setCurrentSnapshot(history[history.length - 1]);
      }
      setRecentNearMisses(analytics.getRecentNearMisses(10));
    }, 100); // Update 10 times per second for smooth display

    return () => clearInterval(interval);
  }, [analytics, visible]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "F3") {
        e.preventDefault();
        onToggle();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [onToggle]);

  if (!visible || !currentSnapshot) return null;

  const { performance, traffic, nearMisses } = currentSnapshot;

  // FPS color coding
  const getFPSColor = (fps: number) => {
    if (fps >= 55) return "text-green-400";
    if (fps >= 30) return "text-yellow-400";
    return "text-red-400";
  };

  // Near miss severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "text-red-400";
      case "medium":
        return "text-yellow-400";
      default:
        return "text-blue-400";
    }
  };

  return (
    <div className={className ?? "fixed top-4 left-4 z-50 pointer-events-none select-none"}>
      <div className="bg-black/80 text-white p-4 rounded-lg font-mono text-sm space-y-3 pointer-events-auto backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-600 pb-2 mb-2">
          <h3 className="font-bold text-lg">Debug Overlay</h3>
          <span className="text-xs text-gray-400">Press F3 to toggle</span>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-1">
          <h4 className="text-yellow-400 font-semibold">Performance</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">FPS:</span>
              <span className={`font-bold ${getFPSColor(performance.fps)}`}>
                {performance.fps}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Frame:</span>
              <span>{performance.frameTime.toFixed(2)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Update:</span>
              <span>{performance.updateTime.toFixed(2)}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Render:</span>
              <span>{performance.renderTime.toFixed(2)}ms</span>
            </div>
            {performance.memoryUsage && (
              <div className="flex justify-between col-span-2">
                <span className="text-gray-400">Memory:</span>
                <span>{performance.memoryUsage.toFixed(0)} MB</span>
              </div>
            )}
          </div>
        </div>

        {/* Traffic Metrics */}
        <div className="space-y-1">
          <h4 className="text-blue-400 font-semibold">Traffic</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Vehicles:</span>
              <span className="font-bold text-cyan-400">
                {traffic.vehicleCount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Avg Speed:</span>
              <span>{traffic.averageSpeed.toFixed(1)} km/h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Spawned:</span>
              <span className="text-green-400">
                +{traffic.totalVehiclesSpawned}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Despawned:</span>
              <span className="text-red-400">-{traffic.totalVehiclesDespawned}</span>
            </div>
          </div>
        </div>

        {/* Vehicle Types */}
        <div className="space-y-1">
          <h4 className="text-purple-400 font-semibold">Vehicle Types</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Sedans:</span>
              <span>{traffic.vehiclesByType.sedan}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">SUVs:</span>
              <span>{traffic.vehiclesByType.suv}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Trucks:</span>
              <span>{traffic.vehiclesByType.truck}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Compacts:</span>
              <span>{traffic.vehiclesByType.compact}</span>
            </div>
          </div>
        </div>

        {/* Construction Zone */}
        {constructionZone && constructionZone.vehiclesInZone > 0 && (
          <div className="space-y-1">
            <h4 className="text-orange-400 font-semibold flex items-center gap-2">
              Construction Zone
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            </h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Vehicles in zone:</span>
                <span className="font-bold text-red-400">{constructionZone.vehiclesInZone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Avg speed:</span>
                <span className="text-orange-300">{constructionZone.avgSpeedInZone.toFixed(1)} km/h</span>
              </div>
              <div className="flex justify-between col-span-2">
                <span className="text-gray-400">Speed limit:</span>
                <span className="text-red-300">10 km/h</span>
              </div>
            </div>
            <p className="text-xs text-orange-300/70 italic">Vehicles slowing for safety</p>
          </div>
        )}

        {/* Near Misses */}
        <div className="space-y-1">
          <h4 className="text-red-400 font-semibold">
            Near Misses (Last 10s)
          </h4>
          {recentNearMisses.length === 0 ? (
            <p className="text-xs text-gray-500">No near misses detected</p>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {recentNearMisses.slice(-5).map((miss, idx) => (
                <div
                  key={idx}
                  className="text-xs flex justify-between items-center"
                >
                  <span className="text-gray-400">
                    {miss.car1Id.slice(0, 8)} ↔ {miss.car2Id.slice(0, 8)}
                  </span>
                  <div className="flex gap-2 items-center">
                    <span>{miss.distance.toFixed(2)}m</span>
                    <span
                      className={`font-bold ${getSeverityColor(miss.severity)}`}
                    >
                      {miss.severity.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-gray-400 pt-1 border-t border-gray-700">
            Total in last 10s: {recentNearMisses.length}
          </div>
        </div>
      </div>
    </div>
  );
}
