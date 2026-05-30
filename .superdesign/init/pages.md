# Page Dependency Trees

## Home Page (`/`)
**File**: `app/page.tsx`

### Dependency Tree
```
app/page.tsx
├── app/layout.tsx (root layout)
│   ├── app/globals.css
│   └── next/font/google (IBM_Plex_Mono, Space_Grotesk)
├── components/ThreeMap.tsx
│   ├── lib/sceneManager.ts
│   ├── lib/buildingData.ts
│   ├── lib/buildingRenderer.ts
│   ├── lib/roadRenderer.ts
│   ├── lib/environmentRenderer.ts
│   ├── lib/projection.ts
│   ├── lib/cameraController.ts
│   ├── lib/roadNetwork.ts
│   ├── lib/pathfinding.ts
│   └── lib/spawning.ts
└── tailwind.config.ts
```

### Key Files

#### Page Component
- `app/page.tsx` - Main page with embedded UI overlay (header, sidebar, bottom bar)

#### Layout & Styles
- `app/layout.tsx` - Root layout with font configuration
- `app/globals.css` - Global styles and custom scrollbar
- `tailwind.config.ts` - Tailwind configuration

#### 3D Map Component
- `components/ThreeMap.tsx` - Three.js 3D visualization component

#### Supporting Libraries (logic only, not visual)
- `lib/sceneManager.ts` - Three.js scene setup
- `lib/buildingData.ts` - Fetch building data from OSM
- `lib/buildingRenderer.ts` - Render buildings to scene
- `lib/roadRenderer.ts` - Render roads to scene
- `lib/environmentRenderer.ts` - Ground plane creation
- `lib/projection.ts` - Coordinate projection utilities
- `lib/cameraController.ts` - Camera controls and animations
- `lib/roadNetwork.ts` - Road network graph
- `lib/pathfinding.ts` - A* pathfinding
- `lib/spawning.ts` - Car spawning logic

## Editor Page (`/editor`)
**File**: `app/editor/page.tsx`

### Dependency Tree
```
app/editor/page.tsx
├── app/layout.tsx
│   ├── app/globals.css
│   └── next/font/google
├── components/editor/BuildingEditorApp.tsx
│   ├── components/editor/InputPanel/InputPanel.tsx
│   ├── components/editor/Viewport/Scene.tsx
│   └── components/editor/Export/ExportBar.tsx
└── (various editor sub-components)
```

**Note**: Only documenting home page as primary focus - editor is a separate feature.
