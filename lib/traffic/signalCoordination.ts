/**
 * Traffic Signal Coordination System
 *
 * Implements "green wave" coordination for traffic signals along corridors.
 * This creates synchronized signal timing so vehicles traveling at the target
 * speed can pass through multiple green lights without stopping.
 *
 * Key concepts:
 * - Corridor: A series of signals along the same road
 * - Offset: Time delay between signal phase changes
 * - Green wave: Progression of green lights at constant speed
 *
 * Algorithm:
 * 1. Detect corridors (signals on same road within 500m)
 * 2. Calculate bearing between consecutive signals
 * 3. Group signals with similar bearings (<30° variance)
 * 4. Calculate timing offsets based on distance and target speed
 * 5. Apply offsets to signal phase timers
 */

import * as turf from '@turf/turf';
import { TrafficSignal, TrafficInfrastructureManager } from '../trafficInfrastructure';

export interface Corridor {
  id: string;
  signals: string[]; // Signal IDs in order along corridor
  direction: number; // Average bearing
  length: number; // Total corridor length in meters
  targetSpeed: number; // Target speed for green wave (km/h)
  offsets: number[]; // Time offset for each signal (ms)
}

export interface CorridorAnalysis {
  corridors: Corridor[];
  uncoordinatedSignals: string[]; // Signals not in any corridor
  stats: {
    totalCorridors: number;
    totalSignalsCoordinated: number;
    averageCorridorLength: number;
  };
}

export class SignalCoordinator {
  private corridors: Map<string, Corridor> = new Map();
  private signalToCorridorMap: Map<string, string> = new Map();

  /**
   * Analyze traffic signals and identify corridors
   */
  analyzeCorridors(
    signals: TrafficSignal[],
    maxCorridorSpacing: number = 500,
    bearingVarianceThreshold: number = 30
  ): CorridorAnalysis {
    console.log(`Analyzing ${signals.length} signals for corridor detection...`);

    // Group signals by proximity
    const clusters = this.clusterSignalsByProximity(signals, maxCorridorSpacing);

    // Analyze each cluster for corridor potential
    const corridors: Corridor[] = [];
    const coordinatedSignalIds = new Set<string>();

    clusters.forEach((cluster, index) => {
      if (cluster.length < 2) {
        return; // Need at least 2 signals for a corridor
      }

      // Calculate bearings between consecutive signals
      const bearings: number[] = [];
      for (let i = 0; i < cluster.length - 1; i++) {
        const bearing = turf.bearing(
          turf.point(cluster[i].position),
          turf.point(cluster[i + 1].position)
        );
        bearings.push(bearing);
      }

      // Check if bearings are consistent (corridor-like)
      const avgBearing = bearings.reduce((sum, b) => sum + b, 0) / bearings.length;
      const bearingVariance = Math.max(
        ...bearings.map((b) => Math.abs(((b - avgBearing + 180) % 360) - 180))
      );

      if (bearingVariance < bearingVarianceThreshold) {
        // This is a valid corridor
        const corridor = this.createCorridor(
          `corridor-${index}`,
          cluster,
          avgBearing,
          50 // Default target speed 50 km/h
        );

        corridors.push(corridor);
        corridor.signals.forEach((signalId) => {
          coordinatedSignalIds.add(signalId);
          this.signalToCorridorMap.set(signalId, corridor.id);
        });

        this.corridors.set(corridor.id, corridor);

        console.log(
          `  ✅ Corridor ${corridor.id}: ${corridor.signals.length} signals, ` +
            `${corridor.length.toFixed(0)}m, bearing ${avgBearing.toFixed(0)}°`
        );
      }
    });

    // Find uncoordinated signals
    const uncoordinatedSignals = signals
      .filter((s) => !coordinatedSignalIds.has(s.id))
      .map((s) => s.id);

    const stats = {
      totalCorridors: corridors.length,
      totalSignalsCoordinated: coordinatedSignalIds.size,
      averageCorridorLength:
        corridors.length > 0
          ? corridors.reduce((sum, c) => sum + c.length, 0) / corridors.length
          : 0,
    };

    console.log(`✅ Found ${stats.totalCorridors} corridors`);
    console.log(`   - ${stats.totalSignalsCoordinated} signals coordinated`);
    console.log(`   - ${uncoordinatedSignals.length} signals uncoordinated`);

    return {
      corridors,
      uncoordinatedSignals,
      stats,
    };
  }

  /**
   * Calculate timing offsets for green wave progression
   */
  calculateTimingOffsets(corridor: Corridor, targetSpeed: number): number[] {
    const speedMs = targetSpeed / 3.6; // Convert km/h to m/s
    const offsets: number[] = [0]; // First signal has no offset

    // Get corridor signals from infrastructure manager
    let cumulativeDistance = 0;

    for (let i = 1; i < corridor.signals.length; i++) {
      // Calculate distance from previous signal
      // Note: In real implementation, this would use actual signal positions
      // For now, we approximate based on corridor length
      const segmentDistance = corridor.length / (corridor.signals.length - 1);

      cumulativeDistance += segmentDistance;

      // Calculate time offset: offset = distance / speed
      const timeOffset = (cumulativeDistance / speedMs) * 1000; // Convert to ms

      offsets.push(timeOffset);
    }

    return offsets;
  }

  /**
   * Apply coordination to signals
   */
  applyCoordination(
    infrastructureManager: TrafficInfrastructureManager,
    corridors: Corridor[]
  ): void {
    console.log(`Applying coordination to ${corridors.length} corridors...`);

    corridors.forEach((corridor) => {
      // Recalculate offsets with corridor's target speed
      corridor.offsets = this.calculateTimingOffsets(corridor, corridor.targetSpeed);

      // Apply to infrastructure manager
      infrastructureManager.coordinateSignals(
        corridor.signals,
        8000, // Cycle length (8 seconds per phase)
        corridor.offsets
      );

      console.log(
        `  ✅ Applied coordination to ${corridor.id}: ` +
          `offsets = [${corridor.offsets.map((o) => o.toFixed(0)).join(', ')}]ms`
      );
    });
  }

  /**
   * Update corridor target speed
   */
  updateCorridorSpeed(corridorId: string, targetSpeed: number): void {
    const corridor = this.corridors.get(corridorId);
    if (corridor) {
      corridor.targetSpeed = targetSpeed;
      corridor.offsets = this.calculateTimingOffsets(corridor, targetSpeed);
    }
  }

  /**
   * Get all corridors
   */
  getCorridors(): Corridor[] {
    return Array.from(this.corridors.values());
  }

  /**
   * Get corridor by ID
   */
  getCorridor(corridorId: string): Corridor | undefined {
    return this.corridors.get(corridorId);
  }

  /**
   * Get corridor for a signal
   */
  getCorridorForSignal(signalId: string): Corridor | undefined {
    const corridorId = this.signalToCorridorMap.get(signalId);
    return corridorId ? this.corridors.get(corridorId) : undefined;
  }

  /**
   * Check if a signal is coordinated
   */
  isSignalCoordinated(signalId: string): boolean {
    return this.signalToCorridorMap.has(signalId);
  }

  /**
   * Get statistics
   */
  getStats() {
    const corridors = Array.from(this.corridors.values());

    return {
      totalCorridors: corridors.length,
      totalSignalsCoordinated: this.signalToCorridorMap.size,
      averageCorridorLength:
        corridors.length > 0
          ? corridors.reduce((sum, c) => sum + c.length, 0) / corridors.length
          : 0,
      averageSignalsPerCorridor:
        corridors.length > 0
          ? corridors.reduce((sum, c) => sum + c.signals.length, 0) / corridors.length
          : 0,
      corridors: corridors.map((c) => ({
        id: c.id,
        signalCount: c.signals.length,
        length: c.length,
        targetSpeed: c.targetSpeed,
      })),
    };
  }

  /**
   * Reset all coordination
   */
  reset(): void {
    this.corridors.clear();
    this.signalToCorridorMap.clear();
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Cluster signals by proximity
   */
  private clusterSignalsByProximity(
    signals: TrafficSignal[],
    maxDistance: number
  ): TrafficSignal[][] {
    const clusters: TrafficSignal[][] = [];
    const processed = new Set<string>();

    signals.forEach((signal) => {
      if (processed.has(signal.id)) return;

      const cluster: TrafficSignal[] = [signal];
      processed.add(signal.id);

      // Find nearby signals
      signals.forEach((otherSignal) => {
        if (processed.has(otherSignal.id)) return;

        const distance = turf.distance(
          turf.point(signal.position),
          turf.point(otherSignal.position),
          { units: 'meters' }
        );

        if (distance < maxDistance) {
          cluster.push(otherSignal);
          processed.add(otherSignal.id);
        }
      });

      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    });

    return clusters;
  }

  /**
   * Create a corridor from a cluster of signals
   */
  private createCorridor(
    id: string,
    signals: TrafficSignal[],
    direction: number,
    targetSpeed: number
  ): Corridor {
    // Sort signals along the corridor direction
    const sortedSignals = this.sortSignalsAlongBearing(signals, direction);

    // Calculate total corridor length
    let totalLength = 0;
    for (let i = 0; i < sortedSignals.length - 1; i++) {
      const distance = turf.distance(
        turf.point(sortedSignals[i].position),
        turf.point(sortedSignals[i + 1].position),
        { units: 'meters' }
      );
      totalLength += distance;
    }

    // Calculate initial offsets
    const corridor: Corridor = {
      id,
      signals: sortedSignals.map((s) => s.id),
      direction,
      length: totalLength,
      targetSpeed,
      offsets: [],
    };

    corridor.offsets = this.calculateTimingOffsets(corridor, targetSpeed);

    return corridor;
  }

  /**
   * Sort signals along a bearing (to establish corridor order)
   */
  private sortSignalsAlongBearing(signals: TrafficSignal[], bearing: number): TrafficSignal[] {
    if (signals.length <= 1) return signals;

    // Use first signal as reference point
    const reference = signals[0];

    // Calculate distance along bearing for each signal
    const signalsWithDistance = signals.map((signal) => {
      const distance = turf.distance(
        turf.point(reference.position),
        turf.point(signal.position),
        { units: 'meters' }
      );

      const signalBearing = turf.bearing(
        turf.point(reference.position),
        turf.point(signal.position)
      );

      // Calculate signed distance along bearing
      const bearingDiff = ((signalBearing - bearing + 180) % 360) - 180;
      const signedDistance = distance * Math.cos((bearingDiff * Math.PI) / 180);

      return { signal, signedDistance };
    });

    // Sort by signed distance
    signalsWithDistance.sort((a, b) => a.signedDistance - b.signedDistance);

    return signalsWithDistance.map((item) => item.signal);
  }

  /**
   * Optimize corridor timing based on traffic patterns
   * This is a placeholder for future ML-based optimization
   */
  optimizeCorridorTiming(
    corridorId: string,
    trafficData: {
      signalId: string;
      avgWaitTime: number;
      throughput: number;
    }[]
  ): void {
    const corridor = this.corridors.get(corridorId);
    if (!corridor) return;

    // Future: Use ML to optimize timing based on:
    // - Average wait times at each signal
    // - Traffic throughput
    // - Time of day patterns
    // - Queue lengths

    console.log(`TODO: Implement ML-based optimization for ${corridorId}`);
  }
}

/**
 * Helper function to create and configure a signal coordinator
 */
export function createSignalCoordinator(
  infrastructureManager: TrafficInfrastructureManager,
  autoAnalyze: boolean = true
): SignalCoordinator {
  const coordinator = new SignalCoordinator();

  if (autoAnalyze) {
    const signals = infrastructureManager.getSignals();
    const analysis = coordinator.analyzeCorridors(signals);
    coordinator.applyCoordination(infrastructureManager, analysis.corridors);
  }

  return coordinator;
}

/**
 * Preset corridor configurations for known roads
 */
export const PRESET_CORRIDORS = {
  // Princess Street (major east-west corridor)
  princess_street: {
    targetSpeed: 50, // km/h
    maxSpacing: 500, // meters
    bearingVariance: 30, // degrees
  },

  // University Avenue (north-south corridor)
  university_avenue: {
    targetSpeed: 50,
    maxSpacing: 400,
    bearingVariance: 25,
  },

  // Division Street (north-south corridor)
  division_street: {
    targetSpeed: 60,
    maxSpacing: 600,
    bearingVariance: 35,
  },

  // Union Street (east-west corridor)
  union_street: {
    targetSpeed: 50,
    maxSpacing: 500,
    bearingVariance: 30,
  },
};
