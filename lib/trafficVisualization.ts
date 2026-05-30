/**
 * Traffic Visualization Integration Module
 * Combines visual enhancements and performance optimizations into a unified system
 */

import * as THREE from 'three';
import { SpawnedCar } from './spawning';
import {
  EnhancedVehicleMesh,
  createEnhancedCarModel,
  updateTurnSignals,
  updateBrakeLights,
} from './vehicleRenderer';
import {
  VehiclePool,
  LODManager,
  StaggeredUpdateManager,
  PerformanceMonitor,
  LODLevel,
} from './performanceOptimizer';

export interface TrafficVisualizationConfig {
  enablePooling: boolean;
  enableLOD: boolean;
  enableStaggeredUpdates: boolean;
  enablePerformanceMonitoring: boolean;
  poolSize: number;
  staggerGroupCount: number;
}

const DEFAULT_CONFIG: TrafficVisualizationConfig = {
  enablePooling: true,
  enableLOD: true,
  enableStaggeredUpdates: true,
  enablePerformanceMonitoring: true,
  poolSize: 150,
  staggerGroupCount: 4,
};

/**
 * Main Traffic Visualization System
 * Manages all visual enhancements and performance optimizations
 */
export class TrafficVisualizationSystem {
  private config: TrafficVisualizationConfig;
  private vehiclePool?: VehiclePool;
  private lodManager?: LODManager;
  private staggerManager?: StaggeredUpdateManager;
  private performanceMonitor?: PerformanceMonitor;

  // Track vehicles and their LOD levels
  private vehicleMeshes: Map<string, EnhancedVehicleMesh> = new Map();
  private vehicleLODLevels: Map<string, LODLevel> = new Map();
  private previousSpeeds: Map<string, number> = new Map();

  constructor(config?: Partial<TrafficVisualizationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initialize();
  }

  /**
   * Initialize all systems
   */
  private initialize(): void {
    if (this.config.enablePooling) {
      this.vehiclePool = new VehiclePool(this.config.poolSize);
      console.log('✅ Vehicle pooling enabled');
    }

    if (this.config.enableLOD) {
      this.lodManager = new LODManager();
      console.log('✅ LOD system enabled');
    }

    if (this.config.enableStaggeredUpdates) {
      this.staggerManager = new StaggeredUpdateManager(this.config.staggerGroupCount);
      console.log('✅ Staggered updates enabled');
    }

    if (this.config.enablePerformanceMonitoring) {
      this.performanceMonitor = new PerformanceMonitor();
      console.log('✅ Performance monitoring enabled');
    }
  }

  /**
   * Add all pooled meshes to the scene (call once during initialization)
   */
  addPooledMeshesToScene(scene: THREE.Group): void {
    if (this.vehiclePool) {
      const meshes = this.vehiclePool.getAllMeshes();
      meshes.forEach(mesh => {
        mesh.visible = false; // Hidden until used
        scene.add(mesh);
      });
      console.log(`✅ Added ${meshes.length} pooled vehicle meshes to scene`);
    }
  }

  /**
   * Create or acquire a vehicle mesh for a car
   */
  createVehicleMesh(car: SpawnedCar): EnhancedVehicleMesh | null {
    let mesh: EnhancedVehicleMesh | null = null;

    if (this.config.enablePooling && this.vehiclePool) {
      mesh = this.vehiclePool.acquire(car.type, car.color);
    } else {
      mesh = createEnhancedCarModel(car.type, car.color);
    }

    if (mesh) {
      this.vehicleMeshes.set(car.id, mesh);

      if (this.config.enableStaggeredUpdates && this.staggerManager) {
        this.staggerManager.register(car.id);
      }

      this.vehicleLODLevels.set(car.id, 'full');
      this.previousSpeeds.set(car.id, car.speed);
    }

    return mesh;
  }

  /**
   * Remove a vehicle mesh (returns it to pool if enabled)
   */
  removeVehicleMesh(carId: string, scene?: THREE.Group): void {
    const mesh = this.vehicleMeshes.get(carId);

    if (mesh) {
      if (this.config.enablePooling && this.vehiclePool) {
        this.vehiclePool.release(mesh);
      } else if (scene) {
        scene.remove(mesh);
      }

      this.vehicleMeshes.delete(carId);
    }

    if (this.config.enableStaggeredUpdates && this.staggerManager) {
      this.staggerManager.unregister(carId);
    }

    this.vehicleLODLevels.delete(carId);
    this.previousSpeeds.delete(carId);
  }

  /**
   * Update vehicle visualization for a single car
   */
  updateVehicle(
    car: SpawnedCar,
    position: THREE.Vector3,
    camera: THREE.Camera,
    deltaTime: number
  ): void {
    const mesh = this.vehicleMeshes.get(car.id);
    if (!mesh) return;

    // Update position
    mesh.position.copy(position);
    mesh.rotation.y = (-car.bearing * Math.PI) / 180;

    // Check if this vehicle should update visual details this frame
    const shouldUpdateDetails = !this.config.enableStaggeredUpdates ||
      !this.staggerManager ||
      this.staggerManager.shouldUpdate(car.id);

    if (shouldUpdateDetails) {
      // Update turn signals
      updateTurnSignals(mesh, car.bearing, deltaTime);

      // Update brake lights based on deceleration
      const previousSpeed = this.previousSpeeds.get(car.id) || car.speed;
      const isBreaking = car.speed < previousSpeed - 5 || car.stoppedAtLight;
      updateBrakeLights(mesh, isBreaking);
      this.previousSpeeds.set(car.id, car.speed);
    }

    // Update LOD if enabled
    if (this.config.enableLOD && this.lodManager) {
      const currentLOD = this.vehicleLODLevels.get(car.id) || 'full';
      const newLOD = this.lodManager.calculateLODLevel(position);
      const updatedLOD = this.lodManager.applyLOD(mesh, newLOD, currentLOD);
      this.vehicleLODLevels.set(car.id, updatedLOD);
    }
  }

  /**
   * Update all systems (call once per frame)
   */
  frameUpdate(camera: THREE.Camera): void {
    // Update LOD manager with camera position
    if (this.config.enableLOD && this.lodManager) {
      this.lodManager.updateCameraPosition(camera);
    }

    // Advance stagger frame counter
    if (this.config.enableStaggeredUpdates && this.staggerManager) {
      this.staggerManager.nextFrame();
    }

    // Record frame for performance monitoring
    if (this.config.enablePerformanceMonitoring && this.performanceMonitor) {
      this.performanceMonitor.recordFrame();
    }
  }

  /**
   * Get vehicle mesh by car ID
   */
  getVehicleMesh(carId: string): EnhancedVehicleMesh | undefined {
    return this.vehicleMeshes.get(carId);
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    return {
      vehicles: {
        active: this.vehicleMeshes.size,
        lodLevels: {
          full: Array.from(this.vehicleLODLevels.values()).filter(l => l === 'full').length,
          medium: Array.from(this.vehicleLODLevels.values()).filter(l => l === 'medium').length,
          low: Array.from(this.vehicleLODLevels.values()).filter(l => l === 'low').length,
        },
      },
      pool: this.vehiclePool?.getStats(),
      stagger: this.staggerManager?.getStats(),
      performance: this.performanceMonitor?.getStats(),
    };
  }

  /**
   * Get performance FPS
   */
  getFPS(): number {
    return this.performanceMonitor?.getFPS() || 0;
  }

  /**
   * Check if performance is good
   */
  isPerformanceGood(): boolean {
    return this.performanceMonitor?.isPerformanceGood() ?? true;
  }

  /**
   * Reset all systems
   */
  reset(): void {
    // Release all vehicles
    const carIds = Array.from(this.vehicleMeshes.keys());
    carIds.forEach(carId => this.removeVehicleMesh(carId));

    // Reset performance monitor
    if (this.performanceMonitor) {
      this.performanceMonitor.reset();
    }

    console.log('🔄 Traffic visualization system reset');
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<TrafficVisualizationConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('⚙️ Traffic visualization config updated', this.config);
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.vehicleMeshes.clear();
    this.vehicleLODLevels.clear();
    this.previousSpeeds.clear();
    console.log('🗑️ Traffic visualization system disposed');
  }
}

/**
 * Helper function to create and initialize the traffic visualization system
 */
export function createTrafficVisualization(
  config?: Partial<TrafficVisualizationConfig>
): TrafficVisualizationSystem {
  return new TrafficVisualizationSystem(config);
}
