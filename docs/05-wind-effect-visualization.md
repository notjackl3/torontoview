# Wind Effect Visualization — Implementation Plan

## Overview

Visualize simplified wind flow at street level, highlighting danger zones where wind accelerates between tall buildings (Venturi effect). Uses Toronto's prevailing W/SW wind direction.

## Architecture

```
lib/
  wind/
    windModel.ts          -- Simplified fluid model (not CFD)
    windField.ts          -- 2D grid of wind velocities
    venturiDetection.ts   -- Find acceleration zones between buildings
components/
  WindOverlay.tsx          -- Toggle control + legend
```

## Step 1: Wind Field Grid

**File: `lib/wind/windField.ts`**

Create a 2D grid covering the map area. Each cell stores a wind velocity vector.

```typescript
interface WindCell {
  vx: number;    // Wind velocity X component (m/s)
  vz: number;    // Wind velocity Z component (m/s)
  speed: number; // Magnitude (m/s)
  blocked: boolean; // Inside a building footprint
}

class WindField {
  private grid: WindCell[][];
  private cellSize: number;  // meters per cell (e.g., 5m)
  private width: number;     // grid columns
  private height: number;    // grid rows
  private origin: THREE.Vector2; // world position of grid corner

  constructor(
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    cellSize: number
  )

  // Initialize with uniform prevailing wind
  setBaseWind(direction: number, speed: number): void

  // Mark cells occupied by buildings
  addBuildingObstacle(mesh: THREE.Mesh): void

  // Run simplified flow simulation
  solve(iterations: number): void

  // Query wind at a world position
  getWindAt(x: number, z: number): { vx: number; vz: number; speed: number }
}
```

Grid sizing: For a 1km x 1km area at 5m resolution = 200x200 = 40,000 cells. Manageable.

## Step 2: Simplified Wind Model

**File: `lib/wind/windModel.ts`**

This is NOT computational fluid dynamics. It's a simplified potential flow model:

**Base wind:**
Toronto's prevailing wind is from the W/SW. Default: 15 km/h (4.2 m/s) from 250 degrees (WSW).

```typescript
const TORONTO_PREVAILING_WIND = {
  direction: 250,   // degrees, meteorological convention (where wind comes FROM)
  speed: 4.2,       // m/s (15 km/h average)
};
```

**Algorithm — iterative relaxation:**

1. **Initialize**: Set all cells to the base wind vector. Mark building cells as blocked (velocity = 0).

2. **Obstacle mask**: For each building mesh in the scene, project its footprint onto the grid and mark those cells as blocked. For each blocked cell, set velocity to 0.

3. **Relaxation iterations** (10-20 passes):
   For each non-blocked cell, update velocity based on neighbors:
   ```
   vx[i][j] = average(vx of non-blocked neighbors)
   vz[i][j] = average(vz of non-blocked neighbors)
   ```
   Then enforce mass conservation — wind entering a narrow gap must speed up:
   ```
   // Count available (non-blocked) neighbor cells
   // If fewer available neighbors (near buildings), scale up velocity
   speedScale = 4 / availableNeighbors  // 4 = max neighbors in 2D
   vx[i][j] *= speedScale
   vz[i][j] *= speedScale
   ```

4. **Boundary conditions**: At grid edges, reset to base wind (inflow on windward side, free outflow on leeward).

This naturally produces:
- **Acceleration between buildings** (Venturi effect) — fewer open cells means higher velocity
- **Wind shadows behind buildings** — blocked cells create low-velocity wake regions
- **Channeling along streets** — aligned gaps focus airflow

## Step 3: Venturi Zone Detection

**File: `lib/wind/venturiDetection.ts`**

After solving the wind field, identify zones where wind speed significantly exceeds the base wind:

```typescript
interface WindZone {
  cells: { x: number; z: number }[];
  avgSpeed: number;
  maxSpeed: number;
  classification: 'comfortable' | 'uncomfortable' | 'dangerous';
  worldBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

function classifyWindZones(field: WindField): WindZone[] {
  // Flood-fill connected cells that exceed thresholds
  // Lawson comfort criteria:
  //   < 5 m/s: comfortable (sitting)
  //   5-8 m/s: comfortable (walking)
  //   8-10 m/s: uncomfortable
  //   > 10 m/s: dangerous (papers blow, difficult to walk)
}
```

Lawson wind comfort criteria (used in real urban planning):
| Speed | Effect | Classification |
|---|---|---|
| < 4 m/s | Comfortable for sitting outdoors | comfortable |
| 4-6 m/s | Comfortable for walking | comfortable |
| 6-8 m/s | Hair disturbed, clothing flaps | uncomfortable |
| 8-10 m/s | Difficult to walk steadily | uncomfortable |
| > 10 m/s | Dangerous for elderly/children | dangerous |

## Step 4: Particle Visualization

Render wind as animated particles flowing through the scene:

**Option A: Instanced arrows (recommended)**

```typescript
// In ThreeMap.tsx, when wind overlay is active:

const ARROW_COUNT = 2000;
const arrowGeo = new THREE.ConeGeometry(1, 4, 4); // Simple arrow shape
const arrowMat = new THREE.MeshBasicMaterial({ transparent: true });
const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, ARROW_COUNT);

// Per-frame update:
for (let i = 0; i < ARROW_COUNT; i++) {
  const worldPos = arrowPositions[i];
  const wind = windField.getWindAt(worldPos.x, worldPos.z);

  // Move arrow along wind direction
  worldPos.x += wind.vx * scaleFactor * dt;
  worldPos.z += wind.vz * scaleFactor * dt;

  // Reset position if arrow leaves grid
  if (outOfBounds(worldPos)) resetArrowPosition(i);

  // Color by speed
  const speedRatio = wind.speed / 10; // 10 m/s = max
  const color = lerpColor(0x60a5fa, 0xef4444, speedRatio); // Blue → Red

  // Set instance matrix (position + rotation toward wind direction)
  const angle = Math.atan2(wind.vx, wind.vz);
  matrix.makeRotationY(angle);
  matrix.setPosition(worldPos.x, 3, worldPos.z); // 3 = slightly above ground
  arrows.setMatrixAt(i, matrix);
  arrows.setColorAt(i, new THREE.Color(color));
}
arrows.instanceMatrix.needsUpdate = true;
arrows.instanceColor.needsUpdate = true;
```

Height: Place arrows at y = 3 (roughly 0.4m real height — pedestrian level given SCALE_FACTOR of 7.14).

**Option B: Line streamlines (simpler)**

Draw streamlines as animated dashed lines:
```typescript
// Trace streamlines from evenly-spaced seed points
for (const seed of seedPoints) {
  const points = traceStreamline(seed, windField, maxLength);
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineDashedMaterial({
    color: speedColor, dashSize: 3, gapSize: 2
  });
  const line = new THREE.Line(geometry, material);
  line.computeLineDistances(); // Required for dashed lines
}
// Animate by shifting dashOffset each frame
material.dashOffset -= dt * wind.speed;
```

Option A (instanced arrows) is more visually compelling and performant. 2000 instanced meshes at 4 vertices each is trivial for the GPU.

## Step 5: Danger Zone Highlighting

For zones classified as "dangerous" (>10 m/s), add a ground overlay:

```typescript
// Red semi-transparent polygon on the ground
const shape = new THREE.Shape();
// Build shape from zone boundary cells
for (const cell of dangerZone.cells) {
  // Convert cell to world coordinates, create polygon
}
const geo = new THREE.ShapeGeometry(shape);
const mat = new THREE.MeshBasicMaterial({
  color: 0xef4444, transparent: true, opacity: 0.25,
  side: THREE.DoubleSide
});
const overlay = new THREE.Mesh(geo, mat);
overlay.position.y = 0.5;
overlay.rotation.x = -Math.PI / 2;
```

Add pulsing animation for visual emphasis:
```typescript
mat.opacity = 0.15 + 0.1 * Math.sin(time * 3);
```

## Step 6: UI Controls

**File: `components/WindOverlay.tsx`**

Minimal controls:
1. **Toggle button**: "Show Wind" on/off (adds to existing overlay toggles like zoning)
2. **Wind direction input**: Compass rose or dropdown. Default: WSW (250). Allow N/NE/E/SE/S/SW/W/NW.
3. **Wind speed slider**: 5-40 km/h. Default: 15 km/h.
4. **Legend**: Color scale from blue (calm) to red (dangerous) with Lawson criteria labels.

When toggled on:
1. Compute wind field (takes ~50ms for 200x200 grid × 15 iterations).
2. Classify zones.
3. Spawn particles.
4. Show danger zone overlays.

When toggled off: Remove all wind visuals from scene.

## Step 7: Integration with Placed Buildings

The wind analysis should update when buildings are placed or removed:

1. Listen for changes to `placedBuildings` prop in ThreeMap.
2. When buildings change and wind overlay is active:
   - Re-mark building obstacles in the grid (include both OSM buildings AND placed buildings).
   - Re-solve the wind field.
   - Update particle flow and danger zones.

This shows the user how their proposed building affects wind patterns — new Venturi corridors may form between the placed building and existing neighbors.

## Integration Points

| Existing Code | What Changes |
|---|---|
| `components/ThreeMap.tsx` | Add wind overlay group to scene, particle update in animation loop |
| `lib/sceneManager.ts` | Access staticGeometry for building obstacles |
| `app/map/page.tsx` | Wind overlay state (on/off, direction, speed) |
| Zoning toggle pattern | Follow same on/off toggle pattern for consistency |

## Performance

- Wind field solve: 200x200 grid × 15 iterations = ~600K cell updates. Pure arithmetic, no allocation. Estimated: 30-50ms one-time.
- Particle update: 2000 instances × matrix set per frame. InstancedMesh handles this at 60fps easily.
- Re-solve on building change: 30-50ms, not noticeable.

## Limitations

- This is NOT real CFD. It won't capture turbulence, vortex shedding, or vertical wind effects.
- The model only operates in 2D (ground level). It doesn't account for building height differences causing downwash.
- It's accurate enough for identifying obvious Venturi corridors between closely-spaced tall buildings, which is the primary use case for urban planning presentations.
- For a more credible demo, label it as "simplified wind comfort analysis" rather than "wind simulation."
