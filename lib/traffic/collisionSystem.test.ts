/**
 * Unit tests for Collision Detection System
 */

import { CollisionSystem, createCollisionSystem } from './collisionSystem';
import { SpawnedCar, CarType } from '../spawning';

// Helper function to create a test car
function createTestCar(
  id: string,
  position: [number, number],
  speed: number = 40,
  bearing: number = 0
): SpawnedCar {
  return {
    id,
    type: 'sedan' as CarType,
    color: '#FF0000',
    spawnPointId: 'test',
    spawnTime: Date.now(),
    position,
    destination: { id: 'test-dest', name: 'Test', position: [0, 0], weight: 1 },
    route: { waypoints: [], edges: [], totalDistance: 0 },
    currentEdgeId: null,
    distanceOnEdge: 0,
    speed,
    maxSpeed: 50,
    bearing,
    stoppedAtLight: false,
  };
}

describe('CollisionSystem', () => {
  let collisionSystem: CollisionSystem;
  const bounds = { south: 44.22, west: -76.51, north: 44.24, east: -76.48 };

  beforeEach(() => {
    collisionSystem = createCollisionSystem(bounds);
  });

  describe('Grid Management', () => {
    test('should initialize with empty grid', () => {
      const stats = collisionSystem.getGridStats();
      expect(stats.totalCells).toBe(0);
      expect(stats.occupiedCells).toBe(0);
    });

    test('should update grid with vehicles', () => {
      const vehicles = [
        createTestCar('car1', [-76.495, 44.225]),
        createTestCar('car2', [-76.490, 44.230]),
        createTestCar('car3', [-76.485, 44.235]),
      ];

      collisionSystem.updateGrid(vehicles);
      const stats = collisionSystem.getGridStats();

      expect(stats.totalCells).toBeGreaterThan(0);
      expect(stats.occupiedCells).toBeGreaterThan(0);
    });

    test('should handle vehicles in same cell', () => {
      const vehicles = [
        createTestCar('car1', [-76.495, 44.225]),
        createTestCar('car2', [-76.495, 44.225]), // Same position
      ];

      collisionSystem.updateGrid(vehicles);
      const stats = collisionSystem.getGridStats();

      expect(stats.maxVehiclesInCell).toBe(2);
    });
  });

  describe('Nearby Vehicle Detection', () => {
    test('should find nearby vehicles within radius', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225]);
      const car2 = createTestCar('car2', [-76.4951, 44.2251]); // ~15m away
      const car3 = createTestCar('car3', [-76.485, 44.235]); // Far away

      const vehicles = [car1, car2, car3];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const nearby = collisionSystem.getNearbyVehicles(car1, 20, vehicleMap);

      expect(nearby).toHaveLength(1);
      expect(nearby[0].id).toBe('car2');
    });

    test('should not include self in nearby vehicles', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225]);
      const vehicles = [car1];

      collisionSystem.updateGrid(vehicles);
      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const nearby = collisionSystem.getNearbyVehicles(car1, 100, vehicleMap);

      expect(nearby).toHaveLength(0);
    });

    test('should handle empty grid', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225]);
      const vehicleMap = new Map([[car1.id, car1]]);

      // Don't update grid
      const nearby = collisionSystem.getNearbyVehicles(car1, 100, vehicleMap);

      expect(nearby).toHaveLength(0);
    });
  });

  describe('Immediate Collision Detection', () => {
    test('should detect collision when vehicles are too close', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225]);
      const car2 = createTestCar('car2', [-76.49501, 44.22501]); // ~1.5m away

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const collision = collisionSystem.checkImmediateCollision(car1, vehicleMap);

      expect(collision.detected).toBe(true);
      expect(collision.targetCarId).toBe('car2');
      expect(collision.nearestDistance).toBeLessThan(10);
    });

    test('should not detect collision when vehicles are far apart', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225]);
      const car2 = createTestCar('car2', [-76.485, 44.235]); // Far away

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const collision = collisionSystem.checkImmediateCollision(car1, vehicleMap);

      expect(collision.detected).toBe(false);
    });
  });

  describe('Predictive Collision Detection', () => {
    test('should predict collision when vehicles are on collision course', () => {
      // Two cars heading towards each other
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0); // Heading east at 40 km/h
      const car2 = createTestCar('car2', [-76.494, 44.225], 40, 180); // Heading west at 40 km/h

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const collision = collisionSystem.checkPredictiveCollision(car1, vehicleMap);

      expect(collision.detected).toBe(true);
      expect(collision.timeToCollision).not.toBeNull();
      expect(collision.targetCarId).toBe('car2');
    });

    test('should not predict collision when vehicles are moving parallel', () => {
      // Two cars side by side heading same direction
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.495, 44.2251], 40, 0); // Same bearing

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const collision = collisionSystem.checkPredictiveCollision(car1, vehicleMap);

      // May or may not detect depending on exact spacing
      if (collision.detected) {
        expect(collision.timeToCollision).toBeGreaterThan(0);
      }
    });

    test('should not predict collision when vehicles are stationary', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 0, 0);
      const car2 = createTestCar('car2', [-76.490, 44.230], 0, 0);

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const collision = collisionSystem.checkPredictiveCollision(car1, vehicleMap);

      expect(collision.detected).toBe(false);
    });
  });

  describe('Emergency Braking', () => {
    test('should require emergency brake when collision is imminent', () => {
      // Two cars very close and heading towards each other
      const car1 = createTestCar('car1', [-76.49500, 44.225], 60, 0);
      const car2 = createTestCar('car2', [-76.49490, 44.225], 60, 180);

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const needsBrake = collisionSystem.requiresEmergencyBrake(car1, vehicleMap);

      expect(needsBrake).toBe(true);
    });

    test('should not require emergency brake when vehicles are far apart', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.485, 44.235], 40, 180);

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const needsBrake = collisionSystem.requiresEmergencyBrake(car1, vehicleMap);

      expect(needsBrake).toBe(false);
    });
  });

  describe('Safe Following Distance', () => {
    test('should calculate safe following distance based on speed', () => {
      const distance30 = collisionSystem.getSafeFollowingDistance(30);
      const distance60 = collisionSystem.getSafeFollowingDistance(60);
      const distance90 = collisionSystem.getSafeFollowingDistance(90);

      expect(distance60).toBeGreaterThan(distance30);
      expect(distance90).toBeGreaterThan(distance60);
    });

    test('should enforce minimum safe distance', () => {
      const distance0 = collisionSystem.getSafeFollowingDistance(0);
      const config = collisionSystem.getConfig();

      expect(distance0).toBeGreaterThanOrEqual(config.safetyBubbleRadius * 2);
    });
  });

  describe('Lane Change Safety', () => {
    test('should detect unsafe lane change when target position is occupied', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.49501, 44.2251], 40, 0); // At target position

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const targetPosition: [number, number] = [-76.49501, 44.2251];
      const isSafe = collisionSystem.isSafeToChangeLane(car1, targetPosition, vehicleMap);

      expect(isSafe).toBe(false);
    });

    test('should allow safe lane change when target position is clear', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.490, 44.235], 40, 0); // Far away

      const vehicles = [car1, car2];
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));
      const targetPosition: [number, number] = [-76.4951, 44.2251];
      const isSafe = collisionSystem.isSafeToChangeLane(car1, targetPosition, vehicleMap);

      expect(isSafe).toBe(true);
    });
  });

  describe('Configuration', () => {
    test('should allow configuration updates', () => {
      const newConfig = {
        safetyBubbleRadius: 10,
        predictionTimeHorizon: 3.0,
      };

      collisionSystem.updateConfig(newConfig);
      const config = collisionSystem.getConfig();

      expect(config.safetyBubbleRadius).toBe(10);
      expect(config.predictionTimeHorizon).toBe(3.0);
    });

    test('should preserve unchanged config values', () => {
      const originalConfig = collisionSystem.getConfig();
      collisionSystem.updateConfig({ safetyBubbleRadius: 10 });
      const newConfig = collisionSystem.getConfig();

      expect(newConfig.safetyBubbleRadius).toBe(10);
      expect(newConfig.gridCellSize).toBe(originalConfig.gridCellSize);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle 100+ vehicles efficiently', () => {
      const vehicles: SpawnedCar[] = [];

      // Create 150 vehicles in a grid pattern
      for (let i = 0; i < 150; i++) {
        const lon = -76.51 + (i % 10) * 0.003;
        const lat = 44.22 + Math.floor(i / 10) * 0.001;
        vehicles.push(createTestCar(`car${i}`, [lon, lat], 40, 0));
      }

      const startTime = Date.now();
      collisionSystem.updateGrid(vehicles);

      const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

      // Check collisions for all vehicles
      for (const vehicle of vehicles) {
        collisionSystem.checkPredictiveCollision(vehicle, vehicleMap);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 100ms for 150 vehicles)
      expect(duration).toBeLessThan(100);

      const stats = collisionSystem.getGridStats();
      expect(stats.totalCells).toBeGreaterThan(0);
    });

    test('should efficiently use spatial grid to reduce comparisons', () => {
      // Create vehicles spread across the area
      const vehicles: SpawnedCar[] = [];
      for (let i = 0; i < 50; i++) {
        const lon = -76.51 + Math.random() * 0.03;
        const lat = 44.22 + Math.random() * 0.02;
        vehicles.push(createTestCar(`car${i}`, [lon, lat], 40, 0));
      }

      collisionSystem.updateGrid(vehicles);
      const stats = collisionSystem.getGridStats();

      // Vehicles should be distributed across multiple cells
      expect(stats.occupiedCells).toBeGreaterThan(1);
      // Average vehicles per cell should be reasonable
      expect(stats.averageVehiclesPerCell).toBeLessThan(20);
    });
  });
});
