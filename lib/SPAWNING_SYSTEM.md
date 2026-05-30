# Traffic-Based Car Spawning System

## Overview

The spawning system manages the lifecycle of autonomous vehicles in the traffic simulation. It handles:

- **Car spawning** at designated entry points around Queen's campus
- **Route planning** using A* pathfinding on the road network
- **Destination selection** with weighted probabilities
- **Car despawning** when vehicles reach their destinations
- **Traffic flow control** with configurable spawn rates

## Architecture

```
┌─────────────────┐
│  RoadNetwork    │ ← Fetches OSM road data
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Pathfinder     │ ← A* route finding
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│    Spawner      │ ← Main spawning logic
└─────────────────┘
         │
         ↓
┌─────────────────┐
│  SpawnedCar[]   │ ← Active vehicles
└─────────────────┘
```

## Key Components

### 1. SpawnPoint

Represents an entry point where cars enter the simulation.

```typescript
interface SpawnPoint {
  id: string;
  position: [number, number]; // [lon, lat]
  roadNodeId: string;
  spawnRate: number; // Cars per minute
  lastSpawnTime: number;
  direction?: string;
  active: boolean;
}
```

**Queen's Campus Spawn Points:**
- Union St (East & West)
- University Ave (North & South)
- Division St (North & South)
- Princess St (East & West)

### 2. SpawnedCar

Represents an active vehicle in the simulation.

```typescript
interface SpawnedCar {
  id: string;
  type: CarType; // sedan, suv, truck, compact
  color: string;
  position: [number, number];
  destination: Destination;
  route: Route; // A* pathfinding result
  currentEdgeId: string;
  distanceOnEdge: number;
  speed: number;
  maxSpeed: number;
  bearing: number;
  stoppedAtLight: boolean;
}
```

### 3. Spawner Class

Main class that orchestrates the spawning system.

**Key Methods:**

```typescript
// Initialize Queen's campus spawn points
spawner.initializeQueensSpawnPoints();

// Update spawner (call in animation loop)
spawner.update(deltaTime);

// Get active cars
const cars = spawner.getActiveCars();

// Update car position along route
spawner.updateCarPosition(carId, deltaTime);

// Get statistics
const stats = spawner.getStats();

// Reset simulation
spawner.reset();
```

### 4. Configuration

```typescript
interface SpawnerConfig {
  maxCars: number; // Max active vehicles
  globalSpawnRate: number; // Spawn rate multiplier
  despawnRadius: number; // Distance to despawn (meters)
  defaultCarSpeed: number; // Default max speed (km/h)
  carTypeDistribution: {
    sedan: number;    // 40%
    suv: number;      // 25%
    truck: number;    // 15%
    compact: number;  // 20%
  };
}
```

## Usage

### Basic Setup

```typescript
import { RoadNetwork } from './roadNetwork';
import { Spawner } from './spawning';

// 1. Create road network
const roadNetwork = new RoadNetwork();
await roadNetwork.fetchFromOSM(bounds);
roadNetwork.addQueensDestinations();

// 2. Create spawner
const spawner = new Spawner(roadNetwork, {
  maxCars: 30,
  globalSpawnRate: 1.0,
});

// 3. Initialize spawn points
spawner.initializeQueensSpawnPoints();

// 4. Update in animation loop
function animate() {
  const deltaTime = 0.016; // 60 FPS
  spawner.update(deltaTime);

  // Render cars
  spawner.getActiveCars().forEach(car => {
    renderCar(car);
  });

  requestAnimationFrame(animate);
}
```

### Integration with Map.tsx

See `/lib/spawning-integration.ts` for complete integration examples.

**Key Steps:**

1. Replace manual car creation with spawner initialization
2. Update animation loop to use `spawner.update()`
3. Use `spawner.getActiveCars()` to get cars to render
4. Use `spawner.updateCarPosition()` to move cars along routes
5. Handle car mesh creation/removal based on spawn/despawn events

### Traffic Light Integration

```typescript
// Check if car should stop at traffic light
function checkTrafficLights(car: SpawnedCar, lights: TrafficLight[]): boolean {
  for (const light of lights) {
    const distance = turf.distance(
      turf.point(car.position),
      turf.point(light.position),
      { units: 'meters' }
    );

    if (distance < 30 && (light.state === 'red' || light.state === 'yellow')) {
      return true;
    }
  }
  return false;
}

// Update car speed
const shouldStop = checkTrafficLights(car, trafficLights);
if (shouldStop) {
  car.speed = Math.max(0, car.speed - 50 * deltaTime);
} else {
  car.speed = Math.min(car.maxSpeed, car.speed + 30 * deltaTime);
}
```

## Destinations

The system uses weighted random selection for destinations:

```typescript
const destinations = [
  {
    id: 'stauffer-library',
    name: 'Stauffer Library',
    position: [-76.4950, 44.2285],
    type: 'building',
    weight: 3, // 3x more likely than weight=1
  },
  {
    id: 'main-parking',
    name: 'Main Campus Parking',
    position: [-76.4920, 44.2300],
    type: 'parking_lot',
    capacity: 100,
    weight: 4, // 4x more likely
  },
  // ... more destinations
];
```

## Spawn Rate Calculation

Each spawn point has an independent spawn rate:

```typescript
spawnInterval = 60000 / (spawnPoint.spawnRate * globalSpawnRate)
```

Example:
- `spawnRate = 2.0` cars/min
- `globalSpawnRate = 1.2` (multiplier)
- `spawnInterval = 60000 / (2.0 * 1.2) = 25000ms = 25 seconds`

## Car Lifecycle

```
┌──────────────┐
│   SPAWNED    │ ← Car created at spawn point
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  NAVIGATING  │ ← Following A* route to destination
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  APPROACHING │ ← Within despawnRadius of destination
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  DESPAWNED   │ ← Removed from simulation
└──────────────┘
```

## Performance Optimization

**Spawn Rate Management:**
```typescript
// Reduce spawn rate during high traffic
if (spawner.getStats().activeCars > 40) {
  spawner.updateConfig({ globalSpawnRate: 0.5 });
}

// Increase spawn rate during low traffic
if (spawner.getStats().activeCars < 10) {
  spawner.updateConfig({ globalSpawnRate: 1.5 });
}
```

**Car Limit:**
```typescript
// Hard limit prevents performance degradation
spawner.updateConfig({ maxCars: 50 });
```

**Despawn Radius:**
```typescript
// Larger radius = cars despawn earlier
spawner.updateConfig({ despawnRadius: 30 }); // 30 meters
```

## Debugging

**Enable visualization:**
```typescript
// Show spawn points (green circles)
addSpawnPointsToMap(map, spawner);

// Show destinations (magenta circles)
addDestinationsToMap(map, roadNetwork);

// Log stats every 5 seconds
setInterval(() => {
  const stats = spawner.getStats();
  console.log(`Cars: ${stats.activeCars}/${stats.maxCars}`);
}, 5000);
```

**Common Issues:**

1. **No cars spawning:**
   - Check if spawn points are active: `spawnPoint.active === true`
   - Verify road network loaded: `roadNetwork.getNodes().length > 0`
   - Check destinations exist: `roadNetwork.getDestinations().length > 0`

2. **Cars stuck:**
   - Verify route was found: `car.route !== null`
   - Check edge geometry: `edge.geometry.length >= 2`
   - Ensure pathfinding succeeded

3. **Performance issues:**
   - Reduce `maxCars` config
   - Lower `globalSpawnRate`
   - Increase `despawnRadius`

## Advanced Features

### Custom Spawn Points

```typescript
spawner.addSpawnPoint({
  id: 'custom-entry',
  position: [-76.5000, 44.2300],
  roadNodeId: 'node-123',
  spawnRate: 1.5,
  direction: 'northbound',
  lastSpawnTime: Date.now(),
  active: true,
});
```

### Custom Destinations

```typescript
roadNetwork.addDestination({
  id: 'custom-building',
  name: 'Custom Building',
  position: [-76.4950, 44.2280],
  type: 'building',
  weight: 2,
});
```

### Dynamic Spawn Rate Adjustment

```typescript
// Adjust spawn rate based on time of day
const hour = new Date().getHours();
if (hour >= 8 && hour <= 17) {
  // Rush hour: more traffic
  spawner.updateConfig({ globalSpawnRate: 1.5 });
} else {
  // Off-hours: less traffic
  spawner.updateConfig({ globalSpawnRate: 0.5 });
}
```

### Car Type Distribution

```typescript
// More trucks during morning hours
spawner.updateConfig({
  carTypeDistribution: {
    sedan: 0.3,
    suv: 0.2,
    truck: 0.3, // Increased
    compact: 0.2,
  },
});
```

## API Reference

See TypeScript definitions in `/lib/spawning.ts` for complete API documentation.

**Key Classes:**
- `Spawner` - Main spawning controller
- `SpawnPoint` - Entry point definition
- `SpawnedCar` - Active vehicle data
- `SpawnerConfig` - Configuration options

**Key Imports:**
```typescript
import { Spawner, SpawnedCar, SpawnPoint, SpawnerConfig } from './spawning';
import { RoadNetwork, Destination } from './roadNetwork';
import { Pathfinder, Route } from './pathfinding';
```

## Testing

```typescript
// Unit test example
describe('Spawner', () => {
  it('should spawn cars at correct rate', () => {
    const spawner = new Spawner(roadNetwork, {
      maxCars: 10,
      globalSpawnRate: 1.0,
    });

    spawner.initializeQueensSpawnPoints();

    // Simulate 60 seconds
    for (let i = 0; i < 60; i++) {
      spawner.update(1.0);
    }

    expect(spawner.getActiveCars().length).toBeGreaterThan(0);
  });
});
```

## Future Enhancements

- [ ] Car-following behavior (maintain safe distance)
- [ ] Lane changing logic
- [ ] Emergency vehicle priority
- [ ] Parking lot capacity management
- [ ] Traffic congestion detection
- [ ] Real-time spawn rate adjustment based on traffic density
- [ ] Multi-agent coordination at intersections
- [ ] Pedestrian interaction
- [ ] Weather-based spawn rate modulation
