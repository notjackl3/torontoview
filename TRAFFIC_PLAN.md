# Enhanced Traffic Impact Analysis

## Context
The current traffic impact analysis uses synthetic baseline data (ITE trip generation rates + estimated road volumes) and displays a basic heatmap. The user wants: (1) real traffic data from Mapbox, (2) a distance-based gradient visualization radiating from placed buildings (red near → green far), and (3) an interactive barricade system to block roads and see traffic redistribution.

## Implementation Order

### Phase 1: Distance-Based Gradient Visualization

**Goal:** Roads near the building glow red, transitioning through orange to green as distance increases.

#### 1.1 Add distance metadata to EdgeImpact
**File:** `lib/trafficImpact.ts`
- Add `distanceFromSource: number` field to `EdgeImpact` interface (line 116)
- Add `maxImpactRadius: number` to `TrafficImpactResult` interface
- In `distributeTrips()` (line 222), record the distance from building to each edge (already computed via `turf.pointToLineDistance`)
- In `analyzeTrafficImpact()` (line 262), store `distanceFromSource` (min distance across all buildings) in each `EdgeImpact` entry

#### 1.2 Per-vertex gradient rendering
**File:** `lib/roadRenderer.ts`
- Modify `renderTrafficHeatmap()` (line 269) to accept `buildingPositions: [number, number][]` parameter
- Modify `createHeatmapStrip()` (line 369) to use vertex colors instead of uniform color:
  - For each vertex, compute its world position → unproject to lng/lat → distance to nearest building
  - Map distance to color: 0-100m = red, 100-200m = orange, 200-300m = green
  - Use `THREE.BufferGeometry` with `color` attribute + `MeshBasicMaterial({ vertexColors: true })`
- Also render ALL edges within the radius (not just those with delta > 0) so the gradient is visually continuous

#### 1.3 Wire up in ThreeMap
**File:** `components/ThreeMap.tsx`
- Pass building positions from `trafficImpactResult.buildings` to `renderTrafficHeatmap()` (line 663)

---

### Phase 2: Barricade/Road Block System

**Goal:** Click roads to place barricades; traffic reroutes and shows increased congestion on alternate roads.

#### 2.1 State management
**File:** `app/map/page.tsx`
- Add state: `barricadedEdgeIds: Set<string>`, `isBarricadeMode: boolean`
- Pass as props to ThreeMap and TrafficImpactPanel
- Include `barricadedEdgeIds` in the traffic analysis useEffect dependency array

#### 2.2 Road click detection (barricade placement)
**File:** `components/ThreeMap.tsx`
- New prop: `isBarricadeMode`, `barricadedEdgeIds`, `onBarricadeToggle(edgeId)`
- When `isBarricadeMode` is true, on click:
  - Raycast against `groups.staticGeometry` children where `userData.isRoad === true`
  - Extract edge ID from `mesh.name` (format `road-{edgeId}`)
  - Call `onBarricadeToggle(edgeId)` to toggle in parent state
  - Block both forward and reverse edges (strip `-reverse` suffix to get base ID, block both)
- On mousemove in barricade mode: highlight hovered road with emissive color, set cursor to crosshair

#### 2.3 Barricade mesh rendering
**File:** `lib/roadRenderer.ts`
- New function `renderBarricadeMarkers(barricadedEdgeIds, allEdges, projection) → THREE.Group`
- For each barricaded edge: place a red/white striped box at the midpoint of the road
- Dimensions: width = road width, height = 5 world units, depth = 3 world units
- Red/white stripe texture via canvas

#### 2.4 Traffic redistribution logic
**File:** `lib/trafficImpact.ts`
- Add `barricadedEdgeIds?: Set<string>` parameter to `analyzeTrafficImpact()`
- In `distributeTrips()`: exclude barricaded edges from receiving direct trips
- New function `redistributeBlockedTraffic()`:
  - Use existing `Pathfinder` (from `lib/pathfinding.ts`) with `blockedEdgeIds` to find alternate routes
  - For trips that would have gone to blocked edges, find shortest paths around them
  - Add redistributed trips to the alternate edges
  - This makes adjacent roads show higher congestion (redder)

#### 2.5 UI controls
**File:** `components/TrafficImpactPanel.tsx`
- Add "Place Barricade" toggle button (Construction icon from lucide-react)
- Show list of barricaded roads with remove buttons
- Show barricade count in summary stats

---

### Phase 3: Real Mapbox Traffic Data

**Goal:** Replace synthetic baseline volumes with real-time Mapbox congestion data.

#### 3.1 API route for Mapbox traffic
**New file:** `app/api/map/traffic/route.ts`
- POST endpoint accepting `{ edges: Array<{ id: string, geometry: [number,number][] }> }`
- Batches edge geometries into groups of ~100 coordinates
- Calls Mapbox Map Matching API: `https://api.mapbox.com/matching/v5/mapbox/driving/{coords}?annotations=congestion,speed&access_token=TOKEN`
- Returns `{ congestion: Record<edgeId, { level: "low"|"moderate"|"heavy"|"severe", speed?: number }> }`
- Falls back to Mapbox Directions API if Map Matching fails
- Cache results in-memory for 5 minutes

#### 3.2 Client-side fetch function
**File:** `lib/trafficImpact.ts`
- New async function `fetchMapboxCongestion(roadNetwork) → Map<string, MapboxCongestion>`
- Maps Mapbox congestion levels to volume multipliers: low=0.3, moderate=0.55, heavy=0.8, severe=0.95
- Export `MapboxCongestion` type

#### 3.3 Integrate real data into analysis
**File:** `lib/trafficImpact.ts`
- Add optional `mapboxCongestion?: Map<string, MapboxCongestion>` to `analyzeTrafficImpact()`
- When present, use real congestion to set baseline `before` volume instead of `baselineVolumePerLane()`

#### 3.4 Wire up async fetch
**File:** `app/map/page.tsx`
- In the traffic analysis useEffect, fetch Mapbox data first (with loading indicator), then pass to `analyzeTrafficImpact()`
- Cache Mapbox data in a ref; only refresh on explicit user action or 5-minute timer
- Add "Refresh Traffic Data" button

#### 3.5 UI indicator
**File:** `components/TrafficImpactPanel.tsx`
- Show "Live Traffic Data" or "Estimated Data" badge in header
- Show timestamp of last Mapbox data fetch

---

## Key Files Summary
| File | Changes |
|------|---------|
| `lib/trafficImpact.ts` | Distance metadata, barricade redistribution, Mapbox fetch |
| `lib/roadRenderer.ts` | Vertex gradient colors, barricade markers |
| `components/ThreeMap.tsx` | Road raycasting for barricades, hover effects, pass building positions |
| `app/map/page.tsx` | Barricade state, async Mapbox fetch, new props |
| `components/TrafficImpactPanel.tsx` | Barricade controls, data source indicator |
| `app/api/map/traffic/route.ts` | **NEW** - Mapbox traffic proxy |

## Reusable Existing Code
- `Pathfinder.findRoute()` with `blockedEdgeIds` support (`lib/pathfinding.ts:32`)
- `RoadNetwork.findEdgesNearPosition()` (`lib/roadNetwork.ts:434`)
- `turf.pointToLineDistance()` already used in `distributeTrips()`
- Road mesh naming convention `road-{edgeId}` with `userData.isRoad` (`roadRenderer.ts:73`)
- `getCongestionHex()` color helper (`roadRenderer.ts:355`)

## Verification
1. **Gradient:** Place a building, toggle traffic impact → roads near building are red, roads 300m away are green
2. **Barricades:** Enable barricade mode, click a road → barrier appears, adjacent roads turn redder
3. **Real data:** Open traffic panel → shows "Live Traffic Data" badge, congestion levels match Mapbox expectations for Toronto
4. **Performance:** FPS stays above 30 with all features active
