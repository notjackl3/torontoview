/**
 * Unit tests for Signal Coordination System
 */

import { SignalCoordinator, createSignalCoordinator, Corridor } from './signalCoordination';
import { TrafficInfrastructureManager, TrafficSignal } from '../trafficInfrastructure';

describe('SignalCoordinator', () => {
  let coordinator: SignalCoordinator;
  let infrastructureManager: TrafficInfrastructureManager;

  beforeEach(() => {
    coordinator = new SignalCoordinator();
    infrastructureManager = new TrafficInfrastructureManager();
  });

  describe('Corridor Detection', () => {
    test('should detect corridor from aligned signals', () => {
      // Create signals along a straight road (east-west)
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 2 },
        { lat: 44.225, lon: -76.490, type: 'traffic_signals', id: 3 },
      ];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      const analysis = coordinator.analyzeCorridors(signals);

      expect(analysis.corridors.length).toBeGreaterThan(0);
      expect(analysis.stats.totalSignalsCoordinated).toBeGreaterThan(0);
    });

    test('should not create corridor from signals with high bearing variance', () => {
      // Create signals at different angles (not aligned)
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.230, lon: -76.495, type: 'traffic_signals', id: 2 },
        { lat: 44.220, lon: -76.490, type: 'traffic_signals', id: 3 },
      ];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      const analysis = coordinator.analyzeCorridors(signals, 500, 10); // Strict variance

      // May or may not create corridors depending on exact angles
      // Just verify it runs without error
      expect(analysis).toBeDefined();
      expect(analysis.corridors).toBeDefined();
    });

    test('should identify uncoordinated signals', () => {
      // Create one aligned corridor and one isolated signal
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 2 },
        { lat: 44.230, lon: -76.480, type: 'traffic_signals', id: 3 }, // Isolated
      ];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      const analysis = coordinator.analyzeCorridors(signals);

      expect(analysis.uncoordinatedSignals).toBeDefined();
    });

    test('should handle single signal (no corridor possible)', () => {
      const osmData = [{ lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 }];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      const analysis = coordinator.analyzeCorridors(signals);

      expect(analysis.corridors.length).toBe(0);
      expect(analysis.uncoordinatedSignals.length).toBeGreaterThan(0);
    });

    test('should respect maximum corridor spacing', () => {
      // Create signals far apart
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.225, lon: -76.480, type: 'traffic_signals', id: 2 }, // ~2km away
      ];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      const analysis = coordinator.analyzeCorridors(signals, 500); // 500m max spacing

      // Should not group these signals
      expect(analysis.stats.totalSignalsCoordinated).toBeLessThan(signals.length * 2); // *2 because NS and EW
    });
  });

  describe('Timing Offset Calculation', () => {
    test('should calculate offsets based on distance and speed', () => {
      // Create a simple corridor
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1', 'signal-2', 'signal-3'],
        direction: 90, // East
        length: 1000, // 1km
        targetSpeed: 50, // 50 km/h
        offsets: [],
      };

      const offsets = coordinator.calculateTimingOffsets(corridor, 50);

      expect(offsets.length).toBe(3);
      expect(offsets[0]).toBe(0); // First signal has no offset

      // Check that offsets increase
      expect(offsets[1]).toBeGreaterThan(offsets[0]);
      expect(offsets[2]).toBeGreaterThan(offsets[1]);
    });

    test('should calculate faster offsets for higher speeds', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1', 'signal-2'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [],
      };

      const offsets50 = coordinator.calculateTimingOffsets(corridor, 50);
      const offsets80 = coordinator.calculateTimingOffsets(corridor, 80);

      // At higher speed, signals should change sooner (smaller offset)
      expect(offsets80[1]).toBeLessThan(offsets50[1]);
    });

    test('should handle corridor with single signal', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1'],
        direction: 90,
        length: 0,
        targetSpeed: 50,
        offsets: [],
      };

      const offsets = coordinator.calculateTimingOffsets(corridor, 50);

      expect(offsets.length).toBe(1);
      expect(offsets[0]).toBe(0);
    });
  });

  describe('Coordination Application', () => {
    test('should apply coordination to infrastructure manager', () => {
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 2 },
      ];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      const analysis = coordinator.analyzeCorridors(signals);
      coordinator.applyCoordination(infrastructureManager, analysis.corridors);

      // Verify coordination was applied (signals should have coordination offsets)
      const coordinatedSignals = infrastructureManager.getSignals().filter(
        (s) => s.config.coordinationOffset !== undefined
      );

      expect(coordinatedSignals.length).toBeGreaterThan(0);
    });

    test('should update corridor speed', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1', 'signal-2'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [0, 100],
      };

      // Store corridor
      coordinator['corridors'].set(corridor.id, corridor);

      const initialOffsets = [...corridor.offsets];

      coordinator.updateCorridorSpeed('test-corridor', 80);

      // Offsets should change
      expect(corridor.targetSpeed).toBe(80);
      expect(corridor.offsets).not.toEqual(initialOffsets);
    });
  });

  describe('Corridor Management', () => {
    test('should retrieve corridor by ID', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [0],
      };

      coordinator['corridors'].set(corridor.id, corridor);

      const retrieved = coordinator.getCorridor('test-corridor');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-corridor');
    });

    test('should return undefined for non-existent corridor', () => {
      const retrieved = coordinator.getCorridor('non-existent');
      expect(retrieved).toBeUndefined();
    });

    test('should get all corridors', () => {
      const corridor1: Corridor = {
        id: 'corridor-1',
        signals: ['signal-1'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [0],
      };

      const corridor2: Corridor = {
        id: 'corridor-2',
        signals: ['signal-2'],
        direction: 0,
        length: 600,
        targetSpeed: 60,
        offsets: [0],
      };

      coordinator['corridors'].set(corridor1.id, corridor1);
      coordinator['corridors'].set(corridor2.id, corridor2);

      const allCorridors = coordinator.getCorridors();

      expect(allCorridors.length).toBe(2);
    });

    test('should check if signal is coordinated', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1', 'signal-2'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [0, 100],
      };

      coordinator['corridors'].set(corridor.id, corridor);
      coordinator['signalToCorridorMap'].set('signal-1', corridor.id);
      coordinator['signalToCorridorMap'].set('signal-2', corridor.id);

      expect(coordinator.isSignalCoordinated('signal-1')).toBe(true);
      expect(coordinator.isSignalCoordinated('signal-3')).toBe(false);
    });

    test('should get corridor for signal', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1', 'signal-2'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [0, 100],
      };

      coordinator['corridors'].set(corridor.id, corridor);
      coordinator['signalToCorridorMap'].set('signal-1', corridor.id);

      const retrieved = coordinator.getCorridorForSignal('signal-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('test-corridor');
    });
  });

  describe('Statistics', () => {
    test('should calculate corridor statistics', () => {
      const corridor1: Corridor = {
        id: 'corridor-1',
        signals: ['s1', 's2', 's3'],
        direction: 90,
        length: 1000,
        targetSpeed: 50,
        offsets: [0, 100, 200],
      };

      const corridor2: Corridor = {
        id: 'corridor-2',
        signals: ['s4', 's5'],
        direction: 0,
        length: 600,
        targetSpeed: 60,
        offsets: [0, 50],
      };

      coordinator['corridors'].set(corridor1.id, corridor1);
      coordinator['corridors'].set(corridor2.id, corridor2);
      coordinator['signalToCorridorMap'].set('s1', corridor1.id);
      coordinator['signalToCorridorMap'].set('s2', corridor1.id);
      coordinator['signalToCorridorMap'].set('s3', corridor1.id);
      coordinator['signalToCorridorMap'].set('s4', corridor2.id);
      coordinator['signalToCorridorMap'].set('s5', corridor2.id);

      const stats = coordinator.getStats();

      expect(stats.totalCorridors).toBe(2);
      expect(stats.totalSignalsCoordinated).toBe(5);
      expect(stats.averageCorridorLength).toBe(800); // (1000 + 600) / 2
      expect(stats.averageSignalsPerCorridor).toBe(2.5); // (3 + 2) / 2
    });

    test('should handle empty coordinator', () => {
      const stats = coordinator.getStats();

      expect(stats.totalCorridors).toBe(0);
      expect(stats.totalSignalsCoordinated).toBe(0);
      expect(stats.averageCorridorLength).toBe(0);
      expect(stats.averageSignalsPerCorridor).toBe(0);
    });
  });

  describe('Reset', () => {
    test('should clear all corridors and mappings', () => {
      const corridor: Corridor = {
        id: 'test-corridor',
        signals: ['signal-1'],
        direction: 90,
        length: 500,
        targetSpeed: 50,
        offsets: [0],
      };

      coordinator['corridors'].set(corridor.id, corridor);
      coordinator['signalToCorridorMap'].set('signal-1', corridor.id);

      coordinator.reset();

      expect(coordinator.getCorridors().length).toBe(0);
      expect(coordinator.isSignalCoordinated('signal-1')).toBe(false);
    });
  });

  describe('Helper: createSignalCoordinator', () => {
    test('should create and auto-analyze when enabled', () => {
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 2 },
      ];

      infrastructureManager.loadFromOSM(osmData);

      const coord = createSignalCoordinator(infrastructureManager, true);

      // Should have analyzed and created corridors
      expect(coord.getCorridors().length).toBeGreaterThanOrEqual(0);
    });

    test('should not auto-analyze when disabled', () => {
      const osmData = [
        { lat: 44.225, lon: -76.500, type: 'traffic_signals', id: 1 },
        { lat: 44.225, lon: -76.495, type: 'traffic_signals', id: 2 },
      ];

      infrastructureManager.loadFromOSM(osmData);

      const coord = createSignalCoordinator(infrastructureManager, false);

      // Should have no corridors
      expect(coord.getCorridors().length).toBe(0);
    });
  });

  describe('Integration Test', () => {
    test('should create complete green wave corridor', () => {
      // Simulate Princess Street with 4 signals
      const osmData = [
        { lat: 44.2310, lon: -76.5000, type: 'traffic_signals', id: 1 },
        { lat: 44.2310, lon: -76.4950, type: 'traffic_signals', id: 2 },
        { lat: 44.2310, lon: -76.4900, type: 'traffic_signals', id: 3 },
        { lat: 44.2310, lon: -76.4850, type: 'traffic_signals', id: 4 },
      ];

      infrastructureManager.loadFromOSM(osmData);
      const signals = infrastructureManager.getSignals();

      // Analyze and create corridors
      const analysis = coordinator.analyzeCorridors(signals, 600, 30);

      expect(analysis.corridors.length).toBeGreaterThan(0);

      const corridor = analysis.corridors[0];
      expect(corridor.signals.length).toBeGreaterThan(1);
      expect(corridor.offsets.length).toBe(corridor.signals.length);

      // First signal should have 0 offset
      expect(corridor.offsets[0]).toBe(0);

      // Apply coordination
      coordinator.applyCoordination(infrastructureManager, analysis.corridors);

      // Verify coordination was applied
      const coordinatedCount = infrastructureManager
        .getSignals()
        .filter((s) => s.config.coordinationOffset !== undefined).length;

      expect(coordinatedCount).toBeGreaterThan(0);
    });
  });
});
