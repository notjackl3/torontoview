# Shadow / Sunlight Analysis — Implementation Plan

## Overview

Add a time-of-day sun simulation that casts accurate shadows for Toronto's latitude (44.23N), with a before/after comparison showing which surrounding buildings lose sunlight when a proposed building is placed.

## Architecture

```
lib/
  sun/
    solarPosition.ts      -- Sun azimuth/altitude from lat + time + date
    shadowAnalysis.ts      -- Raycasting to quantify shadow impact on neighbors
components/
  SunControls.tsx          -- Time slider + date picker + before/after toggle
  ShadowOverlay.tsx        -- Color-coded impact overlay on affected buildings
```

## Step 1: Solar Position Calculator

**File: `lib/sun/solarPosition.ts`**

Compute the sun's azimuth and altitude angle from:
- Latitude: 44.2253 (hardcoded Toronto)
- Day of year (1-365)
- Hour of day (decimal, e.g. 14.5 = 2:30pm)

Use the standard solar position equations:

```
declination = 23.45 * sin(360/365 * (dayOfYear - 81))
hourAngle = 15 * (solarHour - 12)
altitude = asin(sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(hourAngle))
azimuth = atan2(-sin(hourAngle), tan(dec)*cos(lat) - sin(lat)*cos(hourAngle))
```

Export a function:
```typescript
interface SunPosition {
  altitude: number;   // radians, 0 = horizon, PI/2 = zenith
  azimuth: number;    // radians, 0 = north, clockwise
  isAboveHorizon: boolean;
}

function getSunPosition(date: Date, hour: number): SunPosition
```

Convert to a Three.js DirectionalLight position:
```typescript
function sunToLightPosition(sun: SunPosition, distance: number): THREE.Vector3
```

The distance should be large (e.g. 2000) so the directional light covers the full scene. Position = `(distance * cos(altitude) * sin(azimuth), distance * sin(altitude), distance * cos(altitude) * cos(azimuth))`.

## Step 2: Update Existing DirectionalLight

**File: `lib/sceneManager.ts`** (lines 57-71)

The scene already has a DirectionalLight at (500, 800, 300) with shadow mapping enabled (2048x2048, PCFSoftShadowMap). Modifications:

1. Export the directional light reference from `createSceneGroups()` so ThreeMap can update its position each frame.
2. Increase shadow map resolution to 4096x4096 when shadow analysis is active (toggled back to 2048 when off to save GPU).
3. Expand shadow camera frustum: left/right/top/bottom from 1500 to 3000 to cover a wider area when zoomed out.
4. Add a shadow camera helper (togglable for debug) to visualize the shadow frustum.

**Key concern**: The shadow camera frustum must follow the sun direction. When the sun is low (morning/evening), the frustum needs to be longer in the light direction. Dynamically adjust the near/far based on altitude:
```typescript
const frustumSize = altitude < 0.3 ? 4000 : 2000;
shadowCamera.left = -frustumSize;
// ... etc
shadowCamera.updateProjectionMatrix();
```

## Step 3: Time & Date Controls UI

**File: `components/SunControls.tsx`**

Render a panel (collapsible, anchored bottom-left or as a toolbar element) with:

1. **Time slider**: Range input, 5:00 to 21:00 in 15-minute steps. Display as "2:30 PM". Default: current real time.
2. **Date picker**: Month/day selector. Show presets for solstices: "Jun 21 (longest day)", "Dec 21 (shortest day)", "Mar 21 (equinox)". Default: today's date.
3. **Play button**: Animate the time slider forward at ~1 hour/second to show shadow sweep across the day.
4. **Before/After toggle**: Two-state button — "Without Building" hides all placed buildings, "With Building" shows them. This uses the existing `dynamicObjects` group in sceneManager — toggle `visible` on placed building meshes.

State should be lifted to the map page (`app/map/page.tsx`) so ThreeMap receives `sunTime`, `sunDate`, and `showPlacedBuildings` as props.

## Step 4: Connect Sun to Light in Animation Loop

**File: `components/ThreeMap.tsx`** (animation loop, ~line 902)

When shadow analysis mode is active:
1. Compute `getSunPosition(date, hour)` for the current slider values.
2. Set the DirectionalLight position from `sunToLightPosition(sun, 2000)`.
3. Point the light at the scene center (OrbitControls target).
4. If sun is below horizon (`altitude < 0`), set light intensity to 0 and ambient to 0.3 (nighttime).
5. Modulate ambient light intensity based on altitude: `ambientIntensity = 0.4 + 0.8 * sin(altitude)`.

Performance: This is just updating one light position per frame — negligible cost.

## Step 5: Shadow Impact Analysis (Raycasting)

**File: `lib/sun/shadowAnalysis.ts`**

When the user clicks "Analyze Shadows" (or after placing a building):

1. **Identify neighbors**: Find all OSM buildings within 500m of each placed building. Buildings are in the `staticGeometry` group. Filter meshes by `userData.isOsmBuilding === true`. Use bounding box distance for the initial cull.

2. **Sample points on each neighbor**: For each neighboring building mesh, sample the roof surface at a grid of points (e.g. 3x3 per building, more for large buildings). Points = top face center + offsets.

3. **Raycast toward sun**: For each sample point, cast a ray from the point toward the sun direction. Use `THREE.Raycaster` with `ray.origin = samplePoint` and `ray.direction = sunDirection`. Check intersection with placed building meshes only (not the building itself).

4. **Time sweep**: Repeat the raycast at 1-hour intervals from 8am to 6pm. For each sample point, count how many hours it is shadowed by the new building vs. without it.

5. **Aggregate per building**: For each neighbor, compute average shadow hours gained. Classify:
   - `>3 hours lost` = high impact (red)
   - `1-3 hours lost` = medium impact (yellow)
   - `<1 hour lost` = low impact (green)

**Performance**: For 100 neighbors × 9 sample points × 10 hours = 9,000 raycasts. Three.js raycasting against a small set of placed buildings (typically 1-5 meshes) is fast — under 100ms total.

Return structure:
```typescript
interface ShadowImpactResult {
  buildingId: string;
  hoursOfSunlightLost: number;
  impactLevel: 'low' | 'medium' | 'high';
  sampledPoints: { position: THREE.Vector3; hoursLost: number }[];
}
```

## Step 6: Visual Overlay

**File: `components/ShadowOverlay.tsx`** + changes to ThreeMap

After analysis completes, apply impact colors to the OSM building meshes:

1. Store original materials in a Map before overriding.
2. Create impact materials: `new THREE.MeshLambertMaterial({ color: impactColor, transparent: true, opacity: 0.8 })`.
3. Set each impacted building mesh's material to the impact material.
4. When the overlay is toggled off, restore original materials.

Additionally, render a summary stat in the UI:
- "12 residential buildings lose >2 hours of direct sunlight"
- "3 buildings severely impacted (>4 hours lost)"

The summary stat counts come from filtering `ShadowImpactResult[]` by `hoursOfSunlightLost` thresholds.

## Step 7: Shadow Ground Plane (Optional Enhancement)

For a more dramatic visual, add a ground-level shadow visualization:

1. Create a large plane under the scene with `receiveShadow = true`.
2. The existing ground in `sceneManager.ts` (`createGround()`) should already receive shadows — verify `receiveShadow` is set.
3. With the sun positioned correctly, Three.js shadow mapping will automatically project building shadows onto the ground plane.

This gives the "moving shadows" effect for free when the user drags the time slider.

## Integration Points

| Existing Code | What Changes |
|---|---|
| `lib/sceneManager.ts` lines 57-71 | Export light ref, dynamic frustum sizing |
| `components/ThreeMap.tsx` line 902+ | Update light position in animation loop |
| `app/map/page.tsx` | Add sun control state, pass as props |
| `lib/buildingRenderer.ts` | Ensure `receiveShadow = true` on all OSM buildings (already set) |
| `dynamicObjects` group | Toggle visibility for before/after |

## Open Questions

1. **Shadow map resolution vs. performance**: 4096x4096 may be too heavy on integrated GPUs. Consider 2048 default with a "high quality" toggle.
2. **Multiple placed buildings**: The before/after toggle should hide ALL placed buildings, not just the selected one.
3. **Night rendering**: When sun is below horizon, should we show anything? A simple dark overlay may suffice. Full nighttime lighting is out of scope.
