/**
 * Traffic Infrastructure Manager
 * Manages traffic signals, intersections, and stop signs
 */

import * as turf from '@turf/turf';
import * as THREE from 'three';

export type SignalState = 'red' | 'yellow' | 'green';
export type TrafficControlType = 'traffic_signals' | 'stop' | 'yield';

export interface TrafficSignalConfig {
  greenDuration: number;    // milliseconds
  yellowDuration: number;   // milliseconds
  redDuration: number;      // milliseconds
  coordinationOffset?: number; // milliseconds offset for coordinated signals
}

export interface TrafficSignal {
  id: string;
  position: [number, number]; // [lon, lat]
  type: TrafficControlType;
  state: SignalState;
  timer: number;              // timestamp of last state change
  intersectionId: string;
  direction: 'ns' | 'ew';     // north-south or east-west
  mesh?: THREE.Group;         // 3D visualization
  config: TrafficSignalConfig;
  nextStateTime: number;      // timestamp when state should change
}

export interface Intersection {
  id: string;
  position: [number, number]; // [lon, lat]
  nodeId: string;             // Road network node ID
  signals: string[];          // Signal IDs at this intersection
  stopSigns: string[];        // Stop sign IDs at this intersection
  priority: 'signalized' | 'all_way_stop' | 'two_way_stop' | 'yield';
  approachRoadIds: string[];  // Road edge IDs approaching this intersection
}

export interface StopSign {
  id: string;
  position: [number, number]; // [lon, lat]
  intersectionId: string;
  direction: 'ns' | 'ew';
  mesh?: THREE.Group;
}

const DEFAULT_SIGNAL_CONFIG: TrafficSignalConfig = {
  greenDuration: 8000,
  yellowDuration: 2000,
  redDuration: 8000,
};

export class TrafficInfrastructureManager {
  private signals: Map<string, TrafficSignal> = new Map();
  private intersections: Map<string, Intersection> = new Map();
  private stopSigns: Map<string, StopSign> = new Map();
  private signalsByIntersection: Map<string, string[]> = new Map();

  /**
   * Load traffic controls from OSM data
   */
  loadFromOSM(osmData: Array<{
    lat: number;
    lon: number;
    type: string;
    id: number;
  }>): void {
    console.log(`Loading ${osmData.length} traffic controls...`);

    // Group signals by proximity to identify intersections
    const intersectionMap = new Map<string, typeof osmData>();

    osmData.forEach((control) => {
      const position: [number, number] = [control.lon, control.lat];

      // Find nearby intersection (within 50 meters)
      let foundIntersection = false;
      for (const [intersectionId, controls] of intersectionMap.entries()) {
        const firstControl = controls[0];
        const distance = turf.distance(
          turf.point([firstControl.lon, firstControl.lat]),
          turf.point(position),
          { units: 'meters' }
        );

        if (distance < 50) {
          controls.push(control);
          foundIntersection = true;
          break;
        }
      }

      if (!foundIntersection) {
        intersectionMap.set(`intersection-${control.id}`, [control]);
      }
    });

    // Create intersections and signals
    let signalCount = 0;
    let stopCount = 0;

    intersectionMap.forEach((controls, intersectionId) => {
      const firstControl = controls[0];
      const position: [number, number] = [firstControl.lon, firstControl.lat];

      const intersection: Intersection = {
        id: intersectionId,
        position,
        nodeId: `node-${firstControl.id}`,
        signals: [],
        stopSigns: [],
        priority: 'signalized',
        approachRoadIds: [],
      };

      // Create signals for this intersection
      controls.forEach((control, idx) => {
        if (control.type === 'traffic_signals') {
          // Create ONLY ONE signal per OSM node (not NS and EW separately)
          const signal = this.createSignal(
            `signal-${control.id}`,
            [control.lon, control.lat],
            intersectionId,
            'ns', // Default to NS
            idx % 2 === 0 ? 'green' : 'red'
          );

          this.signals.set(signal.id, signal);
          intersection.signals.push(signal.id);
          signalCount += 1;
        } else if (control.type === 'stop') {
          const stopSign: StopSign = {
            id: `stop-${control.id}`,
            position: [control.lon, control.lat],
            intersectionId,
            direction: 'ns',
          };

          this.stopSigns.set(stopSign.id, stopSign);
          intersection.stopSigns.push(stopSign.id);
          intersection.priority = 'all_way_stop';
          stopCount++;
        }
      });

      this.intersections.set(intersectionId, intersection);

      if (intersection.signals.length > 0) {
        this.signalsByIntersection.set(intersectionId, intersection.signals);
      }
    });

    console.log(`✅ Created ${this.intersections.size} intersections`);
    console.log(`   - ${signalCount} traffic signals`);
    console.log(`   - ${stopCount} stop signs`);
  }

  /**
   * Create a traffic signal
   */
  private createSignal(
    id: string,
    position: [number, number],
    intersectionId: string,
    direction: 'ns' | 'ew',
    initialState: SignalState = 'red',
    config: TrafficSignalConfig = DEFAULT_SIGNAL_CONFIG
  ): TrafficSignal {
    const now = Date.now();
    return {
      id,
      position,
      type: 'traffic_signals',
      state: initialState,
      timer: now,
      intersectionId,
      direction,
      config,
      nextStateTime: now + config[`${initialState}Duration` as keyof TrafficSignalConfig],
    };
  }

  /**
   * Update all traffic signals
   */
  update(deltaTime: number): void {
    const now = Date.now();

    // Update signals by intersection to maintain coordination
    this.signalsByIntersection.forEach((signalIds, intersectionId) => {
      const signals = signalIds.map(id => this.signals.get(id)).filter(s => s) as TrafficSignal[];

      if (signals.length === 0) return;

      // Check if any signal needs to change state
      const primarySignal = signals[0];

      if (now >= primarySignal.nextStateTime) {
        this.transitionIntersectionSignals(intersectionId, signals, now);
      }
    });
  }

  /**
   * Transition signals at an intersection
   */
  private transitionIntersectionSignals(
    intersectionId: string,
    signals: TrafficSignal[],
    now: number
  ): void {
    // Group signals by direction
    const nsSignals = signals.filter(s => s.direction === 'ns');
    const ewSignals = signals.filter(s => s.direction === 'ew');

    // Determine transition
    const currentNsState = nsSignals[0]?.state;
    const currentEwState = ewSignals[0]?.state;

    if (currentNsState === 'green') {
      // NS going yellow
      nsSignals.forEach(s => this.setSignalState(s, 'yellow', now));
    } else if (currentNsState === 'yellow') {
      // NS going red, EW stays red (all-red phase)
      nsSignals.forEach(s => this.setSignalState(s, 'red', now));
    } else if (currentNsState === 'red' && currentEwState === 'red') {
      // All-red phase complete, EW can go green
      ewSignals.forEach(s => this.setSignalState(s, 'green', now));
    } else if (currentEwState === 'green') {
      // EW going yellow
      ewSignals.forEach(s => this.setSignalState(s, 'yellow', now));
    } else if (currentEwState === 'yellow') {
      // EW going red, NS stays red (all-red phase)
      ewSignals.forEach(s => this.setSignalState(s, 'red', now));
    } else if (currentEwState === 'red' && currentNsState === 'red') {
      // All-red phase complete, NS can go green
      nsSignals.forEach(s => this.setSignalState(s, 'green', now));
    }
  }

  /**
   * Set signal state
   */
  private setSignalState(signal: TrafficSignal, state: SignalState, now: number): void {
    signal.state = state;
    signal.timer = now;

    const duration = signal.config[`${state}Duration` as keyof TrafficSignalConfig];
    signal.nextStateTime = now + duration;
  }

  /**
   * Get signal state at a position
   */
  getSignalStateAtPosition(
    position: [number, number],
    maxDistance: number = 30
  ): SignalState | null {
    let closestSignal: TrafficSignal | null = null;
    let minDistance = Infinity;

    this.signals.forEach((signal) => {
      const distance = turf.distance(
        turf.point(position),
        turf.point(signal.position),
        { units: 'meters' }
      );

      if (distance < maxDistance && distance < minDistance) {
        minDistance = distance;
        closestSignal = signal;
      }
    });

    return closestSignal?.state || null;
  }

  /**
   * Check if vehicle should stop at position
   */
  shouldStopAtPosition(
    position: [number, number],
    velocity: number,
    heading: number,
    maxDistance: number = 30
  ): { shouldStop: boolean; reason?: string; distance?: number } {
    // Check traffic signals
    let closestSignal: TrafficSignal | null = null;
    let minSignalDistance = Infinity;

    this.signals.forEach((signal) => {
      const distance = turf.distance(
        turf.point(position),
        turf.point(signal.position),
        { units: 'meters' }
      );

      if (distance < maxDistance && distance < minSignalDistance) {
        // Check if signal is ahead (not behind)
        const bearing = turf.bearing(turf.point(position), turf.point(signal.position));
        const bearingDiff = Math.abs(((bearing - heading + 180) % 360) - 180);

        if (bearingDiff < 90) { // Signal is ahead
          minSignalDistance = distance;
          closestSignal = signal;
        }
      }
    });

    if (closestSignal && (closestSignal.state === 'red' || closestSignal.state === 'yellow')) {
      return {
        shouldStop: true,
        reason: closestSignal.state === 'red' ? 'red_light' : 'yellow_light',
        distance: minSignalDistance,
      };
    }

    // Check stop signs
    let closestStopSign: StopSign | null = null;
    let minStopDistance = Infinity;

    this.stopSigns.forEach((stopSign) => {
      const distance = turf.distance(
        turf.point(position),
        turf.point(stopSign.position),
        { units: 'meters' }
      );

      if (distance < 15 && distance < minStopDistance) {
        const bearing = turf.bearing(turf.point(position), turf.point(stopSign.position));
        const bearingDiff = Math.abs(((bearing - heading + 180) % 360) - 180);

        if (bearingDiff < 90) {
          minStopDistance = distance;
          closestStopSign = stopSign;
        }
      }
    });

    if (closestStopSign && minStopDistance < 10) {
      return {
        shouldStop: true,
        reason: 'stop_sign',
        distance: minStopDistance,
      };
    }

    return { shouldStop: false };
  }

  /**
   * Get all signals
   */
  getSignals(): TrafficSignal[] {
    return Array.from(this.signals.values());
  }

  /**
   * Get signal by ID
   */
  getSignal(id: string): TrafficSignal | undefined {
    return this.signals.get(id);
  }

  /**
   * Get all intersections
   */
  getIntersections(): Intersection[] {
    return Array.from(this.intersections.values());
  }

  /**
   * Get intersection by ID
   */
  getIntersection(id: string): Intersection | undefined {
    return this.intersections.get(id);
  }

  /**
   * Get all stop signs
   */
  getStopSigns(): StopSign[] {
    return Array.from(this.stopSigns.values());
  }

  /**
   * Set signal timing configuration
   */
  setSignalConfig(signalId: string, config: Partial<TrafficSignalConfig>): void {
    const signal = this.signals.get(signalId);
    if (signal) {
      signal.config = { ...signal.config, ...config };
    }
  }

  /**
   * Set intersection-wide signal timing
   */
  setIntersectionTiming(
    intersectionId: string,
    config: Partial<TrafficSignalConfig>
  ): void {
    const signalIds = this.signalsByIntersection.get(intersectionId);
    if (signalIds) {
      signalIds.forEach(id => this.setSignalConfig(id, config));
    }
  }

  /**
   * Enable signal coordination between intersections
   */
  coordinateSignals(
    signalIds: string[],
    cycleLength: number,
    offsets: number[]
  ): void {
    signalIds.forEach((id, index) => {
      const signal = this.signals.get(id);
      if (signal && offsets[index] !== undefined) {
        signal.config.coordinationOffset = offsets[index];
      }
    });
  }

  /**
   * Get statistics
   */
  getStats() {
    const totalSignals = this.signals.size;
    const activeSignals = Array.from(this.signals.values()).filter(s => s.state !== 'red').length;

    return {
      totalIntersections: this.intersections.size,
      totalSignals,
      activeSignals,
      totalStopSigns: this.stopSigns.size,
      signalStates: {
        red: Array.from(this.signals.values()).filter(s => s.state === 'red').length,
        yellow: Array.from(this.signals.values()).filter(s => s.state === 'yellow').length,
        green: Array.from(this.signals.values()).filter(s => s.state === 'green').length,
      },
    };
  }

  /**
   * Reset all signals to default state
   */
  reset(): void {
    this.signals.clear();
    this.intersections.clear();
    this.stopSigns.clear();
    this.signalsByIntersection.clear();
  }
}
