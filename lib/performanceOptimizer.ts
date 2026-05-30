/**
 * Performance Optimization System
 * Phase 3: Object pooling, LOD (Level of Detail), and staggered updates for 60 FPS @ 100 vehicles
 */

import * as THREE from 'three';
import { CarType } from './spawning';
import { EnhancedVehicleMesh, createEnhancedCarModel } from './vehicleRenderer';

// LOD distance thresholds (in meters)
const LOD_FULL_DISTANCE = 200;
const LOD_MEDIUM_DISTANCE = 500;

export type LODLevel = 'full' | 'medium' | 'low';

export interface PooledVehicle {
  mesh: EnhancedVehicleMesh;
  inUse: boolean;
  type: CarType;
  color: string;
  lodLevel: LODLevel;
}

/**
 * Object Pool for Vehicle Meshes
 * Reuses meshes to reduce GC pressure and improve performance
 */
export class VehiclePool {
  private pool: Map<string, PooledVehicle[]> = new Map();
  private poolSize: number = 150; // Pre-allocate for 150 vehicles

  constructor(poolSize: number = 150) {
    this.poolSize = poolSize;
    this.initializePool();
  }

  /**
   * Pre-allocate vehicle meshes for each type/color combination
   */
  private initializePool(): void {
    const types: CarType[] = ['sedan', 'suv', 'truck', 'compact'];
    const colors = [
      '#FF0000', '#0000FF', '#00FF00', '#FFA500',
      '#800080', '#FFFF00', '#00FFFF', '#FF00FF',
      '#C0C0C0', '#000000', '#FFFFFF', '#808080'
    ];

    // Pre-allocate a mix of vehicles
    const vehiclesPerCombo = Math.ceil(this.poolSize / (types.length * 3)); // 3 popular colors

    types.forEach((type) => {
      colors.slice(0, 3).forEach((color) => {
        const key = this.getPoolKey(type, color);
        const vehicles: PooledVehicle[] = [];

        for (let i = 0; i < vehiclesPerCombo; i++) {
          const mesh = createEnhancedCarModel(type, color);
          mesh.visible = false; // Hidden until used

          vehicles.push({
            mesh,
            inUse: false,
            type,
            color,
            lodLevel: 'full',
          });
        }

        this.pool.set(key, vehicles);
      });
    });

    console.log(`✅ Vehicle pool initialized with ${this.poolSize} pre-allocated meshes`);
  }

  /**
   * Get pool key for type/color combination
   */
  private getPoolKey(type: CarType, color: string): string {
    return `${type}-${color}`;
  }

  /**
   * Acquire a vehicle from the pool
   */
  acquire(type: CarType, color: string): EnhancedVehicleMesh | null {
    const key = this.getPoolKey(type, color);
    let vehicles = this.pool.get(key);

    // If no exact match, try to find any vehicle of the same type
    if (!vehicles || vehicles.every(v => v.inUse)) {
      // Look for unused vehicles of the same type but different color
      for (const [poolKey, poolVehicles] of this.pool.entries()) {
        if (poolKey.startsWith(type) && poolVehicles.some(v => !v.inUse)) {
          vehicles = poolVehicles;
          break;
        }
      }
    }

    // Still no match? Create a new one dynamically
    if (!vehicles || vehicles.every(v => v.inUse)) {
      console.warn(`Pool exhausted for ${type}-${color}, creating new mesh`);
      const mesh = createEnhancedCarModel(type, color);

      if (!vehicles) {
        vehicles = [];
        this.pool.set(key, vehicles);
      }

      const pooledVehicle: PooledVehicle = {
        mesh,
        inUse: true,
        type,
        color,
        lodLevel: 'full',
      };
      vehicles.push(pooledVehicle);

      return mesh;
    }

    // Find first available vehicle
    const available = vehicles.find(v => !v.inUse);
    if (available) {
      available.inUse = true;
      available.mesh.visible = true;
      return available.mesh;
    }

    return null;
  }

  /**
   * Release a vehicle back to the pool
   */
  release(mesh: EnhancedVehicleMesh): void {
    for (const vehicles of this.pool.values()) {
      const pooledVehicle = vehicles.find(v => v.mesh === mesh);
      if (pooledVehicle) {
        pooledVehicle.inUse = false;
        pooledVehicle.mesh.visible = false;

        // Reset mesh state
        pooledVehicle.mesh.position.set(0, 0, 0);
        pooledVehicle.mesh.rotation.set(0, 0, 0);
        if (pooledVehicle.mesh.lights) {
          pooledVehicle.mesh.turnSignalState = 'none';
          pooledVehicle.mesh.brakeState = false;
        }

        return;
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStats() {
    let totalVehicles = 0;
    let inUse = 0;

    for (const vehicles of this.pool.values()) {
      totalVehicles += vehicles.length;
      inUse += vehicles.filter(v => v.inUse).length;
    }

    return {
      total: totalVehicles,
      inUse,
      available: totalVehicles - inUse,
    };
  }

  /**
   * Get all meshes (for adding to scene initially)
   */
  getAllMeshes(): EnhancedVehicleMesh[] {
    const meshes: EnhancedVehicleMesh[] = [];
    for (const vehicles of this.pool.values()) {
      meshes.push(...vehicles.map(v => v.mesh));
    }
    return meshes;
  }
}

/**
 * LOD (Level of Detail) Manager
 * Reduces visual quality for distant vehicles to improve performance
 */
export class LODManager {
  private cameraPosition: THREE.Vector3 = new THREE.Vector3();

  /**
   * Update camera position for distance calculations
   */
  updateCameraPosition(camera: THREE.Camera): void {
    this.cameraPosition.copy(camera.position);
  }

  /**
   * Calculate LOD level based on distance from camera
   */
  calculateLODLevel(vehiclePosition: THREE.Vector3): LODLevel {
    const distance = this.cameraPosition.distanceTo(vehiclePosition);

    if (distance < LOD_FULL_DISTANCE) {
      return 'full';
    } else if (distance < LOD_MEDIUM_DISTANCE) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Apply LOD settings to vehicle mesh
   */
  applyLOD(mesh: EnhancedVehicleMesh, lodLevel: LODLevel, currentLevel: LODLevel): LODLevel {
    // Only update if level changed
    if (lodLevel === currentLevel) {
      return currentLevel;
    }

    if (!mesh.lights) return lodLevel;

    switch (lodLevel) {
      case 'full':
        // Full detail - all lights and effects enabled
        mesh.visible = true;
        if (mesh.lights.headlights) {
          mesh.lights.headlights.forEach(light => light.visible = true);
        }
        if (mesh.lights.brakeLights) {
          mesh.lights.brakeLights.forEach(light => light.visible = true);
        }
        if (mesh.lights.turnSignalLeft) mesh.lights.turnSignalLeft.visible = true;
        if (mesh.lights.turnSignalRight) mesh.lights.turnSignalRight.visible = true;
        break;

      case 'medium':
        // Medium detail - disable turn signals and headlights, keep brake lights
        mesh.visible = true;
        if (mesh.lights.headlights) {
          mesh.lights.headlights.forEach(light => light.visible = false);
        }
        if (mesh.lights.brakeLights) {
          mesh.lights.brakeLights.forEach(light => light.visible = true);
        }
        if (mesh.lights.turnSignalLeft) mesh.lights.turnSignalLeft.visible = false;
        if (mesh.lights.turnSignalRight) mesh.lights.turnSignalRight.visible = false;
        break;

      case 'low':
        // Low detail - disable all lights, just show basic mesh
        mesh.visible = true;
        if (mesh.lights.headlights) {
          mesh.lights.headlights.forEach(light => light.visible = false);
        }
        if (mesh.lights.brakeLights) {
          mesh.lights.brakeLights.forEach(light => light.visible = false);
        }
        if (mesh.lights.turnSignalLeft) mesh.lights.turnSignalLeft.visible = false;
        if (mesh.lights.turnSignalRight) mesh.lights.turnSignalRight.visible = false;
        break;
    }

    return lodLevel;
  }
}

/**
 * Staggered Update Manager
 * Distributes expensive updates across multiple frames to maintain 60 FPS
 */
export class StaggeredUpdateManager {
  private updateGroups: Map<number, Set<string>> = new Map();
  private currentFrame: number = 0;
  private groupCount: number = 4; // Divide updates into 4 groups

  constructor(groupCount: number = 4) {
    this.groupCount = groupCount;
    for (let i = 0; i < groupCount; i++) {
      this.updateGroups.set(i, new Set());
    }
  }

  /**
   * Register a vehicle for staggered updates
   */
  register(carId: string): void {
    // Distribute evenly across groups
    const hash = this.hashString(carId);
    const groupIndex = hash % this.groupCount;
    this.updateGroups.get(groupIndex)?.add(carId);
  }

  /**
   * Unregister a vehicle
   */
  unregister(carId: string): void {
    for (const group of this.updateGroups.values()) {
      group.delete(carId);
    }
  }

  /**
   * Check if a vehicle should update this frame
   */
  shouldUpdate(carId: string): boolean {
    const hash = this.hashString(carId);
    const groupIndex = hash % this.groupCount;
    return (this.currentFrame % this.groupCount) === groupIndex;
  }

  /**
   * Advance to next frame
   */
  nextFrame(): void {
    this.currentFrame++;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get statistics
   */
  getStats() {
    const groupSizes = Array.from(this.updateGroups.values()).map(g => g.size);
    return {
      groupCount: this.groupCount,
      totalVehicles: groupSizes.reduce((a, b) => a + b, 0),
      groupSizes,
      currentFrame: this.currentFrame,
      currentGroup: this.currentFrame % this.groupCount,
    };
  }
}

/**
 * Performance Monitor
 * Tracks FPS and provides adaptive quality settings
 */
export class PerformanceMonitor {
  private frameTimestamps: number[] = [];
  private readonly maxSamples = 60;
  private targetFPS = 60;
  private currentFPS = 60;
  private adaptiveQuality = true;

  /**
   * Record a frame
   */
  recordFrame(): void {
    const now = performance.now();
    this.frameTimestamps.push(now);

    // Keep only recent samples
    if (this.frameTimestamps.length > this.maxSamples) {
      this.frameTimestamps.shift();
    }

    // Calculate FPS
    if (this.frameTimestamps.length >= 2) {
      const timeSpan = now - this.frameTimestamps[0];
      this.currentFPS = (this.frameTimestamps.length - 1) / (timeSpan / 1000);
    }
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return Math.round(this.currentFPS);
  }

  /**
   * Check if performance is good (above 50 FPS)
   */
  isPerformanceGood(): boolean {
    return this.currentFPS >= 50;
  }

  /**
   * Check if performance is critical (below 30 FPS)
   */
  isPerformanceCritical(): boolean {
    return this.currentFPS < 30;
  }

  /**
   * Get recommended LOD distances based on current performance
   */
  getRecommendedLODDistances(): { full: number; medium: number } {
    if (!this.adaptiveQuality) {
      return { full: LOD_FULL_DISTANCE, medium: LOD_MEDIUM_DISTANCE };
    }

    if (this.isPerformanceCritical()) {
      // Reduce LOD distances when struggling
      return {
        full: LOD_FULL_DISTANCE * 0.5,
        medium: LOD_MEDIUM_DISTANCE * 0.5,
      };
    } else if (this.isPerformanceGood()) {
      // Can afford full quality
      return {
        full: LOD_FULL_DISTANCE,
        medium: LOD_MEDIUM_DISTANCE,
      };
    }

    // Moderate performance
    return {
      full: LOD_FULL_DISTANCE * 0.75,
      medium: LOD_MEDIUM_DISTANCE * 0.75,
    };
  }

  /**
   * Get performance statistics
   */
  getStats() {
    return {
      fps: this.getFPS(),
      targetFPS: this.targetFPS,
      performanceGood: this.isPerformanceGood(),
      performanceCritical: this.isPerformanceCritical(),
      sampleCount: this.frameTimestamps.length,
    };
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.frameTimestamps = [];
    this.currentFPS = 60;
  }
}
