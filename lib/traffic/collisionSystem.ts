/**
 * Collision Detection System with Spatial Grid Optimization
 *
 * Uses a spatial grid to reduce collision checks from O(n²) to O(n)
 * - Grid size: 50m x 50m cells
 * - Checks only vehicles in same or adjacent cells (9 cells total)
 * - Predictive collision detection: looks ahead 2 seconds
 * - Safety bubble: 5m radius around vehicle center
 *
 * Optimized for 100+ vehicles at 60 FPS
 */

import * as turf from '@turf/turf';
import { SpawnedCar } from '../spawning';

export interface CollisionInfo {
  detected: boolean;
  nearestDistance: number;
  timeToCollision: number | null;
  targetCarId: string | null;
}

export interface GridCell {
  x: number;
  y: number;
  vehicles: Set<string>;
}

export interface CollisionSystemConfig {
  gridCellSize: number; // Size of each grid cell in meters
  safetyBubbleRadius: number; // Safety radius around vehicles in meters
  predictionTimeHorizon: number; // How far ahead to predict (seconds)
  emergencyBrakeThreshold: number; // Time to collision for emergency brake (seconds)
}

const DEFAULT_CONFIG: CollisionSystemConfig = {
  gridCellSize: 50, // 50m x 50m cells
  safetyBubbleRadius: 4, // 4m safety bubble (tighter to avoid overlap)
  predictionTimeHorizon: 2.5, // 2.5 seconds ahead
  emergencyBrakeThreshold: 2.0, // Emergency brake if collision within 2s (react earlier)
};

export class CollisionSystem {
  private config: CollisionSystemConfig;
  private grid: Map<string, GridCell> = new Map();
  private vehicleToCell: Map<string, string> = new Map();
  private minLat: number = 0;
  private minLon: number = 0;
  private maxLat: number = 0;
  private maxLon: number = 0;

  constructor(config?: Partial<CollisionSystemConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the bounding box for the simulation area
   * This is used to properly initialize the spatial grid
   */
  setBounds(minLat: number, minLon: number, maxLat: number, maxLon: number): void {
    this.minLat = minLat;
    this.minLon = minLon;
    this.maxLat = maxLat;
    this.maxLon = maxLon;
  }

  /**
   * Update the spatial grid with current vehicle positions
   * Call this once per frame before checking collisions
   *
   * Time complexity: O(n) where n is number of vehicles
   */
  updateGrid(vehicles: SpawnedCar[]): void {
    // Clear previous grid
    this.grid.clear();
    this.vehicleToCell.clear();

    // Insert each vehicle into appropriate grid cell
    for (const vehicle of vehicles) {
      const cellKey = this.getCellKey(vehicle.position);

      // Create cell if it doesn't exist
      if (!this.grid.has(cellKey)) {
        const [x, y] = this.parseCellKey(cellKey);
        this.grid.set(cellKey, {
          x,
          y,
          vehicles: new Set(),
        });
      }

      // Add vehicle to cell
      const cell = this.grid.get(cellKey)!;
      cell.vehicles.add(vehicle.id);
      this.vehicleToCell.set(vehicle.id, cellKey);
    }
  }

  /**
   * Get vehicles within a radius of a given car
   * Only checks vehicles in same and adjacent grid cells (9 cells total)
   *
   * Time complexity: O(k) where k is vehicles in nearby cells (typically << n)
   */
  getNearbyVehicles(car: SpawnedCar, radius: number, allVehicles: Map<string, SpawnedCar>): SpawnedCar[] {
    const nearby: SpawnedCar[] = [];
    const cellKey = this.vehicleToCell.get(car.id);

    if (!cellKey) {
      return nearby;
    }

    const [centerX, centerY] = this.parseCellKey(cellKey);

    // Check this cell and all 8 adjacent cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const adjacentKey = this.makeCellKey(centerX + dx, centerY + dy);
        const adjacentCell = this.grid.get(adjacentKey);

        if (!adjacentCell) continue;

        // Check each vehicle in this cell
        for (const vehicleId of adjacentCell.vehicles) {
          if (vehicleId === car.id) continue;

          const otherVehicle = allVehicles.get(vehicleId);
          if (!otherVehicle) continue;

          const distance = turf.distance(
            turf.point(car.position),
            turf.point(otherVehicle.position),
            { units: 'meters' }
          );

          if (distance <= radius) {
            nearby.push(otherVehicle);
          }
        }
      }
    }

    return nearby;
  }

  /**
   * Check for immediate collisions (safety bubble violation)
   * Returns the nearest vehicle within safety radius
   */
  checkImmediateCollision(car: SpawnedCar, allVehicles: Map<string, SpawnedCar>): CollisionInfo {
    const nearby = this.getNearbyVehicles(
      car,
      this.config.safetyBubbleRadius * 2, // Check slightly beyond safety bubble
      allVehicles
    );

    let nearestDistance = Infinity;
    let nearestCarId: string | null = null;

    for (const otherCar of nearby) {
      const distance = turf.distance(
        turf.point(car.position),
        turf.point(otherCar.position),
        { units: 'meters' }
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCarId = otherCar.id;
      }
    }

    const detected = nearestDistance < this.config.safetyBubbleRadius * 2;

    return {
      detected,
      nearestDistance,
      timeToCollision: null,
      targetCarId: nearestCarId,
    };
  }

  /**
   * Predictive collision detection: project vehicle positions forward in time
   * Returns true if a collision is predicted within the time horizon
   *
   * Algorithm:
   * 1. Project car's position forward based on current speed and bearing
   * 2. Check if projected path intersects with nearby vehicles' projected paths
   * 3. Calculate time to collision if paths intersect
   */
  checkPredictiveCollision(
    car: SpawnedCar,
    allVehicles: Map<string, SpawnedCar>,
    timeHorizon?: number
  ): CollisionInfo {
    const horizon = timeHorizon ?? this.config.predictionTimeHorizon;

    // Get nearby vehicles (expand search radius based on speed)
    const searchRadius = Math.max(
      50, // Minimum 50m search radius
      (car.speed / 3.6) * horizon + this.config.safetyBubbleRadius * 2
    );

    const nearby = this.getNearbyVehicles(car, searchRadius, allVehicles);

    let minTimeToCollision = Infinity;
    let targetCarId: string | null = null;
    let nearestDistance = Infinity;

    // Project this car's position forward
    const carSpeedMs = car.speed / 3.6; // Convert km/h to m/s

    // Sample multiple points along the predicted path (every 0.5 seconds)
    const numSamples = Math.ceil(horizon / 0.5);

    for (let i = 1; i <= numSamples; i++) {
      const t = (i / numSamples) * horizon;
      const projectedPos = this.projectPosition(car.position, car.bearing, carSpeedMs * t);

      // Check against each nearby vehicle
      for (const otherCar of nearby) {
        const otherSpeedMs = otherCar.speed / 3.6;
        const otherProjectedPos = this.projectPosition(
          otherCar.position,
          otherCar.bearing,
          otherSpeedMs * t
        );

        const distance = turf.distance(
          turf.point(projectedPos),
          turf.point(otherProjectedPos),
          { units: 'meters' }
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
        }

        // Check if paths will intersect (within safety bubble)
        if (distance < this.config.safetyBubbleRadius * 2) {
          if (t < minTimeToCollision) {
            minTimeToCollision = t;
            targetCarId = otherCar.id;
          }
        }
      }
    }

    const detected = minTimeToCollision < Infinity;

    return {
      detected,
      nearestDistance,
      timeToCollision: detected ? minTimeToCollision : null,
      targetCarId,
    };
  }

  /**
   * Check if emergency braking is required
   * Returns true if a collision is imminent (within emergency threshold)
   * or if cars are already too close (overlap / near overlap)
   */
  requiresEmergencyBrake(car: SpawnedCar, allVehicles: Map<string, SpawnedCar>): boolean {
    // Already overlapping or very close — brake immediately
    const immediate = this.checkImmediateCollision(car, allVehicles);
    if (immediate.detected && immediate.nearestDistance < this.config.safetyBubbleRadius * 2.5) {
      return true;
    }

    const prediction = this.checkPredictiveCollision(car, allVehicles);
    if (!prediction.detected || prediction.timeToCollision === null) {
      return false;
    }

    return prediction.timeToCollision <= this.config.emergencyBrakeThreshold;
  }

  /**
   * Get the minimum safe following distance for a given speed
   * Based on the 2-second rule (distance = speed * 2 seconds)
   */
  getSafeFollowingDistance(speedKmh: number): number {
    const speedMs = speedKmh / 3.6;
    return Math.max(
      this.config.safetyBubbleRadius * 2,
      speedMs * 2 // 2-second following distance
    );
  }

  /**
   * Check if it's safe to change lanes or merge
   * Checks both current and target lane for conflicts
   */
  isSafeToChangeLane(
    car: SpawnedCar,
    targetPosition: [number, number],
    allVehicles: Map<string, SpawnedCar>
  ): boolean {
    // Create a virtual car at target position to check for conflicts
    const virtualCar: SpawnedCar = {
      ...car,
      position: targetPosition,
    };

    // Check immediate collision at target position
    const immediate = this.checkImmediateCollision(virtualCar, allVehicles);
    if (immediate.detected) {
      return false;
    }

    // Check predictive collision at target position
    const predictive = this.checkPredictiveCollision(
      virtualCar,
      allVehicles,
      1.0 // Check 1 second ahead for lane changes
    );

    return !predictive.detected;
  }

  /**
   * Get grid statistics (useful for debugging/analytics)
   */
  getGridStats(): {
    totalCells: number;
    occupiedCells: number;
    averageVehiclesPerCell: number;
    maxVehiclesInCell: number;
  } {
    let totalVehicles = 0;
    let maxVehicles = 0;

    for (const cell of this.grid.values()) {
      const count = cell.vehicles.size;
      totalVehicles += count;
      maxVehicles = Math.max(maxVehicles, count);
    }

    const occupiedCells = this.grid.size;

    return {
      totalCells: this.grid.size,
      occupiedCells,
      averageVehiclesPerCell: occupiedCells > 0 ? totalVehicles / occupiedCells : 0,
      maxVehiclesInCell: maxVehicles,
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<CollisionSystemConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): CollisionSystemConfig {
    return { ...this.config };
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Project a position forward based on bearing and distance
   */
  private projectPosition(
    position: [number, number],
    bearing: number,
    distanceMeters: number
  ): [number, number] {
    const point = turf.point(position);
    const destination = turf.destination(point, distanceMeters / 1000, bearing, {
      units: 'kilometers',
    });
    return destination.geometry.coordinates as [number, number];
  }

  /**
   * Get grid cell key for a position
   * Format: "x,y" where x and y are cell coordinates
   */
  private getCellKey(position: [number, number]): string {
    const [lon, lat] = position;

    // Convert lat/lon to approximate meters (rough approximation)
    // 1 degree latitude ≈ 111km
    // 1 degree longitude ≈ 111km * cos(latitude)
    const latMeters = (lat - this.minLat) * 111000;
    const lonMeters = (lon - this.minLon) * 111000 * Math.cos((lat * Math.PI) / 180);

    // Calculate cell coordinates
    const cellX = Math.floor(lonMeters / this.config.gridCellSize);
    const cellY = Math.floor(latMeters / this.config.gridCellSize);

    return this.makeCellKey(cellX, cellY);
  }

  /**
   * Create cell key from cell coordinates
   */
  private makeCellKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  /**
   * Parse cell key back to coordinates
   */
  private parseCellKey(key: string): [number, number] {
    const [x, y] = key.split(',').map(Number);
    return [x, y];
  }
}

/**
 * Helper function to create and configure a collision system
 */
export function createCollisionSystem(
  bounds: { south: number; west: number; north: number; east: number },
  config?: Partial<CollisionSystemConfig>
): CollisionSystem {
  const system = new CollisionSystem(config);
  system.setBounds(bounds.south, bounds.west, bounds.north, bounds.east);
  return system;
}
