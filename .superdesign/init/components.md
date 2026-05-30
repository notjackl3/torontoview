# UI Components

## Framework Detection
- **Framework**: React 19.2.3
- **Meta-framework**: Next.js 16.1.6 (App Router)
- **Styling**: Tailwind CSS v4 with custom theme extensions
- **Component Library**: Custom components (no third-party UI library)
- **Additional Libraries**:
  - Three.js (@react-three/fiber, @react-three/drei) for 3D visualization
  - Framer Motion for animations
  - lucide-react for icons

## Component Inventory

### 1. ThreeMap Component
**File**: `components/ThreeMap.tsx`
**Description**: Main 3D map visualization component using Three.js
**Props**:
- `initialCenter?: [number, number]` - Initial map center coordinates
- `className?: string` - Additional CSS classes

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import * as turf from "@turf/turf";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Scene management
import { createSceneManager, handleResize } from "@/lib/sceneManager";

// Rendering systems
import { fetchBuildings } from "@/lib/buildingData";
import { renderBuildings } from "@/lib/buildingRenderer";
import { renderRoads } from "@/lib/roadRenderer";
import { createGround } from "@/lib/environmentRenderer";

// Projection and camera
import { CityProjection } from "@/lib/projection";
import { setupControls, flyToQueens, updateTweens } from "@/lib/cameraController";

// Traffic simulation
import { RoadNetwork } from "@/lib/roadNetwork";
import { Pathfinder } from "@/lib/pathfinding";
import { Spawner, SpawnedCar } from "@/lib/spawning";

interface ThreeMapProps {
  initialCenter?: [number, number];
  className?: string;
}

// [Full component code as shown in the file - approximately 900 lines]
```

### 2. Additional Map Components
Located in `components/` directory but not heavily used in current root page:
- Map.tsx
- MapWithMarkers.tsx
- Editor components (BuildingEditorApp.tsx and related sub-components)

**Note**: The main UI is currently custom-built inline in app/page.tsx without extracting reusable UI primitives like Button, Card, etc.
