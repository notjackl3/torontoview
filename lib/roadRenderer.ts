import * as THREE from "three";
import { CityProjection } from "./projection";
import { RoadEdge } from "./roadNetwork";
import { getTheme, type MapStyle } from "./mapTheme";
import { trafficLevelForEdge, trafficLevelToColor } from "./trafficDensity";

/**
 * Road Renderer with realistic widths, mitered joins, and visual hierarchy
 */

const SCALE_FACTOR = 10 / 1.4;

/**
 * Road style based on speed limit (proxy for OSM highway classification)
 * - 60 km/h → primary/arterial
 * - 50 km/h → secondary
 * - 40 km/h → tertiary
 * - 30 km/h → residential
 */
/**
 * Road style by speed class. Asphalt greys in satellite mode, Apple-Maps
 * cool light-grays in light mode. Arterials are a touch darker (fresher
 * asphalt) and get a white centerline; residential streets are lighter.
 */
function getRoadStyle(
  speedLimit: number,
  lanes: number,
  mapStyle: MapStyle = "satellite",
): {
  width: number;
  color: number;
  centerLine: boolean;
  centerLineColor: number;
} {
  const palette = getTheme(mapStyle).road;
  let laneWidth: number;
  let shoulder: number;
  let color: number;
  let centerLine = false;
  const centerLineColor = palette.centerLine;

  // OSM lane counts are noisy (turn lanes, bus lanes, parking lanes inflate
  // residential streets to 4-6 lanes). Cap to a reasonable visual maximum so
  // a mis-tagged residential road doesn't render as a 30 m ribbon.
  const renderLanes = Math.min(Math.max(lanes, 1), 4);

  if (speedLimit >= 60) {
    laneWidth = 2.2;
    shoulder = 0.5;
    color = palette.arterial;
    centerLine = true;
  } else if (speedLimit >= 50) {
    laneWidth = 2.1;
    shoulder = 0.3;
    color = palette.secondary;
    centerLine = true;
  } else if (speedLimit >= 40) {
    laneWidth = 2.0;
    shoulder = 0.15;
    color = palette.tertiary;
  } else {
    laneWidth = 1.8;
    shoulder = 0.0;
    color = palette.residential;
  }

  const totalWidth = (renderLanes * laneWidth + shoulder * 2) * SCALE_FACTOR;
  return { width: totalWidth, color, centerLine, centerLineColor };
}

/**
 * Render all roads from edge data
 */
export function renderRoads(
  edges: RoadEdge[],
  projection: typeof CityProjection,
  scene: THREE.Object3D,
  mapStyle: MapStyle = "satellite",
): void {
  // Deduplicate forward/reverse edges that share geometry — the road network
  // creates a reverse twin for every two-way street, but they overlay perfectly
  // and just double the polygon count.
  const renderedWays = new Set<string>();
  let skippedShort = 0;
  let skippedDuplicate = 0;

  edges.forEach((edge) => {
    if (edge.geometry.length < 2) return;

    // Drop tiny stub edges — OSM service driveways and parking-lot connectors
    // that produce L-shaped fragments overlapping buildings.
    if (edge.length < 8) {
      skippedShort++;
      return;
    }

    // Reverse-twin edge id is "way-<id>-reverse"; collapse to the base way id.
    const wayKey = edge.id.replace(/-reverse$/, "");
    if (renderedWays.has(wayKey)) {
      skippedDuplicate++;
      return;
    }
    renderedWays.add(wayKey);

    const points = edge.geometry.map((coord) =>
      projection.projectToWorld(coord),
    );

    const { width, color, centerLine, centerLineColor } = getRoadStyle(
      edge.speedLimit,
      edge.lanes,
      mapStyle,
    );
    const roadMesh = createRoadMesh(points, width, color, mapStyle);
    // Lift the road surface clear of the ground plane. With the renderer's
    // logarithmic depth buffer this only needs to be a small visual offset
    // — 2 world units (~28 cm at the 7.14× world scale) is enough to keep
    // the asphalt reading above any ground texture without making roads
    // look like elevated ribbons at close zoom.
    roadMesh.position.y = 2.0;
    roadMesh.name = `road-${edge.id || "segment"}`;
    roadMesh.userData.isRoad = true;
    roadMesh.userData.roadWidth = width;
    roadMesh.userData.roadSpeedLimit = edge.speedLimit;
    scene.add(roadMesh);

    // Warm centerline strip for arterials/secondaries — sits a hair above
    // the road surface so it shows but doesn't cause z-fighting.
    if (centerLine) {
      const stripeWidth = Math.max(width * 0.04, 0.4 * SCALE_FACTOR);
      const stripe = createRoadMesh(points, stripeWidth, centerLineColor, mapStyle);
      stripe.position.y = 2.2;
      stripe.userData.isRoadCenterLine = true;
      scene.add(stripe);
    }
  });

  console.log(
    `✅ Roads rendered (${renderedWays.size} ways, skipped ${skippedDuplicate} reverse twins, ${skippedShort} short stubs)`,
  );
}

/**
 * Recolor already-rendered road and centerline meshes in place. Used when the
 * user toggles the base style — far cheaper than rebuilding the network.
 *
 * Roads carry `userData.isRoad` and `userData.roadSpeedLimit`; centerline
 * stripes carry `userData.isRoadCenterLine`. Anything else is left alone.
 */
export function updateRoadColors(
  scene: THREE.Object3D,
  mapStyle: MapStyle,
): void {
  const palette = getTheme(mapStyle).road;

  const colorForSpeed = (speed: number): number => {
    if (speed >= 60) return palette.arterial;
    if (speed >= 50) return palette.secondary;
    if (speed >= 40) return palette.tertiary;
    return palette.residential;
  };

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const ud = obj.userData;
    let nextColor: number | null = null;
    if (ud.isRoad) {
      nextColor = colorForSpeed(ud.roadSpeedLimit ?? 30);
    } else if (ud.isRoadCenterLine) {
      nextColor = palette.centerLine;
    }
    if (nextColor === null) return;

    const currentMat = obj.material as THREE.Material | undefined;
    const wantBasic = mapStyle === "light";
    const isBasic = currentMat instanceof THREE.MeshBasicMaterial;

    // Swap material type if the mode change requires it (unlit ↔ asphalt-lit).
    // Cheaper than rebuilding the mesh, but still rare since users toggle
    // styles infrequently.
    if (wantBasic !== isBasic) {
      currentMat?.dispose();
      obj.material = createRoadSurfaceMaterial(nextColor, mapStyle);
      obj.receiveShadow = !wantBasic;
      return;
    }

    if (
      currentMat instanceof THREE.MeshStandardMaterial ||
      currentMat instanceof THREE.MeshBasicMaterial
    ) {
      currentMat.color.setHex(nextColor);
      currentMat.needsUpdate = true;
    }
  });
}

/**
 * Geospatial Road Traffic heatmap. Renders one colored strip per road edge
 * laid directly on the road surface, with color driven by a synthetic 24-hour
 * traffic curve (see lib/trafficDensity.ts). One mesh per edge so we can
 * cheaply re-color in place as the user scrubs the time slider — no
 * geometry rebuilds.
 */
export function renderTrafficDensityLayer(
  edges: RoadEdge[],
  projection: typeof CityProjection,
  hour: number,
  mapStyle: MapStyle = "satellite",
): THREE.Group {
  const group = new THREE.Group();
  group.name = "trafficDensityLayer";

  const renderedWays = new Set<string>();
  for (const edge of edges) {
    if (edge.geometry.length < 2) continue;
    if (edge.length < 8) continue;
    const wayKey = edge.id.replace(/-reverse$/, "");
    if (renderedWays.has(wayKey)) continue;
    renderedWays.add(wayKey);

    const points = edge.geometry.map((c) => projection.projectToWorld(c));
    const { width } = getRoadStyle(edge.speedLimit, edge.lanes, mapStyle);
    // Overlay is slightly narrower than the road so the road's own edges
    // still show through and the strip reads as "paint on asphalt" rather
    // than replacing the road entirely.
    const overlayWidth = width * 0.78;

    const level = trafficLevelForEdge(edge, hour);
    const color = trafficLevelToColor(level);
    // Reuse the existing strip helper (mitered, per-edge mesh) for geometry,
    // then immediately swap in our own material — the shared helper bakes in
    // a 0.35–0.80 opacity range that makes off-peak hours barely visible. We
    // want the heatmap to read clearly the moment it's toggled on, so we
    // floor opacity at 0.75 and saturate to 1.0 at gridlock.
    const strip = createHeatmapStrip(points, overlayWidth, color, level);
    strip.material = trafficDensityMaterial(color, level);
    // Sit above the road surface (y=2.0) and centerline (y=2.2) but below
    // the impact-analysis heatmap (y=4.5) so the two can coexist.
    strip.position.y = 2.8;
    // Above parks (renderOrder 1) so where a road crosses a park the
    // congestion color wins, matching the geospatial-layers panel order.
    // Below zoning (renderOrder 9999, depthTest off) so zoning still beats
    // everything per the user's priority rule.
    strip.renderOrder = 50;
    strip.name = `traffic-density-${edge.id}`;
    strip.userData.isTrafficDensity = true;
    strip.userData.edgeId = edge.id;
    strip.userData.edgeSpeedLimit = edge.speedLimit;
    group.add(strip);
  }

  return group;
}

/**
 * Material for a single traffic-density strip. Unlit so the green/red color
 * is constant under any sun angle (matches the road-surface treatment in
 * light mode), and opacity stays high enough that off-peak roads are still
 * clearly green rather than ghostly.
 */
function trafficDensityMaterial(color: number, level: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.75 + level * 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
    // No polygonOffset: see createRoadSurfaceMaterial — the renderer's
    // logarithmic depth buffer makes negative polygonOffsets hide layers
    // behind the ground plane. Rely on the strip's positive Y offset.
  });
}

/**
 * Re-tint an existing traffic-density layer to a new hour without rebuilding
 * geometry. Used by the time-slider effect.
 */
export function updateTrafficDensityLayer(
  group: THREE.Group,
  edges: RoadEdge[],
  hour: number,
): void {
  const byId = new Map(edges.map((e) => [e.id, e]));
  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    if (!obj.userData.isTrafficDensity) return;
    const edge = byId.get(obj.userData.edgeId);
    if (!edge) return;
    const level = trafficLevelForEdge(edge, hour);
    const mat = obj.material;
    if (
      mat instanceof THREE.MeshBasicMaterial ||
      mat instanceof THREE.MeshStandardMaterial
    ) {
      mat.color.setHex(trafficLevelToColor(level));
      // Match the floor used in trafficDensityMaterial — keeps quiet roads
      // clearly visible after the user scrubs to 3 AM.
      mat.opacity = 0.75 + level * 0.25;
      mat.needsUpdate = true;
    }
  });
}

/**
 * Build the road surface material. In satellite mode the road is asphalt — a
 * lit MeshStandardMaterial so it reads as a real surface that shadows fall
 * onto. In light mode roads are a graphic element like parks: an unlit
 * MeshBasicMaterial keeps the grey constant regardless of sun angle, so
 * morning low-angle sunlight no longer blows the road out to white.
 */
function createRoadSurfaceMaterial(
  color: number,
  mapStyle: MapStyle,
): THREE.Material {
  // We rely on a small positive Y offset (set on the mesh) + the renderer's
  // logarithmic depth buffer to keep roads above the ground plane. We
  // deliberately do NOT use polygonOffset here: under log-depth the offset
  // is applied in linear screen-space and ends up pushing the polygon
  // *behind* the ground in log-z, which made roads invisible.
  if (mapStyle === "light") {
    return new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

/**
 * Create a road mesh from a series of points
 */
function createRoadMesh(
  points: THREE.Vector3[],
  width: number,
  color: number,
  mapStyle: MapStyle = "satellite",
): THREE.Mesh {
  if (points.length === 2) {
    return createStraightRoad(points[0], points[1], width, color, mapStyle);
  } else {
    return createCurvedRoad(points, width, color, mapStyle);
  }
}

/**
 * Create a straight road segment between two points
 */
function createStraightRoad(
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  color: number,
  mapStyle: MapStyle = "satellite",
): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const midpoint = new THREE.Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5);

  const geometry = new THREE.PlaneGeometry(width, length);
  const angle = Math.atan2(direction.x, -direction.z);
  geometry.rotateZ(angle);

  const material = createRoadSurfaceMaterial(color, mapStyle);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(midpoint);
  mesh.rotateX(-Math.PI / 2);
  // Unlit materials don't participate in shadow receiving; skip the cost.
  mesh.receiveShadow = mapStyle !== "light";

  return mesh;
}

/**
 * Create a curved road along a path of points with mitered joins
 */
function createCurvedRoad(
  points: THREE.Vector3[],
  width: number,
  color: number,
  mapStyle: MapStyle = "satellite",
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const half = width / 2;

  const vertices: number[] = [];
  const indices: number[] = [];

  // Compute perpendicular (right) vectors for each segment
  const segRights: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const forward = new THREE.Vector3()
      .subVectors(points[i + 1], points[i])
      .normalize();
    segRights.push(new THREE.Vector3(-forward.z, 0, forward.x));
  }

  // For each vertex, compute mitered perpendicular by averaging adjacent segments
  for (let i = 0; i < points.length; i++) {
    let right: THREE.Vector3;

    if (i === 0) {
      right = segRights[0].clone();
    } else if (i === points.length - 1) {
      right = segRights[segRights.length - 1].clone();
    } else {
      // Average the perpendiculars of the two adjacent segments
      right = new THREE.Vector3()
        .addVectors(segRights[i - 1], segRights[i])
        .normalize();

      // Scale to maintain consistent width through the miter
      // miterScale = 1 / cos(halfAngle) — clamped tightly to avoid bulging
      // ribbons at sharp corners (a 90° turn would otherwise widen 1.41×).
      const dot = segRights[i - 1].dot(segRights[i]);
      const miterScale = Math.min(1 / Math.sqrt((1 + dot) / 2), 1.25);
      right.multiplyScalar(miterScale);
    }

    const p = points[i];
    // Left vertex
    vertices.push(p.x - right.x * half, 0, p.z - right.z * half);
    // Right vertex
    vertices.push(p.x + right.x * half, 0, p.z + right.z * half);

    // Create triangles for the quad between this vertex pair and the next
    if (i < points.length - 1) {
      const idx = i * 2;
      indices.push(idx, idx + 2, idx + 1);
      indices.push(idx + 1, idx + 2, idx + 3);
    }
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = createRoadSurfaceMaterial(color, mapStyle);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = mapStyle !== "light";
  return mesh;
}

/**
 * Alternative rendering function using TubeGeometry for main roads
 * This creates 3D roads with more visual detail but is more expensive
 */
export function renderRoadsWithTubes(
  edges: RoadEdge[],
  projection: typeof CityProjection,
  scene: THREE.Scene,
): void {
  console.log(`Rendering ${edges.length} roads with tube geometry...`);

  edges.forEach((edge) => {
    if (edge.geometry.length < 2) return;

    const points = edge.geometry.map((coord) =>
      projection.projectToWorld(coord),
    );

    const { width } = getRoadStyle(edge.speedLimit, edge.lanes);

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.max(points.length * 2, 32),
      width / 2,
      8,
      false,
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.95,
      metalness: 0.0,
    });
    const roadMesh = new THREE.Mesh(geometry, material);
    roadMesh.position.y = 0;

    roadMesh.name = `road-tube-${edge.id || "segment"}`;
    roadMesh.userData.isRoad = true;
    roadMesh.userData.roadWidth = width;

    scene.add(roadMesh);
  });

  console.log("✅ Roads rendered with tubes");
}

// ─── Traffic Impact Heatmap Overlay ─────────────────────────────────────────

/**
 * Render a colored heatmap overlay on top of existing roads to show traffic impact.
 * Each impacted edge gets a semi-transparent colored overlay (green→red).
 * Returns a THREE.Group that can be added/removed from the scene.
 */
/**
 * Render a distance-based gradient heatmap overlay on roads.
 * Roads near buildings glow red, transitioning to orange then green as distance increases.
 * When buildingPositions is provided, uses per-vertex coloring based on distance to nearest building.
 * Falls back to uniform congestion-level coloring when no building positions are given.
 */
export function renderTrafficHeatmap(
  edgeImpact: Map<string, { edgeId: string; level: number; delta: number; distanceFromSource?: number }>,
  allEdges: RoadEdge[],
  projection: typeof CityProjection,
  buildingPositions?: [number, number][],
  maxImpactRadius: number = 800,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "traffic-heatmap";

  const edgeMap = new Map(allEdges.map((e) => [e.id, e]));

  // Pre-compute building world positions for vertex gradient
  let buildingWorldPositions: THREE.Vector3[] | null = null;
  if (buildingPositions && buildingPositions.length > 0) {
    buildingWorldPositions = buildingPositions.map(pos => projection.projectToWorld(pos));
  }

  edgeImpact.forEach((impact) => {
    const edge = edgeMap.get(impact.edgeId);
    if (!edge || edge.geometry.length < 2) return;

    const points = edge.geometry.map((coord) =>
      projection.projectToWorld(coord),
    );

    const { width } = getRoadStyle(edge.speedLimit, edge.lanes);
    const overlayWidth = width * 0.85;

    let mesh: THREE.Mesh;
    if (buildingWorldPositions) {
      // Per-vertex gradient based on distance to nearest building
      mesh = createGradientHeatmapStrip(points, overlayWidth, buildingWorldPositions, maxImpactRadius);
    } else {
      const color = getCongestionHex(impact.level);
      mesh = createHeatmapStrip(points, overlayWidth, color, impact.level);
    }

    mesh.position.y = 4.5;
    mesh.name = `heatmap-${edge.id}`;
    group.add(mesh);
  });

  return group;
}

/**
 * Render markers at congested intersections.
 * Returns a THREE.Group of pulsing red rings.
 */
export function renderCongestionMarkers(
  nodeIds: string[],
  nodePositions: Map<string, [number, number]>,
  projection: typeof CityProjection,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "congestion-markers";

  nodeIds.forEach((nodeId) => {
    const pos = nodePositions.get(nodeId);
    if (!pos) return;

    const worldPos = projection.projectToWorld(pos);

    // Red pulsing ring at congested intersection
    const ringGeometry = new THREE.RingGeometry(
      15 * SCALE_FACTOR,
      20 * SCALE_FACTOR,
      32,
    );
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff2222,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(worldPos.x, 2, worldPos.z);
    ring.rotation.x = -Math.PI / 2;
    ring.name = `congestion-ring-${nodeId}`;
    group.add(ring);

    // Inner glow
    const innerGeometry = new THREE.CircleGeometry(12 * SCALE_FACTOR, 32);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const inner = new THREE.Mesh(innerGeometry, innerMaterial);
    inner.position.set(worldPos.x, 1.8, worldPos.z);
    inner.rotation.x = -Math.PI / 2;
    group.add(inner);
  });

  return group;
}

/** Congestion level (0-1) to hex color */
function getCongestionHex(level: number): number {
  const t = Math.max(0, Math.min(1, level));
  let r: number, g: number;
  if (t < 0.5) {
    r = Math.round(t * 2 * 255);
    g = 255;
  } else {
    r = 255;
    g = Math.round((1 - (t - 0.5) * 2) * 255);
  }
  return (r << 16) | (g << 8) | 0;
}

/** Create a heatmap strip mesh along a polyline */
function createHeatmapStrip(
  points: THREE.Vector3[],
  width: number,
  color: number,
  level: number,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const half = width / 2;
  const vertices: number[] = [];
  const indices: number[] = [];

  const segRights: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const forward = new THREE.Vector3()
      .subVectors(points[i + 1], points[i])
      .normalize();
    segRights.push(new THREE.Vector3(-forward.z, 0, forward.x));
  }

  for (let i = 0; i < points.length; i++) {
    let right: THREE.Vector3;
    if (i === 0) {
      right = segRights[0].clone();
    } else if (i === points.length - 1) {
      right = segRights[segRights.length - 1].clone();
    } else {
      right = new THREE.Vector3()
        .addVectors(segRights[i - 1], segRights[i])
        .normalize();
      const dot = segRights[i - 1].dot(segRights[i]);
      const miterScale = Math.min(1 / Math.sqrt((1 + dot) / 2), 1.25);
      right.multiplyScalar(miterScale);
    }

    const p = points[i];
    vertices.push(p.x - right.x * half, 0, p.z - right.z * half);
    vertices.push(p.x + right.x * half, 0, p.z + right.z * half);

    if (i < points.length - 1) {
      const idx = i * 2;
      indices.push(idx, idx + 2, idx + 1);
      indices.push(idx + 1, idx + 2, idx + 3);
    }
  }

  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const opacity = 0.35 + level * 0.45; // more opaque for higher congestion
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

/**
 * Distance-to-color mapping for gradient heatmap.
 * 0-100m = red, 100-200m = orange, 200-300m = green.
 * Returns [r, g, b] in 0-1 range.
 */
function distanceToColor(dist: number, maxRadius: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, dist / maxRadius)); // 0=closest, 1=farthest
  if (t < 0.33) {
    // Red → Orange
    const s = t / 0.33;
    return [1, s * 0.65, 0];
  } else if (t < 0.66) {
    // Orange → Yellow-Green
    const s = (t - 0.33) / 0.33;
    return [1 - s * 0.5, 0.65 + s * 0.35, 0];
  } else {
    // Yellow-Green → Green
    const s = (t - 0.66) / 0.34;
    return [0.5 - s * 0.5, 1, 0];
  }
}

/**
 * Create a heatmap strip with per-vertex colors based on distance to nearest building.
 * Produces a smooth red→orange→green gradient radiating outward from buildings.
 */
function createGradientHeatmapStrip(
  points: THREE.Vector3[],
  width: number,
  buildingWorldPositions: THREE.Vector3[],
  maxRadius: number,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const half = width / 2;
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const segRights: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const forward = new THREE.Vector3()
      .subVectors(points[i + 1], points[i])
      .normalize();
    segRights.push(new THREE.Vector3(-forward.z, 0, forward.x));
  }

  for (let i = 0; i < points.length; i++) {
    let right: THREE.Vector3;
    if (i === 0) {
      right = segRights[0].clone();
    } else if (i === points.length - 1) {
      right = segRights[segRights.length - 1].clone();
    } else {
      right = new THREE.Vector3()
        .addVectors(segRights[i - 1], segRights[i])
        .normalize();
      const dot = segRights[i - 1].dot(segRights[i]);
      const miterScale = Math.min(1 / Math.sqrt((1 + dot) / 2), 1.25);
      right.multiplyScalar(miterScale);
    }

    const p = points[i];

    // Compute distance from this vertex to nearest building (in world coords, XZ plane)
    let minDist = Infinity;
    for (const bPos of buildingWorldPositions) {
      const dx = p.x - bPos.x;
      const dz = p.z - bPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }

    // Convert world distance to approximate meters (SCALE_FACTOR = 10/1.4)
    const distMeters = minDist / SCALE_FACTOR;
    const [r, g, b] = distanceToColor(distMeters, maxRadius);

    // Left vertex
    vertices.push(p.x - right.x * half, 0, p.z - right.z * half);
    colors.push(r, g, b);
    // Right vertex
    vertices.push(p.x + right.x * half, 0, p.z + right.z * half);
    colors.push(r, g, b);

    if (i < points.length - 1) {
      const idx = i * 2;
      indices.push(idx, idx + 2, idx + 1);
      indices.push(idx + 1, idx + 2, idx + 3);
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

/**
 * Render barricade markers on blocked roads.
 * Places a red/white striped box at the midpoint of each barricaded edge.
 */
export function renderBarricadeMarkers(
  barricadedEdgeIds: Set<string>,
  allEdges: RoadEdge[],
  projection: typeof CityProjection,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "barricade-markers";

  const edgeMap = new Map(allEdges.map(e => [e.id, e]));

  // Create red/white stripe texture using canvas
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const stripeWidth = 8;
  for (let i = 0; i < canvas.width; i += stripeWidth * 2) {
    ctx.fillStyle = "#ff2222";
    ctx.fillRect(i, 0, stripeWidth, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(i + stripeWidth, 0, stripeWidth, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  for (const edgeId of barricadedEdgeIds) {
    const edge = edgeMap.get(edgeId);
    if (!edge || edge.geometry.length < 2) continue;

    const points = edge.geometry.map(coord => projection.projectToWorld(coord));

    // Find midpoint of the edge
    let totalLen = 0;
    const segLengths: number[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const len = points[i].distanceTo(points[i + 1]);
      segLengths.push(len);
      totalLen += len;
    }
    const halfLen = totalLen / 2;
    let accum = 0;
    let midpoint = points[0].clone();
    let direction = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < segLengths.length; i++) {
      if (accum + segLengths[i] >= halfLen) {
        const t = (halfLen - accum) / segLengths[i];
        midpoint = new THREE.Vector3().lerpVectors(points[i], points[i + 1], t);
        direction = new THREE.Vector3().subVectors(points[i + 1], points[i]).normalize();
        break;
      }
      accum += segLengths[i];
    }

    const { width: roadWidth } = getRoadStyle(edge.speedLimit, edge.lanes);
    const barricadeWidth = roadWidth;
    const barricadeHeight = 5;
    const barricadeDepth = 3;

    const barricadeGeom = new THREE.BoxGeometry(barricadeWidth, barricadeHeight, barricadeDepth);
    const barricadeMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.1,
    });

    const barricade = new THREE.Mesh(barricadeGeom, barricadeMat);
    barricade.position.set(midpoint.x, barricadeHeight / 2 + 0.5, midpoint.z);

    // Rotate to face along the road
    const angle = Math.atan2(direction.x, direction.z);
    barricade.rotation.y = angle;

    barricade.name = `barricade-${edgeId}`;
    barricade.userData.isBarricade = true;
    barricade.castShadow = true;
    group.add(barricade);
  }

  return group;
}
