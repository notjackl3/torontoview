# Street-Level POV — Implementation Plan

## Overview

Add a camera mode that drops to pedestrian height (1.7m) at a clicked location, letting users look around from a fixed point to see what a proposed building looks like from the street.

## Architecture

```
lib/
  cameraController.ts    -- Extend with streetViewMode (already has flyToLocation)
components/
  StreetViewButton.tsx   -- "View from Street" trigger button
```

## Step 1: Street View Camera Mode

**File: `lib/cameraController.ts`** (extend existing)

The existing `CameraController` class (lines 13-43) sets up OrbitControls with:
- minDistance: 2, maxDistance: 100000
- maxPolarAngle: PI * 0.495 (prevents going below ground)
- dampingFactor: 0.05

Add a `setStreetViewMode(target: THREE.Vector3)` method:

```typescript
function setStreetViewMode(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  target: THREE.Vector3,  // World position of the clicked ground point
  savedState: { position: THREE.Vector3; target: THREE.Vector3 }  // To restore later
) {
  // Save current camera state for restoration
  savedState.position.copy(camera.position);
  savedState.target.copy(controls.target);

  // Eye height: 1.7m * SCALE_FACTOR (10/1.4 = 7.14)
  const eyeHeight = 1.7 * (10 / 1.4);

  // Set camera at eye level at the target point
  const streetPos = new THREE.Vector3(target.x, eyeHeight, target.z);

  // Constrain controls for street-level viewing
  controls.minDistance = 0.1;
  controls.maxDistance = 5;     // Keep camera near the pivot point
  controls.minPolarAngle = Math.PI * 0.2;   // Don't look straight up
  controls.maxPolarAngle = Math.PI * 0.85;  // Don't go underground
  controls.enablePan = false;               // No panning in street view
  controls.enableZoom = false;              // No zoom in street view
  controls.rotateSpeed = 0.4;              // Slower rotation for precision

  // Animate camera to street position
  // Reuse existing flyToLocation pattern with TWEEN
}
```

Add a `exitStreetViewMode()` method that restores the saved camera state and resets controls to defaults:
```typescript
function exitStreetViewMode(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  savedState: { position: THREE.Vector3; target: THREE.Vector3 }
) {
  controls.minDistance = 2;
  controls.maxDistance = 100000;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minPolarAngle = 0;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.rotateSpeed = 0.8;

  // Animate back to saved position
}
```

## Step 2: Camera Transition Animation

Use the existing TWEEN.js pattern from `flyToLocation()` (lines 141-203 in cameraController.ts):

```typescript
// Tween camera position from current to street level
new TWEEN.Tween(camera.position)
  .to({ x: streetPos.x, y: streetPos.y, z: streetPos.z }, 1500)
  .easing(TWEEN.Easing.Cubic.InOut)
  .start();

// Tween controls target to look along the nearest road direction
new TWEEN.Tween(controls.target)
  .to({ x: lookTarget.x, y: eyeHeight, z: lookTarget.z }, 1500)
  .easing(TWEEN.Easing.Cubic.InOut)
  .start();
```

The `lookTarget` should be slightly offset from the camera position in the direction of the nearest road. If no road direction is available, default to looking north (negative Z in the scene coordinate system).

## Step 3: Trigger Mechanism

**Option A: Button on selected building** (primary)

When a building is selected on the map, show a "View from Street" button in the building info panel. When clicked:
1. Calculate a point on the ground at the building's front face (use the building's position + offset based on its dimensions).
2. Call `setStreetViewMode()` with that ground point.

**Option B: Click-to-place** (secondary)

Add a mode where the user clicks anywhere on the ground plane to drop into street view at that location. This requires:
1. A toolbar button to enter "street view placement mode".
2. Raycasting on click against the ground plane (y=0) to get the world position.
3. Visual cursor (a person icon or marker) that follows the mouse.

Implement Option A first as it's simpler and more useful.

**File: `components/StreetViewButton.tsx`**

```typescript
interface StreetViewButtonProps {
  onClick: () => void;
  isActive: boolean;
  onExit: () => void;
}
```

Render as a floating button near the building info panel. When `isActive`, show an "Exit Street View" button instead (fixed position, prominent).

## Step 4: Integration with ThreeMap

**File: `components/ThreeMap.tsx`**

Add state tracking:
```typescript
const isStreetViewRef = useRef(false);
const savedCameraStateRef = useRef({
  position: new THREE.Vector3(),
  target: new THREE.Vector3()
});
```

Add props to ThreeMap:
```typescript
interface ThreeMapProps {
  // ... existing props
  streetViewTarget?: { x: number; y: number; z: number } | null;
  onStreetViewExit?: () => void;
}
```

When `streetViewTarget` changes from null to a value, enter street view mode. When the user presses Escape or clicks the exit button, call `onStreetViewExit`.

In the animation loop, TWEEN.update() is already called (line 1212), so the camera transition will animate automatically.

## Step 5: Ground-Level Polish

When in street view mode, a few adjustments improve the experience:

1. **FOV change**: Widen the camera FOV from 60 to 75 for a more immersive feel. Animate with TWEEN.
2. **Near plane**: Reduce camera near plane from 1 to 0.1 so close objects don't clip.
3. **Disable building click selection**: In street view, clicking shouldn't select buildings — it should only control the camera.
4. **Show compass**: A small compass indicator (N/S/E/W) helps with orientation. Can be a simple SVG overlay rotated by the camera's azimuth angle.

## Step 6: Optional — Walk Mode (WASD)

If time permits, add keyboard-controlled movement:

```typescript
// In animation loop, when street view is active:
const moveSpeed = 20; // world units per second
const forward = new THREE.Vector3();
camera.getWorldDirection(forward);
forward.y = 0;
forward.normalize();
const right = new THREE.Vector3().crossVectors(forward, UP);

if (keys.w) camera.position.addScaledVector(forward, moveSpeed * dt);
if (keys.s) camera.position.addScaledVector(forward, -moveSpeed * dt);
if (keys.a) camera.position.addScaledVector(right, -moveSpeed * dt);
if (keys.d) camera.position.addScaledVector(right, moveSpeed * dt);

// Keep controls target in sync
controls.target.copy(camera.position).addScaledVector(forward, 1);
```

Clamp camera.position.y to eye height so the user can't fly.

This is a nice-to-have. The fixed-point orbit is the priority.

## Integration Points

| Existing Code | What Changes |
|---|---|
| `lib/cameraController.ts` lines 13-43 | Add setStreetViewMode / exitStreetViewMode |
| `lib/cameraController.ts` lines 141-203 | Reuse TWEEN pattern for transition |
| `components/ThreeMap.tsx` | New props, Escape key handler, WASD keys |
| `app/map/page.tsx` | State for street view target, pass to ThreeMap |

## Risks

- **Clipping**: At eye level, buildings very close to the camera may clip. Reducing near plane to 0.1 mitigates this.
- **Ground plane**: The current ground may not extend close enough to camera. Verify `createGround()` in sceneManager.ts creates a sufficiently large plane.
- **Performance at street level**: More geometry is visible at eye level. The existing LOD system for vehicles helps, but OSM buildings have no LOD. This should be fine for Toronto's building density.
