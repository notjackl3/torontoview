/**
 * Building Renderer for 3D City Visualization
 * Renders buildings with extruded walls and roof geometry
 */

import * as THREE from "three";
import { Building, RoofShape } from "./buildingData";
import { CityProjection } from "./projection";

export const HEIGHT_MULTIPLIER = 1.0;
const SCALE_FACTOR = 10 / 1.4;

/**
 * Render buildings as 3D meshes and add them to the scene
 */
export function renderBuildings(
  buildings: Building[],
  projection: typeof CityProjection,
  scene: THREE.Object3D,
): Map<string, THREE.Group> {
  console.log(`Rendering ${buildings.length} buildings...`);

  let rendered = 0;
  const meshMap = new Map<string, THREE.Group>();

  buildings.forEach((building) => {
    try {
      const group = createBuildingGroup(building, projection);
      if (group) {
        scene.add(group);
        meshMap.set(building.id, group);
        rendered++;
      }
    } catch (error) {
      console.warn(`Failed to render building ${building.id}:`, error);
    }
  });

  console.log(`✅ Rendered ${rendered} buildings`);
  return meshMap;
}

/**
 * Create a complete building group (walls + roof)
 */
function createBuildingGroup(
  building: Building,
  projection: typeof CityProjection,
): THREE.Group | null {
  if (building.footprint.length < 3) return null;

  // Project footprint to world space
  const projectedPoints: THREE.Vector3[] = [];
  const shape = new THREE.Shape();

  building.footprint.forEach((coord, index) => {
    const worldPos = projection.projectToWorld(coord);
    projectedPoints.push(worldPos);
    if (index === 0) {
      shape.moveTo(worldPos.x, worldPos.z);
    } else {
      shape.lineTo(worldPos.x, worldPos.z);
    }
  });

  // Close the shape
  if (projectedPoints.length > 0) {
    shape.lineTo(projectedPoints[0].x, projectedPoints[0].z);
  }

  const scaledWallHeight = building.height * SCALE_FACTOR * HEIGHT_MULTIPLIER;

  const group = new THREE.Group();

  // --- Walls ---
  const wallColor = getWallColor(building);
  const wallMaterial = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85, metalness: 0.05 });

  const wallGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: scaledWallHeight,
    bevelEnabled: false,
  });
  wallGeometry.rotateX(Math.PI / 2);
  wallGeometry.translate(0, scaledWallHeight, 0);

  const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // --- Roof ---
  const roofShape = building.roofShape || "flat";
  const scaledRoofHeight = (building.roofHeight || 0) * SCALE_FACTOR * HEIGHT_MULTIPLIER;

  if (roofShape !== "flat" && scaledRoofHeight > 0) {
    const roofColor = getRoofColor(building);
    const roofMesh = createRoofMesh(
      projectedPoints,
      shape,
      scaledWallHeight,
      scaledRoofHeight,
      roofShape,
      roofColor,
    );
    if (roofMesh) {
      roofMesh.castShadow = true;
      roofMesh.receiveShadow = true;
      group.add(roofMesh);
    }
  }
  // Note: flat roofs don't need a separate cap — ExtrudeGeometry already creates top/bottom faces

  // Set name and userData for identification
  group.name = building.id;
  group.userData = {
    buildingId: building.id,
    isOsmBuilding: true,
    type: building.type,
    height: building.height,
  };

  return group;
}

/**
 * Create roof mesh based on roof shape
 */
function createRoofMesh(
  footprintPoints: THREE.Vector3[],
  shape: THREE.Shape,
  wallHeight: number,
  roofHeight: number,
  roofShape: RoofShape,
  color: number,
): THREE.Mesh | null {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });

  switch (roofShape) {
    case "gabled":
      return createGabledRoof(footprintPoints, wallHeight, roofHeight, material);
    case "hipped":
      return createHippedRoof(footprintPoints, shape, wallHeight, roofHeight, material);
    case "pyramidal":
      return createPyramidalRoof(footprintPoints, wallHeight, roofHeight, material);
    case "dome":
      return createDomeRoof(footprintPoints, wallHeight, roofHeight, material);
    case "skillion":
      return createSkillionRoof(footprintPoints, shape, wallHeight, roofHeight, material);
    default:
      return null;
  }
}

/**
 * Compute the oriented bounding rectangle's long axis (ridge direction)
 * Returns { center, direction (unit), halfWidth, halfLength }
 */
function computeRidgeAxis(points: THREE.Vector3[]) {
  // Use 2D points (X, Z)
  const pts = points.map((p) => [p.x, p.z] as [number, number]);

  // Find centroid
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length;
  cz /= pts.length;

  // PCA: find principal axis via covariance matrix
  let cxx = 0, cxz = 0, czz = 0;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    cxx += dx * dx;
    cxz += dx * dz;
    czz += dz * dz;
  }

  // Eigenvector for larger eigenvalue of [[cxx, cxz], [cxz, czz]]
  const theta = 0.5 * Math.atan2(2 * cxz, cxx - czz);
  const longAxis = [Math.cos(theta), Math.sin(theta)] as [number, number];
  const shortAxis = [-longAxis[1], longAxis[0]] as [number, number];

  // Project all points onto both axes to get extents
  let minLong = Infinity, maxLong = -Infinity;
  let minShort = Infinity, maxShort = -Infinity;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    const projLong = dx * longAxis[0] + dz * longAxis[1];
    const projShort = dx * shortAxis[0] + dz * shortAxis[1];
    minLong = Math.min(minLong, projLong);
    maxLong = Math.max(maxLong, projLong);
    minShort = Math.min(minShort, projShort);
    maxShort = Math.max(maxShort, projShort);
  }

  const halfLength = (maxLong - minLong) / 2;
  const halfWidth = (maxShort - minShort) / 2;

  return {
    center: [cx, cz] as [number, number],
    longAxis,
    shortAxis,
    halfLength,
    halfWidth,
  };
}

/**
 * Gabled roof: triangular prism along the longest axis
 */
function createGabledRoof(
  points: THREE.Vector3[],
  wallHeight: number,
  roofHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const { center, longAxis, shortAxis, halfLength, halfWidth } = computeRidgeAxis(points);
  const [cx, cz] = center;

  // 6 vertices: 2 ridge points (top) + 4 eave points (bottom corners)
  const vertices = new Float32Array([
    // Ridge start (top)
    cx + longAxis[0] * halfLength, wallHeight + roofHeight, cz + longAxis[1] * halfLength,
    // Ridge end (top)
    cx - longAxis[0] * halfLength, wallHeight + roofHeight, cz - longAxis[1] * halfLength,
    // Bottom corners (eave level = wall height)
    cx + longAxis[0] * halfLength + shortAxis[0] * halfWidth, wallHeight, cz + longAxis[1] * halfLength + shortAxis[1] * halfWidth,
    cx + longAxis[0] * halfLength - shortAxis[0] * halfWidth, wallHeight, cz + longAxis[1] * halfLength - shortAxis[1] * halfWidth,
    cx - longAxis[0] * halfLength + shortAxis[0] * halfWidth, wallHeight, cz - longAxis[1] * halfLength + shortAxis[1] * halfWidth,
    cx - longAxis[0] * halfLength - shortAxis[0] * halfWidth, wallHeight, cz - longAxis[1] * halfLength - shortAxis[1] * halfWidth,
  ]);

  // Triangles: two slope faces + two gable ends
  const indices = [
    // Left slope (ridge 0-1, eave 2-4)
    0, 2, 4, 0, 4, 1,
    // Right slope (ridge 0-1, eave 3-5)
    0, 1, 3, 1, 5, 3,
    // Gable end 1 (ridge 0, eave 2-3)
    0, 3, 2,
    // Gable end 2 (ridge 1, eave 4-5)
    1, 4, 5,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

/**
 * Hipped roof: all four sides slope inward to a shortened ridge
 */
function createHippedRoof(
  points: THREE.Vector3[],
  shape: THREE.Shape,
  wallHeight: number,
  roofHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const { center, longAxis, shortAxis, halfLength, halfWidth } = computeRidgeAxis(points);
  const [cx, cz] = center;

  // Ridge is shorter than the building - inset by halfWidth on each end
  const ridgeInset = Math.min(halfWidth, halfLength * 0.5);
  const ridgeHalfLen = halfLength - ridgeInset;

  const vertices = new Float32Array([
    // Ridge start (0)
    cx + longAxis[0] * ridgeHalfLen, wallHeight + roofHeight, cz + longAxis[1] * ridgeHalfLen,
    // Ridge end (1)
    cx - longAxis[0] * ridgeHalfLen, wallHeight + roofHeight, cz - longAxis[1] * ridgeHalfLen,
    // Eave corners (2-5)
    cx + longAxis[0] * halfLength + shortAxis[0] * halfWidth, wallHeight, cz + longAxis[1] * halfLength + shortAxis[1] * halfWidth,
    cx + longAxis[0] * halfLength - shortAxis[0] * halfWidth, wallHeight, cz + longAxis[1] * halfLength - shortAxis[1] * halfWidth,
    cx - longAxis[0] * halfLength + shortAxis[0] * halfWidth, wallHeight, cz - longAxis[1] * halfLength + shortAxis[1] * halfWidth,
    cx - longAxis[0] * halfLength - shortAxis[0] * halfWidth, wallHeight, cz - longAxis[1] * halfLength - shortAxis[1] * halfWidth,
  ]);

  const indices = [
    // Left slope
    0, 2, 4, 0, 4, 1,
    // Right slope
    0, 1, 3, 1, 5, 3,
    // Hip end 1
    0, 3, 2,
    // Hip end 2
    1, 4, 5,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

/**
 * Pyramidal roof: all edges meet at a single apex
 */
function createPyramidalRoof(
  points: THREE.Vector3[],
  wallHeight: number,
  roofHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const { center } = computeRidgeAxis(points);
  const [cx, cz] = center;

  // Apex
  const apex = new THREE.Vector3(cx, wallHeight + roofHeight, cz);

  // Build fan triangles from each edge to the apex
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const base = vertices.length / 3;

    vertices.push(apex.x, apex.y, apex.z);
    vertices.push(p1.x, wallHeight, p1.z);
    vertices.push(p2.x, wallHeight, p2.z);

    indices.push(base, base + 1, base + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

/**
 * Dome roof: hemisphere on top of the building
 */
function createDomeRoof(
  points: THREE.Vector3[],
  wallHeight: number,
  roofHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const { center, halfWidth, halfLength } = computeRidgeAxis(points);
  const radius = Math.min(halfWidth, halfLength);

  const geometry = new THREE.SphereGeometry(
    radius,
    16,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );

  // Scale to match roof height
  geometry.scale(1, roofHeight / radius, 1);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(center[0], wallHeight, center[1]);

  return mesh;
}

/**
 * Skillion (lean-to) roof: single slope
 */
function createSkillionRoof(
  points: THREE.Vector3[],
  shape: THREE.Shape,
  wallHeight: number,
  roofHeight: number,
  material: THREE.Material,
): THREE.Mesh {
  const { center, shortAxis, halfWidth } = computeRidgeAxis(points);

  // Create a tilted plane from the footprint shape
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);

  // Tilt vertices: high side on one edge, low on the other
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Project onto short axis to get tilt
    const dx = x - center[0], dz = z - center[1];
    const proj = dx * shortAxis[0] + dz * shortAxis[1];
    const t = (proj / halfWidth) * 0.5 + 0.5; // 0..1
    positions.setY(i, wallHeight + t * roofHeight);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

// ==================== Color helpers ====================

/**
 * Get wall color: explicit OSM color > material-based > type-based > default
 */
function getWallColor(building: Building): number {
  // Explicit color from OSM
  if (building.color) {
    return new THREE.Color(building.color).getHex();
  }

  // Material-based color
  if (building.material) {
    const matColor = materialToColor(building.material);
    if (matColor !== null) return matColor;
  }

  // Type-based color
  return typeToWallColor(building.type);
}

/**
 * Get roof color: explicit OSM color > inferred from roof shape/building type
 */
function getRoofColor(building: Building): number {
  if (building.roofColor) {
    return new THREE.Color(building.roofColor).getHex();
  }

  return 0xdddddd; // Uniform light gray roof
}

function materialToColor(_material: string): number | null {
  return null; // All buildings use white default
}

function typeToWallColor(type?: string): number {
  switch (type) {
    default:
      return 0xffffff; // White
  }
}
