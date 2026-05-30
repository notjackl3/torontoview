/**
 * Traffic Analytics System
 * Comprehensive monitoring and metrics collection for traffic simulation
 */

import * as turf from '@turf/turf';
import { SpawnedCar } from './spawning';
import { RoadNetwork } from './roadNetwork';

export interface PerformanceMetrics {
  fps: number;
  frameTime: number; // ms
  updateTime: number; // ms
  renderTime: number; // ms
  memoryUsage?: number; // MB
}

export interface TrafficMetrics {
  vehicleCount: number;
  averageSpeed: number; // km/h
  totalVehiclesSpawned: number;
  totalVehiclesDespawned: number;
  vehiclesByType: {
    sedan: number;
    suv: number;
    truck: number;
    compact: number;
  };
}

export interface IntersectionMetrics {
  id: string;
  position: [number, number];
  averageDelay: number; // seconds
  totalCrossingVehicles: number;
  queueLength: number;
  cycleTime: number; // ms
}

export interface NearMissEvent {
  timestamp: number;
  car1Id: string;
  car2Id: string;
  distance: number; // meters
  position: [number, number];
  severity: 'low' | 'medium' | 'high';
}

export interface AnalyticsSnapshot {
  timestamp: number;
  performance: PerformanceMetrics;
  traffic: TrafficMetrics;
  intersections: IntersectionMetrics[];
  nearMisses: NearMissEvent[];
}

export interface AnalyticsConfig {
  enablePerformanceMonitoring: boolean;
  enableTrafficMetrics: boolean;
  enableIntersectionTracking: boolean;
  enableNearMissDetection: boolean;
  nearMissThreshold: number; // meters
  snapshotInterval: number; // ms
  maxHistoryLength: number;
}

const DEFAULT_CONFIG: AnalyticsConfig = {
  enablePerformanceMonitoring: true,
  enableTrafficMetrics: true,
  enableIntersectionTracking: true,
  enableNearMissDetection: true,
  nearMissThreshold: 5, // 5 meters
  snapshotInterval: 1000, // 1 second
  maxHistoryLength: 300, // 5 minutes at 1 second intervals
};

export class TrafficAnalytics {
  private config: AnalyticsConfig;
  private history: AnalyticsSnapshot[] = [];
  private lastSnapshotTime: number = 0;

  // Performance tracking
  private frameTimestamps: number[] = [];
  private frameTimes: number[] = [];
  private updateTimes: number[] = [];
  private renderTimes: number[] = [];

  // Traffic tracking
  private totalSpawned: number = 0;
  private totalDespawned: number = 0;
  private nearMissHistory: NearMissEvent[] = [];

  // Intersection tracking
  private intersectionData: Map<string, {
    delays: number[];
    crossings: number;
    queueLengths: number[];
  }> = new Map();

  constructor(config?: Partial<AnalyticsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update analytics with frame timing information
   */
  onFrameStart(timestamp: number): void {
    if (!this.config.enablePerformanceMonitoring) return;

    this.frameTimestamps.push(timestamp);

    // Keep only last 60 frames for FPS calculation
    if (this.frameTimestamps.length > 60) {
      this.frameTimestamps.shift();
    }
  }

  /**
   * Record frame time
   */
  recordFrameTime(time: number): void {
    if (!this.config.enablePerformanceMonitoring) return;

    this.frameTimes.push(time);
    if (this.frameTimes.length > 60) {
      this.frameTimes.shift();
    }
  }

  /**
   * Record update time
   */
  recordUpdateTime(time: number): void {
    if (!this.config.enablePerformanceMonitoring) return;

    this.updateTimes.push(time);
    if (this.updateTimes.length > 60) {
      this.updateTimes.shift();
    }
  }

  /**
   * Record render time
   */
  recordRenderTime(time: number): void {
    if (!this.config.enablePerformanceMonitoring) return;

    this.renderTimes.push(time);
    if (this.renderTimes.length > 60) {
      this.renderTimes.shift();
    }
  }

  /**
   * Calculate current FPS
   */
  private calculateFPS(): number {
    if (this.frameTimestamps.length < 2) return 0;

    const first = this.frameTimestamps[0];
    const last = this.frameTimestamps[this.frameTimestamps.length - 1];
    const duration = last - first;

    if (duration === 0) return 0;

    return Math.round((this.frameTimestamps.length - 1) / (duration / 1000));
  }

  /**
   * Get average of array
   */
  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      fps: this.calculateFPS(),
      frameTime: this.average(this.frameTimes),
      updateTime: this.average(this.updateTimes),
      renderTime: this.average(this.renderTimes),
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Get memory usage (if available)
   */
  private getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1048576); // Convert to MB
    }
    return undefined;
  }

  /**
   * Update traffic metrics
   */
  updateTrafficMetrics(activeCars: SpawnedCar[]): TrafficMetrics {
    if (!this.config.enableTrafficMetrics) {
      return {
        vehicleCount: 0,
        averageSpeed: 0,
        totalVehiclesSpawned: 0,
        totalVehiclesDespawned: 0,
        vehiclesByType: { sedan: 0, suv: 0, truck: 0, compact: 0 },
      };
    }

    const vehiclesByType = { sedan: 0, suv: 0, truck: 0, compact: 0 };
    let totalSpeed = 0;

    activeCars.forEach(car => {
      vehiclesByType[car.type]++;
      totalSpeed += car.speed;
    });

    return {
      vehicleCount: activeCars.length,
      averageSpeed: activeCars.length > 0 ? totalSpeed / activeCars.length : 0,
      totalVehiclesSpawned: this.totalSpawned,
      totalVehiclesDespawned: this.totalDespawned,
      vehiclesByType,
    };
  }

  /**
   * Track vehicle spawn
   */
  trackSpawn(): void {
    this.totalSpawned++;
  }

  /**
   * Track vehicle despawn
   */
  trackDespawn(): void {
    this.totalDespawned++;
  }

  /**
   * Detect near-miss events between vehicles
   */
  detectNearMisses(activeCars: SpawnedCar[], timestamp: number): NearMissEvent[] {
    if (!this.config.enableNearMissDetection) return [];

    const events: NearMissEvent[] = [];
    const threshold = this.config.nearMissThreshold;

    // Check all pairs of cars
    for (let i = 0; i < activeCars.length; i++) {
      for (let j = i + 1; j < activeCars.length; j++) {
        const car1 = activeCars[i];
        const car2 = activeCars[j];

        const distance = turf.distance(
          turf.point(car1.position),
          turf.point(car2.position),
          { units: 'meters' }
        );

        if (distance < threshold) {
          let severity: 'low' | 'medium' | 'high';
          if (distance < threshold * 0.4) {
            severity = 'high';
          } else if (distance < threshold * 0.7) {
            severity = 'medium';
          } else {
            severity = 'low';
          }

          const event: NearMissEvent = {
            timestamp,
            car1Id: car1.id,
            car2Id: car2.id,
            distance,
            position: car1.position,
            severity,
          };

          events.push(event);
          this.nearMissHistory.push(event);
        }
      }
    }

    // Keep only recent near misses (last 60 seconds)
    const cutoff = timestamp - 60000;
    this.nearMissHistory = this.nearMissHistory.filter(e => e.timestamp > cutoff);

    return events;
  }

  /**
   * Update intersection metrics
   */
  updateIntersection(
    intersectionId: string,
    position: [number, number],
    delay: number,
    queueLength: number
  ): void {
    if (!this.config.enableIntersectionTracking) return;

    if (!this.intersectionData.has(intersectionId)) {
      this.intersectionData.set(intersectionId, {
        delays: [],
        crossings: 0,
        queueLengths: [],
      });
    }

    const data = this.intersectionData.get(intersectionId)!;
    data.delays.push(delay);
    data.crossings++;
    data.queueLengths.push(queueLength);

    // Keep only last 100 measurements
    if (data.delays.length > 100) data.delays.shift();
    if (data.queueLengths.length > 100) data.queueLengths.shift();
  }

  /**
   * Get intersection metrics
   */
  getIntersectionMetrics(): IntersectionMetrics[] {
    const metrics: IntersectionMetrics[] = [];

    this.intersectionData.forEach((data, id) => {
      metrics.push({
        id,
        position: [0, 0], // TODO: Store position
        averageDelay: this.average(data.delays),
        totalCrossingVehicles: data.crossings,
        queueLength: this.average(data.queueLengths),
        cycleTime: 18000, // TODO: Calculate from traffic light cycles
      });
    });

    return metrics;
  }

  /**
   * Create snapshot of current analytics state
   */
  createSnapshot(activeCars: SpawnedCar[], timestamp: number): AnalyticsSnapshot | null {
    // Check if enough time has passed since last snapshot
    if (timestamp - this.lastSnapshotTime < this.config.snapshotInterval) {
      return null;
    }

    this.lastSnapshotTime = timestamp;

    const snapshot: AnalyticsSnapshot = {
      timestamp,
      performance: this.getPerformanceMetrics(),
      traffic: this.updateTrafficMetrics(activeCars),
      intersections: this.getIntersectionMetrics(),
      nearMisses: this.detectNearMisses(activeCars, timestamp),
    };

    this.history.push(snapshot);

    // Trim history if needed
    if (this.history.length > this.config.maxHistoryLength) {
      this.history.shift();
    }

    return snapshot;
  }

  /**
   * Get analytics history
   */
  getHistory(): AnalyticsSnapshot[] {
    return [...this.history];
  }

  /**
   * Get recent near misses
   */
  getRecentNearMisses(seconds: number = 60): NearMissEvent[] {
    const cutoff = Date.now() - seconds * 1000;
    return this.nearMissHistory.filter(e => e.timestamp > cutoff);
  }

  /**
   * Export analytics data as CSV
   */
  exportToCSV(): string {
    const headers = [
      'Timestamp',
      'FPS',
      'Frame Time (ms)',
      'Update Time (ms)',
      'Render Time (ms)',
      'Memory (MB)',
      'Vehicle Count',
      'Avg Speed (km/h)',
      'Total Spawned',
      'Total Despawned',
      'Sedans',
      'SUVs',
      'Trucks',
      'Compacts',
      'Near Misses',
    ];

    const rows = this.history.map(snapshot => [
      new Date(snapshot.timestamp).toISOString(),
      snapshot.performance.fps.toFixed(0),
      snapshot.performance.frameTime.toFixed(2),
      snapshot.performance.updateTime.toFixed(2),
      snapshot.performance.renderTime.toFixed(2),
      snapshot.performance.memoryUsage?.toFixed(2) || 'N/A',
      snapshot.traffic.vehicleCount,
      snapshot.traffic.averageSpeed.toFixed(2),
      snapshot.traffic.totalVehiclesSpawned,
      snapshot.traffic.totalVehiclesDespawned,
      snapshot.traffic.vehiclesByType.sedan,
      snapshot.traffic.vehiclesByType.suv,
      snapshot.traffic.vehiclesByType.truck,
      snapshot.traffic.vehiclesByType.compact,
      snapshot.nearMisses.length,
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  /**
   * Download CSV file
   */
  downloadCSV(filename: string = 'traffic-analytics.csv'): void {
    const csv = this.exportToCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Reset all analytics data
   */
  reset(): void {
    this.history = [];
    this.frameTimestamps = [];
    this.frameTimes = [];
    this.updateTimes = [];
    this.renderTimes = [];
    this.totalSpawned = 0;
    this.totalDespawned = 0;
    this.nearMissHistory = [];
    this.intersectionData.clear();
    this.lastSnapshotTime = 0;
  }
}
