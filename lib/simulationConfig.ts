/**
 * Simulation Configuration System
 * Centralized management of all simulation parameters
 */

import { SpawnerConfig } from './spawning';
import { TrafficSignalConfig } from './trafficInfrastructure';
import { VehiclePhysicsConfig } from './vehiclePhysics';

export interface SimulationConfig {
  // Spawning configuration
  spawning: SpawnerConfig;

  // Traffic signal configuration
  trafficSignals: {
    defaultConfig: TrafficSignalConfig;
    adaptiveSignals: boolean;
    coordinationEnabled: boolean;
  };

  // Physics configuration
  physics: {
    enabled: boolean;
    realisticAcceleration: boolean;
    collisionDetection: boolean;
    vehicleConfigs: Record<string, VehiclePhysicsConfig>;
  };

  // Behavior configuration
  behavior: {
    laneChangingEnabled: boolean;
    overtakingEnabled: boolean;
    speedLimitCompliance: number; // 0-1 (0 = ignore, 1 = strict)
    aggressiveness: number;       // 0-1 (0 = cautious, 1 = aggressive)
  };

  // Visual configuration
  visual: {
    showTrafficSignals: boolean;
    showStopSigns: boolean;
    showRoutes: boolean;
    showVehicleInfo: boolean;
    cameraFollowVehicle: boolean;
  };

  // Performance configuration
  performance: {
    maxVehicles: number;
    updateFrequency: number;      // Hz
    spatialPartitioning: boolean;
    lodEnabled: boolean;          // Level of detail
  };

  // Analytics configuration
  analytics: {
    enabled: boolean;
    trackWaitTimes: boolean;
    trackSpeeds: boolean;
    trackDensity: boolean;
    sampleInterval: number;       // milliseconds
  };
}

const DEFAULT_CONFIG: SimulationConfig = {
  spawning: {
    maxCars: 50,
    globalSpawnRate: 1.0,
    despawnRadius: 20,
    defaultCarSpeed: 40,
    carTypeDistribution: {
      sedan: 0.4,
      suv: 0.25,
      truck: 0.15,
      compact: 0.2,
    },
  },

  trafficSignals: {
    defaultConfig: {
      greenDuration: 8000,
      yellowDuration: 2000,
      redDuration: 8000,
    },
    adaptiveSignals: false,
    coordinationEnabled: false,
  },

  physics: {
    enabled: true,
    realisticAcceleration: true,
    collisionDetection: true,
    vehicleConfigs: {
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
    },
  },

  behavior: {
    laneChangingEnabled: true,
    overtakingEnabled: true,
    speedLimitCompliance: 0.85,
    aggressiveness: 0.5,
  },

  visual: {
    showTrafficSignals: true,
    showStopSigns: true,
    showRoutes: false,
    showVehicleInfo: false,
    cameraFollowVehicle: false,
  },

  performance: {
    maxVehicles: 50,
    updateFrequency: 60,
    spatialPartitioning: true,
    lodEnabled: true,
  },

  analytics: {
    enabled: true,
    trackWaitTimes: true,
    trackSpeeds: true,
    trackDensity: true,
    sampleInterval: 1000,
  },
};

/**
 * Preset configurations for different scenarios
 */
export const PRESETS: Record<string, Partial<SimulationConfig>> = {
  'rush-hour': {
    spawning: {
      maxCars: 100,
      globalSpawnRate: 2.0,
      despawnRadius: 20,
      defaultCarSpeed: 40,
      carTypeDistribution: {
        sedan: 0.5,
        suv: 0.3,
        truck: 0.1,
        compact: 0.1,
      },
    },
    behavior: {
      laneChangingEnabled: true,
      overtakingEnabled: true,
      speedLimitCompliance: 0.7,
      aggressiveness: 0.7,
    },
  },

  'low-traffic': {
    spawning: {
      maxCars: 20,
      globalSpawnRate: 0.5,
      despawnRadius: 20,
      defaultCarSpeed: 50,
      carTypeDistribution: {
        sedan: 0.3,
        suv: 0.2,
        truck: 0.2,
        compact: 0.3,
      },
    },
    behavior: {
      laneChangingEnabled: true,
      overtakingEnabled: true,
      speedLimitCompliance: 0.9,
      aggressiveness: 0.3,
    },
  },

  'realistic': {
    physics: {
      enabled: true,
      realisticAcceleration: true,
      collisionDetection: true,
      vehicleConfigs: DEFAULT_CONFIG.physics.vehicleConfigs,
    },
    behavior: {
      laneChangingEnabled: true,
      overtakingEnabled: true,
      speedLimitCompliance: 0.85,
      aggressiveness: 0.5,
    },
    trafficSignals: {
      defaultConfig: {
        greenDuration: 12000,
        yellowDuration: 3000,
        redDuration: 12000,
      },
      adaptiveSignals: true,
      coordinationEnabled: true,
    },
  },

  'performance': {
    performance: {
      maxVehicles: 30,
      updateFrequency: 30,
      spatialPartitioning: true,
      lodEnabled: true,
    },
    visual: {
      showTrafficSignals: true,
      showStopSigns: false,
      showRoutes: false,
      showVehicleInfo: false,
      cameraFollowVehicle: false,
    },
  },

  'debug': {
    visual: {
      showTrafficSignals: true,
      showStopSigns: true,
      showRoutes: true,
      showVehicleInfo: true,
      cameraFollowVehicle: false,
    },
    analytics: {
      enabled: true,
      trackWaitTimes: true,
      trackSpeeds: true,
      trackDensity: true,
      sampleInterval: 500,
    },
  },
};

export class ConfigurationManager {
  private config: SimulationConfig;
  private listeners: Map<string, Set<(config: SimulationConfig) => void>> = new Map();

  constructor(initialConfig?: Partial<SimulationConfig>) {
    this.config = this.mergeConfig(DEFAULT_CONFIG, initialConfig || {});
  }

  /**
   * Get current configuration
   */
  getConfig(): SimulationConfig {
    return JSON.parse(JSON.stringify(this.config)); // Deep copy
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SimulationConfig>): void {
    this.config = this.mergeConfig(this.config, updates);
    this.notifyListeners('config-update');
  }

  /**
   * Load a preset
   */
  loadPreset(presetName: keyof typeof PRESETS): void {
    const preset = PRESETS[presetName];
    if (preset) {
      this.config = this.mergeConfig(DEFAULT_CONFIG, preset);
      this.notifyListeners('preset-loaded');
    }
  }

  /**
   * Reset to default configuration
   */
  reset(): void {
    this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    this.notifyListeners('config-reset');
  }

  /**
   * Get spawning configuration
   */
  getSpawningConfig(): SpawnerConfig {
    return { ...this.config.spawning };
  }

  /**
   * Get traffic signal configuration
   */
  getTrafficSignalConfig(): TrafficSignalConfig {
    return { ...this.config.trafficSignals.defaultConfig };
  }

  /**
   * Get vehicle physics configuration
   */
  getVehiclePhysicsConfig(vehicleType: string): VehiclePhysicsConfig | undefined {
    return this.config.physics.vehicleConfigs[vehicleType];
  }

  /**
   * Update spawning configuration
   */
  updateSpawningConfig(config: Partial<SpawnerConfig>): void {
    this.config.spawning = { ...this.config.spawning, ...config };
    this.notifyListeners('spawning-update');
  }

  /**
   * Update traffic signal configuration
   */
  updateTrafficSignalConfig(config: Partial<TrafficSignalConfig>): void {
    this.config.trafficSignals.defaultConfig = {
      ...this.config.trafficSignals.defaultConfig,
      ...config,
    };
    this.notifyListeners('traffic-signal-update');
  }

  /**
   * Update vehicle physics configuration
   */
  updateVehiclePhysicsConfig(
    vehicleType: string,
    config: Partial<VehiclePhysicsConfig>
  ): void {
    if (this.config.physics.vehicleConfigs[vehicleType]) {
      this.config.physics.vehicleConfigs[vehicleType] = {
        ...this.config.physics.vehicleConfigs[vehicleType],
        ...config,
      };
      this.notifyListeners('physics-update');
    }
  }

  /**
   * Export configuration as JSON
   */
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Import configuration from JSON
   */
  importConfig(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      this.config = this.mergeConfig(DEFAULT_CONFIG, imported);
      this.notifyListeners('config-imported');
      return true;
    } catch (error) {
      console.error('Failed to import configuration:', error);
      return false;
    }
  }

  /**
   * Add configuration change listener
   */
  addListener(event: string, callback: (config: SimulationConfig) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove configuration change listener
   */
  removeListener(event: string, callback: (config: SimulationConfig) => void): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Notify all listeners of a configuration change
   */
  private notifyListeners(event: string): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(this.config));
    }
  }

  /**
   * Deep merge two configurations
   */
  private mergeConfig(
    base: SimulationConfig,
    updates: Partial<SimulationConfig>
  ): SimulationConfig {
    const result = JSON.parse(JSON.stringify(base));

    Object.keys(updates).forEach(key => {
      const typedKey = key as keyof SimulationConfig;
      const value = updates[typedKey];

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[typedKey] = {
          ...result[typedKey],
          ...value,
        };
      } else {
        result[typedKey] = value as any;
      }
    });

    return result;
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate spawning config
    if (this.config.spawning.maxCars < 1) {
      errors.push('maxCars must be at least 1');
    }
    if (this.config.spawning.globalSpawnRate < 0) {
      errors.push('globalSpawnRate must be positive');
    }

    // Validate traffic signal config
    if (this.config.trafficSignals.defaultConfig.greenDuration < 1000) {
      errors.push('greenDuration must be at least 1000ms');
    }

    // Validate physics config
    Object.entries(this.config.physics.vehicleConfigs).forEach(([type, config]) => {
      if (config.maxAcceleration <= 0) {
        errors.push(`${type}: maxAcceleration must be positive`);
      }
      if (config.maxDeceleration <= 0) {
        errors.push(`${type}: maxDeceleration must be positive`);
      }
    });

    // Validate behavior config
    if (this.config.behavior.speedLimitCompliance < 0 ||
        this.config.behavior.speedLimitCompliance > 1) {
      errors.push('speedLimitCompliance must be between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get available presets
   */
  getAvailablePresets(): string[] {
    return Object.keys(PRESETS);
  }
}
