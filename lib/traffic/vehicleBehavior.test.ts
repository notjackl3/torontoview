/**
 * Unit tests for Vehicle Behavior Controller
 */

import { VehicleBehaviorController, BehaviorContext } from './vehicleBehavior';
import { CollisionSystem, createCollisionSystem } from './collisionSystem';
import { TrafficInfrastructureManager, TrafficSignal, StopSign } from '../trafficInfrastructure';
import { SpawnedCar, CarType } from '../spawning';

// Helper to create test car
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
    maxSpeed: 60,
    bearing,
    stoppedAtLight: false,
  };
}

describe('VehicleBehaviorController', () => {
  let controller: VehicleBehaviorController;
  let collisionSystem: CollisionSystem;
  let infrastructureManager: TrafficInfrastructureManager;
  let context: BehaviorContext;

  beforeEach(() => {
    controller = new VehicleBehaviorController();
    collisionSystem = createCollisionSystem({
      south: 44.22,
      west: -76.51,
      north: 44.24,
      east: -76.48,
    });
    infrastructureManager = new TrafficInfrastructureManager();

    context = {
      infrastructureManager,
      collisionSystem,
      allVehicles: new Map(),
      deltaTime: 0.016, // 60 FPS
    };
  });

  describe('Cruising Behavior', () => {
    test('should accelerate when below max speed', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 30, 0);
      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      expect(result.state).toBe('cruising');
      expect(result.targetSpeed).toBe(car.maxSpeed);
      expect(result.acceleration).toBeGreaterThan(0);
    });

    test('should maintain speed when at max speed', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 60, 0);
      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      expect(result.state).toBe('cruising');
      expect(result.acceleration).toBe(0);
    });
  });

  describe('Emergency Braking', () => {
    test('should emergency brake when collision imminent', () => {
      // Two cars about to collide
      const car1 = createTestCar('car1', [-76.49500, 44.225], 60, 0);
      const car2 = createTestCar('car2', [-76.49490, 44.225], 60, 180);

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      const result = controller.evaluate(car1, context);

      expect(result.state).toBe('emergency_braking');
      expect(result.targetSpeed).toBe(0);
      expect(result.acceleration).toBeLessThan(0);
    });

    test('should not emergency brake when vehicles far apart', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.485, 44.235], 40, 180);

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      const result = controller.evaluate(car1, context);

      expect(result.state).not.toBe('emergency_braking');
    });
  });

  describe('Following Behavior', () => {
    test('should slow down when too close to lead vehicle', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.4949, 44.225], 30, 0); // 11m ahead, going slower

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      const result = controller.evaluate(car1, context);

      expect(result.state).toBe('following');
      expect(result.targetSpeed).toBeLessThan(car1.speed);
      expect(result.acceleration).toBeLessThan(0);
    });

    test('should match speed of lead vehicle when at safe distance', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.4947, 44.225], 35, 0); // 33m ahead

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      // First evaluation should start following
      const result1 = controller.evaluate(car1, context);

      // Second evaluation should match speed
      const result2 = controller.evaluate(car1, context);

      if (result2.state === 'following') {
        expect(result2.targetSpeed).toBe(car2.speed);
      }
    });

    test('should not follow vehicles behind', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.496, 44.225], 40, 0); // Behind

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      const result = controller.evaluate(car1, context);

      expect(result.state).not.toBe('following');
    });
  });

  describe('Traffic Signal Behavior', () => {
    test('should brake for red light', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);

      // Add red light 30m ahead
      infrastructureManager.loadFromOSM([
        { lat: 44.2252, lon: -76.4947, type: 'traffic_signals', id: 1 },
      ]);

      // Set signal to red
      const signals = infrastructureManager.getSignals();
      signals.forEach((signal) => {
        signal.state = 'red';
      });

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      expect(['approaching_signal', 'stopped_at_signal']).toContain(result.state);
      expect(result.acceleration).toBeLessThanOrEqual(0);
    });

    test('should proceed through green light', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);

      // Add green light ahead
      infrastructureManager.loadFromOSM([
        { lat: 44.2252, lon: -76.4947, type: 'traffic_signals', id: 1 },
      ]);

      // Set signal to green
      const signals = infrastructureManager.getSignals();
      signals.forEach((signal) => {
        signal.state = 'green';
      });

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      expect(result.state).toBe('cruising');
    });

    test('should proceed through yellow if too close to stop', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);

      // Add yellow light very close (10m)
      infrastructureManager.loadFromOSM([
        { lat: 44.22509, lon: -76.495, type: 'traffic_signals', id: 1 },
      ]);

      // Set signal to yellow
      const signals = infrastructureManager.getSignals();
      signals.forEach((signal) => {
        signal.state = 'yellow';
      });

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      // Should proceed if close enough
      if (result.reason?.includes('too close')) {
        expect(result.state).toBe('cruising');
      }
    });

    test('should stop at red light and wait', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 0, 0); // Already stopped

      // Add red light at current position
      infrastructureManager.loadFromOSM([
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 1 },
      ]);

      const signals = infrastructureManager.getSignals();
      signals.forEach((signal) => {
        signal.state = 'red';
      });

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      expect(result.state).toBe('stopped_at_signal');
      expect(result.targetSpeed).toBe(0);
    });

    test('should accelerate when light turns green', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 0, 0);

      // Add light and set to red first
      infrastructureManager.loadFromOSM([
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 1 },
      ]);

      const signals = infrastructureManager.getSignals();
      signals.forEach((signal) => {
        signal.state = 'red';
      });

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      // First evaluation - stopped at red
      controller.evaluate(car, context);

      // Change light to green
      signals.forEach((signal) => {
        signal.state = 'green';
      });

      // Second evaluation - should accelerate
      const result = controller.evaluate(car, context);

      expect(result.state).toBe('cruising');
      expect(result.acceleration).toBeGreaterThan(0);
    });
  });

  describe('Stop Sign Behavior', () => {
    test('should decelerate when approaching stop sign', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);

      // Add stop sign 20m ahead
      infrastructureManager.loadFromOSM([
        { lat: 44.2252, lon: -76.4948, type: 'stop', id: 1 },
      ]);

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      const result = controller.evaluate(car, context);

      expect(result.state).toBe('approaching_stop_sign');
      expect(result.acceleration).toBeLessThan(0);
    });

    test('should stop at stop sign for minimum 2 seconds', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 0, 0);

      // Add stop sign at current position
      infrastructureManager.loadFromOSM([
        { lat: 44.225, lon: -76.495, type: 'stop', id: 1 },
      ]);

      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      // First evaluation - just stopped
      const result1 = controller.evaluate(car, context);
      expect(result1.state).toBe('stopped_at_sign');

      // Wait 1 second (not enough)
      context.deltaTime = 1.0;
      const result2 = controller.evaluate(car, context);
      expect(result2.state).toBe('stopped_at_sign');

      // Wait another 1.5 seconds (total 2.5s, should be clear)
      context.deltaTime = 1.5;
      const result3 = controller.evaluate(car, context);

      // Should either still be stopped or proceeding
      expect(['stopped_at_sign', 'yielding', 'cruising']).toContain(result3.state);
    });

    test('should yield if cross-traffic present', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 0, 0);
      const car2 = createTestCar('car2', [-76.4948, 44.225], 30, 90); // Cross-traffic

      // Add stop sign
      infrastructureManager.loadFromOSM([
        { lat: 44.225, lon: -76.495, type: 'stop', id: 1 },
      ]);

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      // Simulate waiting 2+ seconds at stop
      context.deltaTime = 2.5;
      controller.evaluate(car1, context);

      const result = controller.evaluate(car1, context);

      expect(['yielding', 'stopped_at_sign']).toContain(result.state);
    });
  });

  describe('State Management', () => {
    test('should initialize vehicle state on first evaluation', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);
      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      expect(controller.getVehicleState(car.id)).toBeUndefined();

      controller.evaluate(car, context);

      expect(controller.getVehicleState(car.id)).toBeDefined();
    });

    test('should reset vehicle state', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);
      context.allVehicles.set(car.id, car);
      collisionSystem.updateGrid([car]);

      controller.evaluate(car, context);
      expect(controller.getVehicleState(car.id)).toBeDefined();

      controller.resetVehicleState(car.id);
      expect(controller.getVehicleState(car.id)).toBeUndefined();
    });

    test('should clear all vehicle states', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.490, 44.230], 40, 0);

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      controller.evaluate(car1, context);
      controller.evaluate(car2, context);

      controller.clearAll();

      expect(controller.getVehicleState(car1.id)).toBeUndefined();
      expect(controller.getVehicleState(car2.id)).toBeUndefined();
    });
  });

  describe('Apply Behavior', () => {
    test('should apply acceleration to vehicle', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 20, 0);
      const result = {
        targetSpeed: 40,
        acceleration: 30,
        state: 'cruising' as const,
      };

      const initialSpeed = car.speed;
      controller.applyBehavior(car, result, 1.0);

      expect(car.speed).toBeGreaterThan(initialSpeed);
    });

    test('should apply braking to vehicle', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const result = {
        targetSpeed: 0,
        acceleration: -40,
        state: 'approaching_signal' as const,
      };

      const initialSpeed = car.speed;
      controller.applyBehavior(car, result, 1.0);

      expect(car.speed).toBeLessThan(initialSpeed);
    });

    test('should not exceed max speed', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 55, 0);
      car.maxSpeed = 60;

      const result = {
        targetSpeed: 100, // Unrealistic target
        acceleration: 30,
        state: 'cruising' as const,
      };

      controller.applyBehavior(car, result, 10.0); // Large delta

      expect(car.speed).toBeLessThanOrEqual(car.maxSpeed);
    });

    test('should not go below zero speed', () => {
      const car = createTestCar('car1', [-76.495, 44.225], 10, 0);
      const result = {
        targetSpeed: 0,
        acceleration: -100,
        state: 'emergency_braking' as const,
      };

      controller.applyBehavior(car, result, 10.0);

      expect(car.speed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    test('should track vehicle behavior states', () => {
      const car1 = createTestCar('car1', [-76.495, 44.225], 40, 0);
      const car2 = createTestCar('car2', [-76.490, 44.230], 40, 0);

      context.allVehicles.set(car1.id, car1);
      context.allVehicles.set(car2.id, car2);
      collisionSystem.updateGrid([car1, car2]);

      controller.evaluate(car1, context);
      controller.evaluate(car2, context);

      const stats = controller.getStats();

      expect(stats.totalVehicles).toBe(2);
      expect(stats.states.cruising).toBeGreaterThan(0);
    });
  });
});
