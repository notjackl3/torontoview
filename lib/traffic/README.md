# Traffic Collision Detection System

A high-performance collision detection system optimized for real-time traffic simulation with 100+ vehicles.

## Features

- **Spatial Grid Optimization**: Reduces collision checks from O(n²) to O(n)
- **Predictive Collision Detection**: Looks ahead 2 seconds to prevent accidents
- **Emergency Braking**: Triggers when collision is imminent
- **Safe Following Distance**: Implements 2-second rule
- **Lane Change Safety**: Validates lane changes before execution
- **60 FPS Performance**: Handles 100+ vehicles with minimal overhead

## Architecture

### Spatial Grid

The system uses a 50m x 50m spatial grid to partition vehicles:
- Each vehicle is assigned to a grid cell based on its position
- Collision checks only examine vehicles in the same or adjacent 8 cells
- This reduces the search space from all vehicles (n) to nearby vehicles (k where k << n)

### Collision Detection Phases

1. **Grid Update**: O(n) - Insert all vehicles into spatial grid
2. **Nearby Search**: O(k) - Find vehicles in adjacent cells
3. **Immediate Check**: O(k) - Check current positions
4. **Predictive Check**: O(k×s) - Project positions forward and check intersections

## Usage

### Basic Setup

```typescript
import { createCollisionSystem } from '@/lib/traffic/collisionSystem';

// Define simulation bounds (matches your map area)
const bounds = {
  south: 44.22,
  west: -76.51,
  north: 44.24,
  east: -76.48,
};

// Create collision system
const collisionSystem = createCollisionSystem(bounds, {
  gridCellSize: 50, // 50m cells
  safetyBubbleRadius: 5, // 5m safety radius
  predictionTimeHorizon: 2.0, // 2 seconds ahead
  emergencyBrakeThreshold: 1.5, // Emergency brake threshold
});
```

### Integration with Animation Loop

```typescript
function animate() {
  const deltaTime = (currentTime - lastTime) / 1000;

  // 1. Update collision grid (once per frame)
  const activeCars = spawner.getActiveCars();
  collisionSystem.updateGrid(activeCars);

  // 2. Create vehicle map for collision checks
  const vehicleMap = new Map(activeCars.map((car) => [car.id, car]));

  // 3. Update each vehicle
  activeCars.forEach((car) => {
    // Check for emergency situations
    if (collisionSystem.requiresEmergencyBrake(car, vehicleMap)) {
      // Emergency brake!
      car.speed = Math.max(0, car.speed - 100 * deltaTime);
    } else {
      // Check predictive collision
      const prediction = collisionSystem.checkPredictiveCollision(car, vehicleMap);

      if (prediction.detected && prediction.timeToCollision < 2.0) {
        // Slow down to avoid collision
        const brakingForce = 50 * (1 - prediction.timeToCollision / 2.0);
        car.speed = Math.max(0, car.speed - brakingForce * deltaTime);
      } else {
        // Normal acceleration
        car.speed = Math.min(car.maxSpeed, car.speed + 30 * deltaTime);
      }
    }

    // Update position
    spawner.updateCarPosition(car.id, deltaTime);
  });

  requestAnimationFrame(animate);
}
```

### Advanced Features

#### Safe Following Distance

```typescript
// Calculate safe distance based on speed
const safeDistance = collisionSystem.getSafeFollowingDistance(car.speed);

// Get vehicles ahead
const nearby = collisionSystem.getNearbyVehicles(car, safeDistance * 2, vehicleMap);

// Check if maintaining safe distance
const vehicleAhead = nearby[0];
if (vehicleAhead) {
  const currentDistance = turf.distance(
    turf.point(car.position),
    turf.point(vehicleAhead.position),
    { units: 'meters' }
  );

  if (currentDistance < safeDistance) {
    // Too close! Slow down to match leading vehicle's speed
    car.speed = Math.min(car.speed, vehicleAhead.speed);
  }
}
```

#### Lane Change Safety

```typescript
// Check if lane change is safe
const targetPosition: [number, number] = calculateLaneChangePosition(car);

if (collisionSystem.isSafeToChangeLane(car, targetPosition, vehicleMap)) {
  // Safe to change lanes
  car.position = targetPosition;
} else {
  // Stay in current lane
  console.log('Lane change blocked - vehicle in target position');
}
```

#### Immediate Collision Detection

```typescript
// Check for immediate safety bubble violations
const collision = collisionSystem.checkImmediateCollision(car, vehicleMap);

if (collision.detected) {
  console.warn(`Collision detected! Distance: ${collision.nearestDistance}m`);
  // Take evasive action
  car.speed = 0; // Emergency stop
}
```

## Performance Monitoring

```typescript
// Get grid statistics
const stats = collisionSystem.getGridStats();

console.log(`Grid Statistics:
  Total Cells: ${stats.totalCells}
  Occupied Cells: ${stats.occupiedCells}
  Avg Vehicles/Cell: ${stats.averageVehiclesPerCell.toFixed(2)}
  Max Vehicles/Cell: ${stats.maxVehiclesInCell}
`);
```

## Configuration Options

| Option                    | Default | Description                                    |
| ------------------------- | ------- | ---------------------------------------------- |
| `gridCellSize`            | 50      | Size of grid cells in meters                   |
| `safetyBubbleRadius`      | 5       | Safety radius around vehicles in meters        |
| `predictionTimeHorizon`   | 2.0     | How far ahead to predict in seconds            |
| `emergencyBrakeThreshold` | 1.5     | Time to collision for emergency brake          |

## Performance Characteristics

- **Grid Update**: O(n) where n = number of vehicles
- **Nearby Search**: O(k) where k = vehicles in 9 cells (typically 5-10)
- **Collision Check**: O(k × s) where s = number of prediction samples (4-5)

**Expected Performance**:
- 50 vehicles: ~5ms per frame
- 100 vehicles: ~10ms per frame
- 150 vehicles: ~15ms per frame

Tested on MacBook Pro M1, 60 FPS (16.67ms budget per frame).

## Algorithm Details

### Predictive Collision Detection

The system projects vehicle positions forward in time:

```
For time t from 0 to horizon in steps of 0.5s:
  1. Project car position: position + (speed × direction × t)
  2. Project other vehicles similarly
  3. Calculate distance between projected positions
  4. If distance < safety radius: collision detected at time t
```

### Emergency Braking Logic

```
if (timeToCollision < 1.5s):
  emergencyBrake = true
  deceleration = 100 km/h per second (hard brake)
elif (timeToCollision < 2.0s):
  deceleration = adaptive (50-80 km/h per second)
else:
  normalDriving = true
```

## Testing

Test files are located alongside the source code:

- `collisionSystem.test.ts`
- `signalCoordination.test.ts`
- `vehicleBehavior.test.ts`

Tests cover:
- Grid management and spatial partitioning
- Nearby vehicle detection
- Immediate collision detection
- Predictive collision detection
- Emergency braking logic
- Safe following distance
- Lane change safety
- Performance with 100+ vehicles

## Integration Checklist

- [ ] Create CollisionSystem instance
- [ ] Set simulation bounds
- [ ] Call `updateGrid()` once per frame before collision checks
- [ ] Check `requiresEmergencyBrake()` for each vehicle
- [ ] Implement braking logic based on collision predictions
- [ ] Monitor grid statistics for performance tuning
- [ ] Adjust configuration for your specific scenario

## Future Enhancements

Potential improvements for Phase 3:
- Multi-threaded collision detection using Web Workers
- Quadtree-based spatial indexing for dynamic grid sizing
- Ray casting for line-of-sight checks
- Vehicle-specific collision profiles (truck vs sedan)
- Collision history and analytics
- Visualization of safety bubbles and predicted paths

## License

Part of Nvidia Spark Hackathon 2026 traffic simulation project.
