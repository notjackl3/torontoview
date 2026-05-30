# Traffic Impact Analysis — Implementation Plan

## Overview

Transform the existing traffic simulation from a visual demo into an analytical tool. Add trip generation from placed buildings, before/after traffic density comparison, congestion detection, and fix traffic signal visuals.

## Architecture

```
lib/
  traffic/
    tripGeneration.ts        -- ITE-based trip generation from building type + size
    trafficDensity.ts        -- Per-road-segment vehicle density measurement
    congestionAnalysis.ts    -- Identify congested segments, before/after delta
components/
  TrafficImpactPanel.tsx     -- Before/after comparison dashboard
  RoadHeatmap.tsx            -- Road color coding by congestion level
```

## Step 1: Trip Generation Model

**File: `lib/traffic/tripGeneration.ts`**

ITE Trip Generation rates (publicly available summaries):

```typescript
// Daily vehicle trips per unit/area
const ITE_RATES: Record<string, { perUnit: number; unit: string }> = {
  // Residential
  'single-family':      { perUnit: 9.44,  unit: 'dwelling' },
  'apartment':          { perUnit: 6.65,  unit: 'dwelling' },
  'condo':              { perUnit: 5.81,  unit: 'dwelling' },
  'senior-housing':     { perUnit: 3.48,  unit: 'dwelling' },
  // Commercial
  'office':             { perUnit: 9.74,  unit: '1000sqft' },
  'retail':             { perUnit: 42.70, unit: '1000sqft' },
  'shopping-center':    { perUnit: 37.75, unit: '1000sqft' },
  'restaurant':         { perUnit: 83.84, unit: '1000sqft' },
  // Institutional
  'school':             { perUnit: 15.43, unit: '1000sqft' },
  'university':         { perUnit: 2.38,  unit: 'student' },
  'hospital':           { perUnit: 10.72, unit: '1000sqft' },
  // Industrial
  'warehouse':          { perUnit: 3.56,  unit: '1000sqft' },
  'light-industrial':   { perUnit: 6.97,  unit: '1000sqft' },
};
```

Map Toronto zoning codes (from `lib/torontoZoning.ts`, 76 zone types) to ITE categories:

```typescript
function zoneToITECategory(zoneCode: string): string {
  if (zoneCode.startsWith('UR'))  return 'single-family';
  if (zoneCode.startsWith('URM')) return 'apartment';
  if (zoneCode.startsWith('MU'))  return 'apartment'; // mixed-use, residential component
  if (zoneCode.startsWith('DT'))  return 'retail';     // downtown cores
  if (zoneCode.startsWith('C'))   return 'retail';
  if (zoneCode.startsWith('M'))   return 'light-industrial';
  if (zoneCode.startsWith('IN'))  return 'school';     // institutional
  // ... etc
  return 'office'; // default fallback
}
```

Estimate trips for a placed building:

```typescript
interface TripGeneration {
  dailyTrips: number;
  peakHourTrips: number;     // Typically 10% of daily
  tripsByHour: number[];     // 24 values, distribution curve
  category: string;
}

function estimateTrips(
  buildingSpec: BuildingSpecification,
  zoneCode: string
): TripGeneration {
  const category = zoneToITECategory(zoneCode);
  const rate = ITE_RATES[category];

  let units: number;
  if (rate.unit === 'dwelling') {
    // Estimate dwellings from floor area
    const floorArea = buildingSpec.width * buildingSpec.depth * buildingSpec.numberOfFloors;
    const avgUnitSize = 75; // sq m
    units = Math.max(1, Math.round(floorArea * 0.7 / avgUnitSize));
  } else if (rate.unit === '1000sqft') {
    const floorAreaSqft = buildingSpec.width * buildingSpec.depth *
      buildingSpec.numberOfFloors * 10.764; // m² to sqft
    units = floorAreaSqft / 1000;
  }

  const dailyTrips = Math.round(rate.perUnit * units);
  const peakHourTrips = Math.round(dailyTrips * 0.10);

  // Distribute across hours using typical AM/PM peak pattern
  const tripsByHour = distributeTripsOverDay(dailyTrips, category);

  return { dailyTrips, peakHourTrips, tripsByHour, category };
}
```

The `distributeTripsOverDay` function applies a typical bimodal curve:
- AM peak: 7-9am (~15% of daily)
- Midday: 11am-2pm (~20%)
- PM peak: 4-7pm (~25%)
- Off-peak: remaining hours share the rest

## Step 2: Inject Generated Trips into Simulation

**File: modifications to `lib/spawning.ts`**

Add a method to the `Spawner` class to create building-specific spawn points:

```typescript
addBuildingSpawnPoint(
  buildingPosition: [number, number],  // [lng, lat]
  tripsPerMinute: number,
  nearestRoadNodeId: string
): string  // returns spawn point ID
```

Implementation:
1. Find the nearest road node to the building's lat/lng using the road network graph. The `RoadNetwork` class already has `nodes: Map<string, RoadNode>` — iterate and find the closest by distance.
2. Create a new `SpawnPoint` with `position = buildingPosition`, `roadNodeId = nearestRoadNodeId`, `spawnRate = tripsPerMinute`.
3. Add to `this.spawnPoints` array.
4. The existing `update()` loop (line 519-605) will automatically spawn cars from this point based on `spawnRate`.

For the simulation, convert `peakHourTrips` to `tripsPerMinute`:
```typescript
const tripsPerMinute = peakHourTrips / 60;
```

The spawned vehicles will use the existing pathfinding to route to random destinations — this models outbound trips. For inbound trips, add the building as a new `Destination` in the road network:
```typescript
addBuildingDestination(
  buildingPosition: [number, number],
  buildingId: string,
  weight: number  // Higher weight = more cars route here
)
```

## Step 3: Traffic Density Measurement

**File: `lib/traffic/trafficDensity.ts`**

Measure vehicle density per road segment over a time window:

```typescript
interface RoadSegmentDensity {
  edgeId: string;
  edgeName?: string;
  vehicleCount: number;        // Current vehicles on this edge
  vehiclesPerKm: number;       // Density metric
  avgSpeedKmh: number;         // Average speed on this segment
  capacityUtilization: number; // 0-1, based on lanes and length
  congestionLevel: 'free-flow' | 'moderate' | 'congested' | 'gridlock';
}

class TrafficDensityTracker {
  private samples: Map<string, { counts: number[]; speeds: number[] }>;

  // Called each frame from animation loop
  sampleCurrentState(activeCars: Map<string, SpawnedCar>): void {
    // Group cars by currentEdgeId
    // Record count and average speed per edge
  }

  // Get averaged density over last N seconds
  getDensityReport(windowSeconds: number): RoadSegmentDensity[] {
    // Average samples over window
    // Calculate congestion level based on:
    //   - vehiclesPerKm vs capacity (lanes * 15 vehicles/km typical capacity)
    //   - speed vs speedLimit ratio
  }
}
```

Congestion classification:
- **Free flow**: speed > 80% of speed limit, density < 50% capacity
- **Moderate**: speed 50-80% of limit, density 50-75% capacity
- **Congested**: speed 25-50% of limit, density 75-90% capacity
- **Gridlock**: speed < 25% of limit, density > 90% capacity

Road capacity estimation from `RoadEdge` properties:
```typescript
const capacityPerLanePerKm = 15; // vehicles
const capacity = edge.lanes * edge.length/1000 * capacityPerLanePerKm;
```

## Step 4: Before/After Comparison

**File: `lib/traffic/congestionAnalysis.ts`**

```typescript
interface TrafficComparison {
  baseline: RoadSegmentDensity[];        // Without building
  withBuilding: RoadSegmentDensity[];    // With building
  deltas: RoadSegmentDelta[];            // Per-segment change
  summary: {
    segmentsBecameCongested: number;
    avgSpeedReduction: number;           // km/h
    totalAdditionalTrips: number;
    worstAffectedRoad: string;
    worstSpeedReduction: number;
  };
}

interface RoadSegmentDelta {
  edgeId: string;
  edgeName?: string;
  densityChange: number;                 // vehicles/km delta
  speedChange: number;                   // km/h delta (negative = slower)
  congestionBefore: string;
  congestionAfter: string;
  worsened: boolean;
}
```

Workflow:
1. **Capture baseline**: Run simulation for 60 seconds without building spawn points. Sample density every second. Average.
2. **Add building trips**: Activate building spawn point and destination. Continue simulation for another 60 seconds. Average.
3. **Compute delta**: For each road segment, subtract baseline from building-active density.

This can run as a "background" analysis — the user clicks "Analyze Traffic Impact" and sees a progress indicator. The simulation keeps running visually while data is collected.

Alternatively, for a simpler approach without waiting: take a **snapshot** of current traffic state, then inject building trips and compare after 30 simulation-seconds.

## Step 5: Road Heatmap Visualization

**File: `components/RoadHeatmap.tsx`** + changes to ThreeMap

Color-code road segments based on congestion delta:

```typescript
const DELTA_COLORS = {
  improved:   0x22c55e,  // Green  (unlikely but possible with rerouting)
  noChange:   0x9ca3af,  // Gray
  slight:     0xfbbf24,  // Yellow (density increase < 25%)
  moderate:   0xf97316,  // Orange (density increase 25-50%)
  severe:     0xef4444,  // Red    (density increase > 50%)
};
```

Implementation in ThreeMap:
1. Road segments are rendered in `staticGeometry` by `roadRenderer.ts`. Each road mesh should store `userData.edgeId`.
2. To apply heatmap colors, iterate road meshes and set material color based on the delta for that edge.
3. Store original materials for restoration.
4. Roads without data keep their original color.

For roads that aren't individually addressable (if they're batched into a single geometry), create overlay line segments:
```typescript
const points = edge.geometry.map(([lng, lat]) =>
  projection.projectToWorld([lng, lat])
);
const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
const lineMat = new THREE.LineBasicMaterial({
  color: deltaColor, linewidth: 3, transparent: true, opacity: 0.8
});
const line = new THREE.Line(lineGeo, lineMat);
line.position.y = 2; // Slightly above road surface
```

## Step 6: Traffic Signal Visual Fix

**Current issue**: Traffic signals exist in code (`lib/trafficInfrastructure.ts`) but are disabled (`TRAFFIC_SIGNALS_ENABLED = false` in vehicleBehavior.ts line 57).

**Fix steps:**

1. **Enable signals**: Set `TRAFFIC_SIGNALS_ENABLED = true` in `lib/traffic/vehicleBehavior.ts` line 57.

2. **Fix signal rendering** (`lib/trafficInfrastructure.ts`): The signal mesh creation likely has color issues. The signal should show:
   - Red light: `emissive: 0xff0000` when state === 'red'
   - Yellow light: `emissive: 0xffaa00` when state === 'yellow'
   - Green light: `emissive: 0x00ff00` when state === 'green'

   Use `MeshStandardMaterial` with emissive properties so lights glow. The non-active lights should have `emissive: 0x000000` (dark).

3. **Update signal visuals each frame**: In the animation loop, after `trafficInfrastructure.update(currentTime)`:
   ```typescript
   for (const signal of infrastructure.getSignals()) {
     if (!signal.mesh) continue;
     const lights = signal.mesh.children;
     // lights[0] = red, lights[1] = yellow, lights[2] = green
     lights[0].material.emissive.setHex(signal.state === 'red' ? 0xff0000 : 0x330000);
     lights[1].material.emissive.setHex(signal.state === 'yellow' ? 0xffaa00 : 0x332200);
     lights[2].material.emissive.setHex(signal.state === 'green' ? 0x00ff00 : 0x003300);
   }
   ```

4. **Test with signals enabled**: Run the simulation and verify vehicles stop at red lights. The behavior code (lines 314-450 in vehicleBehavior.ts) already implements the logic — it just needs the feature flag flipped.

## Step 7: Traffic Impact Dashboard

**File: `components/TrafficImpactPanel.tsx`**

Display after analysis completes:

**Summary bar:**
- "Building generates ~142 daily vehicle trips (peak: 14/hour)"
- "3 road segments become congested"
- "Average speed reduction: 8 km/h on surrounding roads"

**Road segment table:**
| Road | Before | After | Speed Change | Status |
|---|---|---|---|---|
| Princess St | Free flow | Moderate | -12 km/h | WORSENED |
| Union St | Moderate | Congested | -18 km/h | WORSENED |
| Brock St | Free flow | Free flow | -2 km/h | OK |

**Congested intersections list:**
Highlight intersections where multiple congested segments converge. These are priority areas for traffic mitigation.

## Integration Points

| Existing Code | What Changes |
|---|---|
| `lib/spawning.ts` | Add `addBuildingSpawnPoint()`, `addBuildingDestination()` |
| `lib/roadNetwork.ts` | Expose nearest-node lookup |
| `lib/traffic/vehicleBehavior.ts` line 57 | Set `TRAFFIC_SIGNALS_ENABLED = true` |
| `lib/trafficInfrastructure.ts` | Fix signal mesh material colors |
| `components/ThreeMap.tsx` animation loop | Add density sampling, signal visual updates |
| `app/map/page.tsx` | Traffic impact state, analysis trigger |
| Road renderer | Store edgeId in userData for heatmap |

## Performance Considerations

- Density sampling: O(n) per frame where n = active cars (~400). Minimal cost.
- Heatmap rendering: One-time material updates. No per-frame cost.
- Trip injection: Adds 5-20 more cars to the ~400 vehicle pool. Simulation handles 400+ cars at 60fps already.
- Signal updates: O(s) per frame where s = number of signals. Negligible.
