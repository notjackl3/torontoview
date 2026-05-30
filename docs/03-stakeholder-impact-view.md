# Stakeholder Impact View — Implementation Plan

## Overview

When a building is placed, identify all residential/commercial buildings within a configurable radius, calculate per-building impacts (shadow, distance, noise, view obstruction), and color-code surrounding buildings by severity.

## Architecture

```
lib/
  impact/
    spatialQuery.ts          -- Find neighbors within radius
    viewObstruction.ts       -- Raycasting from windows toward new building
    noiseModel.ts            -- Construction/operational noise estimation
    impactAggregator.ts      -- Combine all impact factors into scores
components/
  ImpactDashboard.tsx        -- Summary stats + per-building breakdown
  ImpactRadiusControl.tsx    -- Radius selector (100m, 250m, 500m)
```

## Step 1: Spatial Query — Find Affected Buildings

**File: `lib/impact/spatialQuery.ts`**

The 4,776 OSM buildings are rendered as meshes in the `staticGeometry` group (see `lib/buildingRenderer.ts`). Each mesh has `userData.isOsmBuilding`, `userData.buildingId`, `userData.type`, and `userData.height`.

```typescript
interface NearbyBuilding {
  mesh: THREE.Mesh;
  id: string;
  type: string;         // 'residential', 'commercial', 'parking', etc.
  height: number;       // meters
  distance: number;     // meters from placed building center
  worldPosition: THREE.Vector3;
}

function findBuildingsInRadius(
  staticGeometry: THREE.Group,
  placedBuildingPosition: THREE.Vector3,
  radiusMeters: number,
  scaleFactor: number     // 10/1.4 = 7.14
): NearbyBuilding[]
```

Implementation:
1. Convert radius from meters to world units: `radiusWorld = radiusMeters * scaleFactor`.
2. Traverse `staticGeometry.children` — filter for `userData.isOsmBuilding === true`.
3. For each mesh, compute distance from mesh bounding box center to placed building position.
4. Return sorted by distance, with real-meter distance (divide by scaleFactor).

Performance: Iterating 4,776 meshes and computing distances is under 5ms. No spatial index needed at this scale.

## Step 2: View Obstruction Analysis

**File: `lib/impact/viewObstruction.ts`**

Determine how much each neighboring building's view is blocked by the new building.

```typescript
interface ViewObstructionResult {
  buildingId: string;
  obstructionPercentage: number;  // 0-100
  affectedFloors: number;         // How many floors have obstructed views
  totalFloors: number;
}
```

Algorithm:
1. For each neighboring building, estimate its floor count: `floors = height / 3.5`.
2. For each floor (at height `floorIndex * 3.5 * scaleFactor`), pick 4 sample points on the face closest to the new building.
3. For each sample point, cast a ray from the sample point toward the new building's center. Use `THREE.Raycaster`.
4. If the ray hits a placed building mesh before reaching the target center, that point's view is obstructed.
5. Calculate obstruction percentage per floor and aggregate.

Optimization: Only check buildings within 200m and only floors that are below the placed building's height (taller buildings won't have their upper floors obstructed).

Raycasting target: Use the `dynamicObjects` group's placed building meshes (loaded GLTFs). These are already tracked by the map page.

## Step 3: Noise Impact Model

**File: `lib/impact/noiseModel.ts`**

Estimate construction and operational noise at each neighboring building.

```typescript
interface NoiseImpact {
  buildingId: string;
  constructionNoiseDBA: number;   // dB(A) at building facade
  operationalNoiseDBA: number;    // dB(A) during operation
  noiseLevel: 'low' | 'moderate' | 'high' | 'severe';
}
```

Construction noise model (simplified):
- Source level at 15m: 85 dB(A) (typical construction site)
- Attenuation: `noise = 85 - 20 * log10(distance / 15)` (inverse square law for point source)
- Duration factor: based on building size (larger building = longer construction)

Operational noise model:
- Depends on building type from zoning:
  - Residential: 45 dB(A) at source
  - Commercial: 55 dB(A) at source
  - Mixed-use: 50 dB(A) at source
  - Industrial: 65 dB(A) at source
- Same distance attenuation formula.

Classification thresholds (WHO guidelines):
- `< 55 dB(A)`: low
- `55-65 dB(A)`: moderate
- `65-75 dB(A)`: high
- `> 75 dB(A)`: severe

## Step 4: Impact Aggregation

**File: `lib/impact/impactAggregator.ts`**

Combine shadow analysis (from `docs/01-shadow-sunlight-analysis.md`), view obstruction, noise, and distance into a single impact score per building.

```typescript
interface BuildingImpact {
  buildingId: string;
  type: string;
  distance: number;
  shadowHoursLost: number;        // From shadow analysis (0 if not run)
  viewObstruction: number;        // 0-100%
  constructionNoise: number;      // dB(A)
  operationalNoise: number;       // dB(A)
  overallScore: number;           // 0-100 (100 = no impact, 0 = severe)
  impactLevel: 'none' | 'low' | 'medium' | 'high';
}

interface ImpactSummary {
  totalBuildingsAffected: number;
  residentialUnitsAffected: number;
  commercialPropertiesAffected: number;
  buildingsWithSignificantShadowLoss: number;
  buildingsWithViewObstruction: number;
  buildingsWithHighNoise: number;
  impacts: BuildingImpact[];
}
```

Overall score formula (weighted average):
```
score = 100 - (
  shadowWeight * shadowPenalty +
  viewWeight * viewPenalty +
  noiseWeight * noisePenalty +
  distanceWeight * distancePenalty
)
```

Suggested weights:
- Shadow: 0.30 (most significant for residents)
- View obstruction: 0.25
- Noise: 0.25
- Distance proximity: 0.20

## Step 5: Visual Color Coding

**In ThreeMap.tsx — after impact analysis completes:**

Apply color materials to impacted OSM building meshes:

```typescript
const IMPACT_COLORS = {
  none: null,           // Keep original material
  low: 0x4ade80,        // Green
  medium: 0xfbbf24,     // Yellow/amber
  high: 0xef4444,       // Red
};
```

Implementation:
1. Store original materials in a `Map<string, THREE.Material>` before overriding.
2. For each impacted building, create a new `MeshLambertMaterial` with the impact color and `opacity: 0.85`.
3. Set mesh material to the impact material.
4. When overlay is cleared, restore originals.

Also draw the impact radius as a dashed circle on the ground:
```typescript
const geometry = new THREE.RingGeometry(
  radiusWorld - 1, radiusWorld + 1, 64
);
const material = new THREE.MeshBasicMaterial({
  color: 0x6366f1, opacity: 0.3, transparent: true, side: THREE.DoubleSide
});
// Position at y=0.5 to float slightly above ground
```

## Step 6: Impact Dashboard UI

**File: `components/ImpactDashboard.tsx`**

A slide-out panel (right side, below the existing building info) showing:

**Header section:**
- Impact radius selector: `[100m] [250m] [500m]` toggle buttons
- "Analyze Impact" button (triggers computation)

**Summary cards (row of 3):**
- "X residential units affected" (count buildings with type containing 'residential' or 'yes' within radius)
- "Y commercial properties" (count 'commercial', 'retail')
- "Z lose significant sunlight" (count shadowHoursLost > 2)

**Per-building table (scrollable):**
| Building | Type | Distance | Shadow Loss | View Block | Noise | Impact |
|---|---|---|---|---|---|---|
| #4927324 | Residential | 45m | 3.2 hrs | 40% | 68 dB | HIGH |

Color the Impact column cell background with the impact color.

**Interaction**: Clicking a row in the table highlights that building on the map (pulse animation or outline effect — the outline EffectComposer already exists in ThreeMap).

## Step 7: Integration with Shadow Analysis

The shadow analysis from Priority 1 should feed into this system. When both features are implemented:

1. `impactAggregator.ts` checks if shadow analysis results exist for each building.
2. If shadow analysis hasn't been run, the shadow column shows "N/A" and shadowWeight is redistributed to other factors.
3. If shadow analysis has been run, use the `hoursOfSunlightLost` value directly.

This means the two features can be developed independently and composed later.

## Step 8: Residential Unit Estimation

OSM data doesn't include unit counts. Estimate from building footprint and height:

```typescript
function estimateResidentialUnits(building: NearbyBuilding): number {
  if (building.type !== 'residential' && building.type !== 'yes') return 0;
  const footprintArea = estimateFootprintArea(building.mesh); // From bounding box
  const floors = Math.max(1, Math.round(building.height / 3.5));
  const grossFloorArea = footprintArea * floors;
  const avgUnitSize = 75; // sq meters, typical for Toronto
  const efficiencyFactor = 0.7; // common area, hallways, etc.
  return Math.max(1, Math.round(grossFloorArea * efficiencyFactor / avgUnitSize));
}
```

This gives rough but defensible numbers for "X residential units affected."

## Integration Points

| Existing Code | What Changes |
|---|---|
| `lib/buildingRenderer.ts` | Ensure userData includes type, height on every mesh |
| `lib/sceneManager.ts` | Access staticGeometry group for spatial queries |
| `components/ThreeMap.tsx` | Expose staticGeometry ref, handle impact overlay materials |
| `app/map/page.tsx` | Impact analysis state, pass results to dashboard |
| Shadow analysis (Priority 1) | Feed shadow hours into aggregator when available |
| `EnvironmentalReportModal.tsx` | Replace Gemini guesswork with calculated impact data |

## Performance

- Spatial query: <5ms (4,776 meshes, simple distance check)
- View obstruction: ~50ms (100 buildings × 5 floors × 4 rays = 2,000 raycasts)
- Noise model: <1ms (pure math)
- Shadow analysis: ~100ms (delegated to shadow module)
- Total: Under 200ms for full analysis — can run on building placement.
