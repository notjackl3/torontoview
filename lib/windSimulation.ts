/**
 * Wind Effect Visualization for Toronto
 * Simplified wind model using building heights and orientation.
 * Supports hourly wind data with pre-computed fields for time-of-day scrubbing.
 */

import * as THREE from "three";
import { Building } from "./buildingData";
import { CityProjection } from "./projection";
import type { HourlyWindData } from "./windData";

const DEFAULT_WIND_SPEED = 5.0; // m/s
const COMFORT_THRESHOLD = 6.0; // m/s — uncomfortable
const SAFETY_THRESHOLD = 15.0; // m/s — dangerous

const GRID_RES = 30;
const PARTICLE_AREA_PADDING = 40;
const MAX_ARROWS = 200;

// Default direction: blowing FROM WSW, particles move toward ENE
const DEFAULT_DIR_X = 0.87;
const DEFAULT_DIR_Z = -0.5;

export interface WindCell {
  x: number;
  z: number;
  speed: number;
  dirX: number;
  dirZ: number;
}

interface BuildingObstacle {
  centerX: number;
  centerZ: number;
  halfWidth: number;
  halfDepth: number;
  height: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface ObstacleData {
  obstacles: BuildingObstacle[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

// --- 2a: speedToColor helper ---
const _tmpColor = new THREE.Color();
function speedToColor(speed: number): THREE.Color {
  if (speed < 3) {
    _tmpColor.setRGB(0.1, 0.75, 0.2);
  } else if (speed < COMFORT_THRESHOLD) {
    const t = (speed - 3) / (COMFORT_THRESHOLD - 3);
    _tmpColor.setRGB(0.1 + t * 0.9, 0.75, 0.2 - t * 0.2);
  } else if (speed < SAFETY_THRESHOLD) {
    const t = (speed - COMFORT_THRESHOLD) / (SAFETY_THRESHOLD - COMFORT_THRESHOLD);
    _tmpColor.setRGB(1.0, 0.65 - t * 0.55, 0.0);
  } else {
    _tmpColor.setRGB(0.95, 0.05, 0.05);
  }
  return _tmpColor;
}

// --- 2b: buildObstacles helper ---
function buildObstacles(
  buildings: Building[],
  projection: typeof CityProjection,
): ObstacleData {
  const obstacles: BuildingObstacle[] = [];
  let bMinX = Infinity, bMaxX = -Infinity;
  let bMinZ = Infinity, bMaxZ = -Infinity;

  for (const b of buildings) {
    if (b.footprint.length < 3 || b.height < 2) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const coord of b.footprint) {
      const p = projection.projectToWorld(coord);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    obstacles.push({
      centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2,
      halfWidth: (maxX - minX) / 2, halfDepth: (maxZ - minZ) / 2,
      height: b.height, minX, maxX, minZ, maxZ,
    });
    if (minX < bMinX) bMinX = minX; if (maxX > bMaxX) bMaxX = maxX;
    if (minZ < bMinZ) bMinZ = minZ; if (maxZ > bMaxZ) bMaxZ = maxZ;
  }

  bMinX -= PARTICLE_AREA_PADDING; bMaxX += PARTICLE_AREA_PADDING;
  bMinZ -= PARTICLE_AREA_PADDING; bMaxZ += PARTICLE_AREA_PADDING;

  return { obstacles, bounds: { minX: bMinX, maxX: bMaxX, minZ: bMinZ, maxZ: bMaxZ } };
}

// --- 2c: Parameterized computeWindField ---
async function computeWindField(
  obstacleData: ObstacleData,
  baseSpeed: number = DEFAULT_WIND_SPEED,
  windDirX: number = DEFAULT_DIR_X,
  windDirZ: number = DEFAULT_DIR_Z,
): Promise<WindCell[]> {
  const { obstacles, bounds } = obstacleData;
  const { minX: bMinX, maxX: bMaxX, minZ: bMinZ, maxZ: bMaxZ } = bounds;

  const cols = Math.ceil((bMaxX - bMinX) / GRID_RES);
  const rows = Math.ceil((bMaxZ - bMinZ) / GRID_RES);
  const cells: WindCell[] = new Array(rows * cols);

  for (let r = 0; r < rows; r++) {
    if (r > 0 && r % 5 === 0) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    for (let c = 0; c < cols; c++) {
      const cellX = bMinX + c * GRID_RES + GRID_RES / 2;
      const cellZ = bMinZ + r * GRID_RES + GRID_RES / 2;

      let speed = baseSpeed;
      let dX = windDirX;
      let dZ = windDirZ;
      let inside = false;

      for (const obs of obstacles) {
        if (cellX >= obs.minX && cellX <= obs.maxX && cellZ >= obs.minZ && cellZ <= obs.maxZ) {
          inside = true;
          break;
        }

        const relX = cellX - obs.centerX;
        const relZ = cellZ - obs.centerZ;
        const dist = Math.sqrt(relX * relX + relZ * relZ);
        const radius = Math.max(obs.halfWidth, obs.halfDepth);

        const dotWind = relX * windDirX + relZ * windDirZ;
        const crossWind = Math.abs(relX * (-windDirZ) + relZ * windDirX);
        const wakeLen = obs.height * 2.0;
        if (dotWind > 0 && dotWind < wakeLen && crossWind < radius * 1.3) {
          const f = 1 - (1 - dotWind / wakeLen) * 0.5 * Math.min(obs.height / 20, 1.5);
          speed *= Math.max(0.3, f);
        }

        if (dist > radius * 0.9 && dist < radius * 1.8) {
          speed *= 1 + (obs.height / 50) * 0.5 * Math.max(0, 1 - (dist - radius) / radius);
        }
      }

      if (inside) { speed = 0; }

      const len = Math.sqrt(dX * dX + dZ * dZ);
      cells[r * cols + c] = { x: cellX, z: cellZ, speed, dirX: dX / len, dirZ: dZ / len };
    }
  }

  return cells;
}

// --- 2d: precomputeWindFields ---
export async function precomputeWindFields(
  buildings: Building[],
  projection: typeof CityProjection,
  hourlyData: HourlyWindData[],
): Promise<WindCell[][]> {
  const obstacleData = buildObstacles(buildings, projection);
  const fields: WindCell[][] = [];
  for (const h of hourlyData) {
    fields.push(await computeWindField(obstacleData, h.speedMs, h.dirX, h.dirZ));
  }
  return fields;
}

// --- Heatmap creation (uses speedToColor) ---
function createWindHeatmap(cells: WindCell[]): THREE.Mesh {
  const validCells = cells.filter(c => c.speed > 0.1);
  const size = GRID_RES * 0.92;
  const half = size / 2;

  const positions = new Float32Array(validCells.length * 4 * 3);
  const vColors   = new Float32Array(validCells.length * 4 * 3);
  const indices   = new Uint32Array(validCells.length * 6);

  for (let i = 0; i < validCells.length; i++) {
    const { x, z, speed } = validCells[i];
    const b = i * 12;

    positions[b]      = x - half; positions[b + 1]  = 1.5; positions[b + 2]  = z - half;
    positions[b + 3]  = x + half; positions[b + 4]  = 1.5; positions[b + 5]  = z - half;
    positions[b + 6]  = x + half; positions[b + 7]  = 1.5; positions[b + 8]  = z + half;
    positions[b + 9]  = x - half; positions[b + 10] = 1.5; positions[b + 11] = z + half;

    const col = speedToColor(speed);
    for (let v = 0; v < 4; v++) {
      vColors[(i * 4 + v) * 3]     = col.r;
      vColors[(i * 4 + v) * 3 + 1] = col.g;
      vColors[(i * 4 + v) * 3 + 2] = col.b;
    }

    const vi = i * 4, ib = i * 6;
    indices[ib] = vi; indices[ib+1] = vi+1; indices[ib+2] = vi+2;
    indices[ib+3] = vi; indices[ib+4] = vi+2; indices[ib+5] = vi+3;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color",    new THREE.BufferAttribute(vColors, 3));
  geom.setIndex(new THREE.BufferAttribute(indices, 1));

  const mesh = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  }));
  mesh.name = "windHeatmap";
  mesh.renderOrder = 9998;
  return mesh;
}

// --- 2e: Arrow creation with pre-allocated MAX_ARROWS ---
function createWindArrows(cells: WindCell[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "windArrows";

  const arrowGeom = new THREE.ConeGeometry(2.5, 7, 4);
  arrowGeom.rotateX(Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0.6, depthWrite: false, vertexColors: true,
  });

  // Pre-allocate with MAX_ARROWS capacity
  const mesh = new THREE.InstancedMesh(arrowGeom, mat, MAX_ARROWS);
  mesh.renderOrder = 9996;
  mesh.name = "windArrowMesh";

  // Populate with initial data
  const count = populateArrows(mesh, cells);
  mesh.count = count;

  group.add(mesh);
  group.userData.arrowMaterial = mat;
  return group;
}

function populateArrows(mesh: THREE.InstancedMesh, cells: WindCell[]): number {
  const eligible: WindCell[] = [];
  for (let i = 0; i < cells.length && eligible.length < MAX_ARROWS; i += 2) {
    if (cells[i] && cells[i].speed >= COMFORT_THRESHOLD * 0.7) eligible.push(cells[i]);
  }

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  for (let i = 0; i < eligible.length; i++) {
    const cell = eligible[i];
    dummy.position.set(cell.x, 4, cell.z);
    dummy.rotation.y = -Math.atan2(cell.dirZ, cell.dirX) + Math.PI / 2;
    dummy.scale.setScalar(0.5 + (cell.speed / SAFETY_THRESHOLD) * 0.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.set(cell.speed >= SAFETY_THRESHOLD ? 0xff3333 : cell.speed >= COMFORT_THRESHOLD ? 0xffaa33 : 0x3366ff);
    mesh.setColorAt(i, col);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return eligible.length;
}

// --- WindVisualization with setWindField ---
export interface WindVisualization {
  group: THREE.Group;
  update: (deltaTime: number) => void;
  dispose: () => void;
  setWindField: (cells: WindCell[]) => void;
}

export async function createWindVisualization(
  buildings: Building[],
  projection: typeof CityProjection,
  initialCells?: WindCell[],
): Promise<WindVisualization> {
  const group = new THREE.Group();
  group.name = "windLayer";

  // If no initial cells provided, compute with defaults (backward-compat)
  const cells = initialCells ?? await computeWindField(buildObstacles(buildings, projection));

  const heatmapMesh = createWindHeatmap(cells);
  group.add(heatmapMesh);
  group.add(createWindArrows(cells));

  // --- 2f: setWindField — in-place updates ---
  function setWindField(newCells: WindCell[]) {
    // Update heatmap colors in-place
    const colorAttr = heatmapMesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    const validCells = newCells.filter(c => c.speed > 0.1);
    for (let i = 0; i < validCells.length && i * 4 * 3 < colorAttr.array.length; i++) {
      const col = speedToColor(validCells[i].speed);
      for (let v = 0; v < 4; v++) {
        colorAttr.array[(i * 4 + v) * 3]     = col.r;
        colorAttr.array[(i * 4 + v) * 3 + 1] = col.g;
        colorAttr.array[(i * 4 + v) * 3 + 2] = col.b;
      }
    }
    colorAttr.needsUpdate = true;

    // Update arrows in-place
    const arrowGroup = group.getObjectByName("windArrows") as THREE.Group | undefined;
    if (arrowGroup) {
      const arrowMesh = arrowGroup.getObjectByName("windArrowMesh") as THREE.InstancedMesh | undefined;
      if (arrowMesh) {
        arrowMesh.count = populateArrows(arrowMesh, newCells);
      }
    }
  }

  function update(_deltaTime: number) {
    const arrowGroup = group.getObjectByName("windArrows") as THREE.Group | undefined;
    if (arrowGroup) {
      const mat = arrowGroup.userData.arrowMaterial as THREE.MeshBasicMaterial | undefined;
      if (mat) mat.opacity = 0.5 + 0.3 * Math.sin(Date.now() * 0.003);
    }
  }

  function dispose() {
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh || obj instanceof THREE.Points) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  }

  return { group, update, dispose, setWindField };
}
