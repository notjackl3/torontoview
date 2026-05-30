/**
 * Vehicle Physics Engine
 * Realistic acceleration, braking, and following behavior
 */

import * as turf from '@turf/turf';
import { SpawnedCar } from './spawning';

export interface VehiclePhysicsConfig {
  maxAcceleration: number;      // m/s²
  maxDeceleration: number;      // m/s²
  comfortDeceleration: number;  // m/s² (for normal braking)
  reactionTime: number;         // seconds
  minFollowDistance: number;    // meters
  timeHeadway: number;          // seconds (desired time gap to vehicle ahead)
  speedVariance: number;        // percentage (0-1)
}

export interface VehicleState {
  position: [number, number];   // [lon, lat]
  velocity: number;             // m/s
  acceleration: number;         // m/s²
  heading: number;              // degrees
  targetSpeed: number;          // m/s (desired speed)
  distanceToLeader?: number;    // meters
}

const DEFAULT_CONFIGS: Record<string, VehiclePhysicsConfig> = {
  sedan: {
    maxAcceleration: 3.0,
    maxDeceleration: 8.0,
    comfortDeceleration: 3.5,
    reactionTime: 1.0,
    minFollowDistance: 2.0,
    timeHeadway: 1.5,
    speedVariance: 0.1,
  },
  suv: {
    maxAcceleration: 2.5,
    maxDeceleration: 7.0,
    comfortDeceleration: 3.0,
    reactionTime: 1.1,
    minFollowDistance: 2.5,
    timeHeadway: 1.8,
    speedVariance: 0.12,
  },
  truck: {
    maxAcceleration: 1.8,
    maxDeceleration: 6.0,
    comfortDeceleration: 2.5,
    reactionTime: 1.3,
    minFollowDistance: 3.5,
    timeHeadway: 2.2,
    speedVariance: 0.08,
  },
  compact: {
    maxAcceleration: 3.2,
    maxDeceleration: 8.5,
    comfortDeceleration: 4.0,
    reactionTime: 0.9,
    minFollowDistance: 1.8,
    timeHeadway: 1.3,
    speedVariance: 0.15,
  },
};

export class VehiclePhysics {
  private configs: Map<string, VehiclePhysicsConfig> = new Map();

  constructor() {
    // Load default configs
    Object.entries(DEFAULT_CONFIGS).forEach(([type, config]) => {
      this.configs.set(type, config);
    });
  }

  /**
   * Calculate acceleration using Intelligent Driver Model (IDM)
   */
  calculateAcceleration(
    vehicle: SpawnedCar,
    leaderVehicle: SpawnedCar | null,
    speedLimit: number, // km/h
    targetSpeed?: number // m/s
  ): number {
    const config = this.getConfig(vehicle.type);
    const currentSpeed = vehicle.speed / 3.6; // Convert km/h to m/s
    const desiredSpeed = targetSpeed || (speedLimit / 3.6);

    // Free-flow acceleration term
    const speedDelta = currentSpeed / desiredSpeed;
    const freeAccel = config.maxAcceleration * (1 - Math.pow(speedDelta, 4));

    // If no leader, just use free-flow acceleration
    if (!leaderVehicle) {
      return freeAccel;
    }

    // Calculate distance to leader
    const distance = turf.distance(
      turf.point(vehicle.position),
      turf.point(leaderVehicle.position),
      { units: 'meters' }
    );

    const leaderSpeed = leaderVehicle.speed / 3.6; // Convert to m/s
    const speedDifference = currentSpeed - leaderSpeed;

    // Desired following distance (IDM model)
    const desiredGap = config.minFollowDistance +
      currentSpeed * config.timeHeadway +
      (currentSpeed * speedDifference) / (2 * Math.sqrt(config.maxAcceleration * config.comfortDeceleration));

    // Interaction term
    const interactionTerm = Math.pow(desiredGap / Math.max(distance, 0.1), 2);

    // Total acceleration
    const acceleration = freeAccel - config.maxAcceleration * interactionTerm;

    // Clamp to physical limits
    return Math.max(-config.maxDeceleration, Math.min(config.maxAcceleration, acceleration));
  }

  /**
   * Calculate braking distance required to stop
   */
  calculateBrakingDistance(
    currentSpeed: number, // km/h
    vehicleType: string,
    useEmergency: boolean = false
  ): number {
    const config = this.getConfig(vehicleType);
    const speedMs = currentSpeed / 3.6; // Convert to m/s

    const deceleration = useEmergency ? config.maxDeceleration : config.comfortDeceleration;

    // Distance = v² / (2 * a) + reaction time distance
    const reactionDistance = speedMs * config.reactionTime;
    const brakingDistance = (speedMs * speedMs) / (2 * deceleration);

    return reactionDistance + brakingDistance;
  }

  /**
   * Update vehicle velocity based on acceleration
   */
  updateVelocity(
    currentSpeed: number, // km/h
    acceleration: number, // m/s²
    deltaTime: number,    // seconds
    speedLimit: number    // km/h
  ): number {
    const speedMs = currentSpeed / 3.6;
    const newSpeedMs = Math.max(0, speedMs + acceleration * deltaTime);

    // Convert back to km/h and clamp to speed limit
    const newSpeed = newSpeedMs * 3.6;
    return Math.min(newSpeed, speedLimit * 1.1); // Allow 10% over limit
  }

  /**
   * Calculate safe following distance
   */
  calculateSafeFollowingDistance(
    velocity: number, // km/h
    vehicleType: string
  ): number {
    const config = this.getConfig(vehicleType);
    const speedMs = velocity / 3.6;

    return config.minFollowDistance + speedMs * config.timeHeadway;
  }

  /**
   * Check if vehicle should start braking for obstacle
   */
  shouldBrake(
    currentSpeed: number, // km/h
    distanceToObstacle: number, // meters
    vehicleType: string,
    targetSpeed: number = 0 // km/h
  ): { shouldBrake: boolean; requiredDecel: number } {
    const config = this.getConfig(vehicleType);
    const speedMs = currentSpeed / 3.6;
    const targetSpeedMs = targetSpeed / 3.6;

    // Calculate required deceleration to reach target speed at obstacle
    // v² = u² + 2as -> a = (v² - u²) / (2s)
    const requiredDecel = (targetSpeedMs * targetSpeedMs - speedMs * speedMs) /
      (2 * Math.max(distanceToObstacle, 0.1));

    // Add safety margin (brake earlier than necessary)
    const safetyFactor = 1.3;
    const shouldBrake = Math.abs(requiredDecel) > config.comfortDeceleration / safetyFactor;

    return {
      shouldBrake: shouldBrake && distanceToObstacle > 0,
      requiredDecel: Math.abs(requiredDecel),
    };
  }

  /**
   * Calculate lane change safety
   */
  isLaneChangeSafe(
    vehicle: SpawnedCar,
    targetLane: SpawnedCar[],
    direction: 'left' | 'right'
  ): boolean {
    const config = this.getConfig(vehicle.type);
    const safeDistance = this.calculateSafeFollowingDistance(vehicle.speed, vehicle.type);

    // Check vehicles in target lane
    for (const other of targetLane) {
      const distance = turf.distance(
        turf.point(vehicle.position),
        turf.point(other.position),
        { units: 'meters' }
      );

      // Check if too close
      if (distance < safeDistance * 1.5) {
        return false;
      }

      // Check relative speed
      const relativeSpeed = Math.abs(vehicle.speed - other.speed);
      if (relativeSpeed > 20) { // 20 km/h difference is risky
        return false;
      }
    }

    return true;
  }

  /**
   * Apply speed variance for realistic behavior
   */
  applySpeedVariance(
    targetSpeed: number, // km/h
    vehicleType: string
  ): number {
    const config = this.getConfig(vehicleType);
    const variance = (Math.random() - 0.5) * 2 * config.speedVariance;
    return targetSpeed * (1 + variance);
  }

  /**
   * Get configuration for vehicle type
   */
  getConfig(vehicleType: string): VehiclePhysicsConfig {
    return this.configs.get(vehicleType) || DEFAULT_CONFIGS.sedan;
  }

  /**
   * Set configuration for vehicle type
   */
  setConfig(vehicleType: string, config: Partial<VehiclePhysicsConfig>): void {
    const current = this.getConfig(vehicleType);
    this.configs.set(vehicleType, { ...current, ...config });
  }

  /**
   * Get all configurations
   */
  getAllConfigs(): Record<string, VehiclePhysicsConfig> {
    const configs: Record<string, VehiclePhysicsConfig> = {};
    this.configs.forEach((config, type) => {
      configs[type] = { ...config };
    });
    return configs;
  }

  /**
   * Calculate time to collision (TTC)
   */
  calculateTimeToCollision(
    vehicle: SpawnedCar,
    obstacle: { position: [number, number]; speed: number }
  ): number {
    const distance = turf.distance(
      turf.point(vehicle.position),
      turf.point(obstacle.position),
      { units: 'meters' }
    );

    const relativeSpeed = (vehicle.speed - obstacle.speed) / 3.6; // Convert to m/s

    if (relativeSpeed <= 0) {
      return Infinity; // Not closing in
    }

    return distance / relativeSpeed;
  }

  /**
   * Calculate comfortable acceleration for smooth driving
   */
  calculateComfortableAcceleration(
    currentSpeed: number, // km/h
    targetSpeed: number,  // km/h
    distance: number,     // meters
    vehicleType: string
  ): number {
    const config = this.getConfig(vehicleType);
    const currentSpeedMs = currentSpeed / 3.6;
    const targetSpeedMs = targetSpeed / 3.6;

    // Calculate required acceleration
    // v² = u² + 2as -> a = (v² - u²) / (2s)
    const requiredAccel = (targetSpeedMs * targetSpeedMs - currentSpeedMs * currentSpeedMs) /
      (2 * Math.max(distance, 1));

    // Limit to comfortable range
    if (requiredAccel > 0) {
      return Math.min(requiredAccel, config.maxAcceleration * 0.7); // 70% of max for comfort
    } else {
      return Math.max(requiredAccel, -config.comfortDeceleration);
    }
  }

  /**
   * Simulate emergency braking
   */
  emergencyBrake(
    currentSpeed: number, // km/h
    vehicleType: string
  ): number {
    const config = this.getConfig(vehicleType);
    return -config.maxDeceleration;
  }

  /**
   * Calculate fuel consumption (simplified model)
   */
  calculateFuelConsumption(
    speed: number,        // km/h
    acceleration: number, // m/s²
    deltaTime: number     // seconds
  ): number {
    // Simplified fuel consumption model
    // Base consumption + acceleration penalty
    const baseConsumption = 0.05; // L/s at idle
    const speedFactor = Math.pow(speed / 100, 2) * 0.02;
    const accelFactor = Math.max(0, acceleration) * 0.01;

    return (baseConsumption + speedFactor + accelFactor) * deltaTime;
  }
}
