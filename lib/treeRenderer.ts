/**
 * Tree Renderer for 3D City Visualization
 * Renders trees as 3D meshes in Three.js (for use with ThreeMap)
 */

import * as THREE from "three";
import { TreeType, TreeConfig, DEFAULT_TREE_CONFIG } from "./editor/types/buildingSpec";

export interface TreeInstance {
  position: [number, number, number];
  type: TreeType;
  scale: number;
  rotation: number;
}

// Seeded random number generator for consistent tree placement
function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate tree instances around a building
 */
export function generateTreesAroundBuilding(
  buildingPosition: { x: number; y: number; z: number },
  buildingWidth: number,
  buildingDepth: number,
  config: TreeConfig
): TreeInstance[] {
  if (!config.enabled || config.types.length === 0) return [];

  const trees: TreeInstance[] = [];
  const count = config.density * 3;

  for (let i = 0; i < count; i++) {
    const seed1 = config.seed + i * 17;
    const seed2 = config.seed + i * 31;
    const seed3 = config.seed + i * 47;
    const seed4 = config.seed + i * 61;
    const seed5 = config.seed + i * 79;

    const angle = seededRandom(seed1) * Math.PI * 2;
    const minDist = Math.max(buildingWidth, buildingDepth) / 2 + 1;
    const maxDist = minDist + config.radius;
    const distance = minDist + seededRandom(seed2) * (maxDist - minDist);

    const x = buildingPosition.x + Math.cos(angle) * distance;
    const z = buildingPosition.z + Math.sin(angle) * distance;

    const typeIndex = Math.floor(seededRandom(seed3) * config.types.length);
    const type = config.types[typeIndex];

    const scale = config.minScale + seededRandom(seed4) * (config.maxScale - config.minScale);
    const rotation = seededRandom(seed5) * Math.PI * 2;

    trees.push({
      position: [x, buildingPosition.y, z],
      type,
      scale,
      rotation,
    });
  }

  return trees;
}

/**
 * Create a tree mesh based on type
 */
export function createTreeMesh(type: TreeType, scale: number = 1, rotation: number = 0): THREE.Group {
  const group = new THREE.Group();

  switch (type) {
    case 'autumn-blaze-maple':
      createAutumnBlazeMaple(group);
      break;
    case 'canadian-serviceberry':
      createCanadianServiceberry(group);
      break;
    case 'colorado-blue-spruce':
      createColoradoBlueSpruce(group);
      break;
    case 'cortland-apple':
      createCortlandApple(group);
      break;
    case 'eastern-redbud':
      createEasternRedbud(group);
      break;
    case 'eastern-white-pine':
      createEasternWhitePine(group);
      break;
    case 'mcintosh-apple':
      createMcIntoshApple(group);
      break;
    case 'northern-red-oak':
      createNorthernRedOak(group);
      break;
    case 'paper-birch':
      createPaperBirch(group);
      break;
    case 'sugar-maple':
      createSugarMaple(group);
      break;
    case 'white-spruce':
      createWhiteSpruce(group);
      break;
    default:
      createSugarMaple(group);
  }

  group.scale.set(scale, scale, scale);
  group.rotation.y = rotation;

  return group;
}

// Autumn Blaze Maple - Tall deciduous with brilliant red fall color
function createAutumnBlazeMaple(group: THREE.Group): void {
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.25, 0.35, 3, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.5;
  group.add(trunk);

  // Main foliage
  const foliageGeometry1 = new THREE.SphereGeometry(2, 16, 12);
  const foliageMaterial1 = new THREE.MeshStandardMaterial({ color: 0xC62828 });
  const foliage1 = new THREE.Mesh(foliageGeometry1, foliageMaterial1);
  foliage1.position.y = 4;
  group.add(foliage1);

  const foliageGeometry2 = new THREE.SphereGeometry(1.2, 12, 10);
  const foliageMaterial2 = new THREE.MeshStandardMaterial({ color: 0xD32F2F });
  const foliage2 = new THREE.Mesh(foliageGeometry2, foliageMaterial2);
  foliage2.position.set(0.8, 3.5, 0.5);
  group.add(foliage2);

  const foliageGeometry3 = new THREE.SphereGeometry(1, 12, 10);
  const foliageMaterial3 = new THREE.MeshStandardMaterial({ color: 0xE53935 });
  const foliage3 = new THREE.Mesh(foliageGeometry3, foliageMaterial3);
  foliage3.position.set(-0.6, 4.2, -0.4);
  group.add(foliage3);
}

// Canadian Serviceberry - Small ornamental with white flowers
function createCanadianServiceberry(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 1.6, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6D4C41 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.8;
  group.add(trunk);

  const foliageGeometry = new THREE.SphereGeometry(1, 12, 10);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x558B2F });
  const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
  foliage.position.y = 2;
  group.add(foliage);

  // White flowers
  const flowerGeometry1 = new THREE.SphereGeometry(0.15, 8, 8);
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: 0xFFFFFF });
  const flower1 = new THREE.Mesh(flowerGeometry1, flowerMaterial);
  flower1.position.set(0.3, 2.2, 0.2);
  group.add(flower1);

  const flowerGeometry2 = new THREE.SphereGeometry(0.12, 8, 8);
  const flower2 = new THREE.Mesh(flowerGeometry2, flowerMaterial);
  flower2.position.set(-0.2, 1.9, -0.3);
  group.add(flower2);
}

// Colorado Blue Spruce - Conical conifer with blue-silver needles
function createColoradoBlueSpruce(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.25, 1.2, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.6;
  group.add(trunk);

  const coneGeometry1 = new THREE.ConeGeometry(1.2, 2, 8);
  const coneMaterial1 = new THREE.MeshStandardMaterial({ color: 0x546E7A });
  const cone1 = new THREE.Mesh(coneGeometry1, coneMaterial1);
  cone1.position.y = 1.8;
  group.add(cone1);

  const coneGeometry2 = new THREE.ConeGeometry(0.9, 1.8, 8);
  const coneMaterial2 = new THREE.MeshStandardMaterial({ color: 0x607D8B });
  const cone2 = new THREE.Mesh(coneGeometry2, coneMaterial2);
  cone2.position.y = 3;
  group.add(cone2);

  const coneGeometry3 = new THREE.ConeGeometry(0.6, 1.5, 8);
  const coneMaterial3 = new THREE.MeshStandardMaterial({ color: 0x78909C });
  const cone3 = new THREE.Mesh(coneGeometry3, coneMaterial3);
  cone3.position.y = 4;
  group.add(cone3);
}

// Cortland Apple - Small fruit tree with umbrella shape
function createCortlandApple(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 1.2, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.6;
  group.add(trunk);

  const foliageGeometry = new THREE.SphereGeometry(0.9, 12, 10);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x558B2F });
  const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
  foliage.position.y = 1.5;
  group.add(foliage);

  // Red apples
  const appleGeometry1 = new THREE.SphereGeometry(0.08, 8, 8);
  const appleMaterial1 = new THREE.MeshStandardMaterial({ color: 0xC62828 });
  const apple1 = new THREE.Mesh(appleGeometry1, appleMaterial1);
  apple1.position.set(0.3, 1.3, 0.2);
  group.add(apple1);

  const appleGeometry2 = new THREE.SphereGeometry(0.07, 8, 8);
  const appleMaterial2 = new THREE.MeshStandardMaterial({ color: 0xD32F2F });
  const apple2 = new THREE.Mesh(appleGeometry2, appleMaterial2);
  apple2.position.set(-0.2, 1.6, -0.15);
  group.add(apple2);
}

// Eastern Redbud - Heart-shaped leaves with pink blossoms
function createEasternRedbud(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 2, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1;
  group.add(trunk);

  const foliageGeometry1 = new THREE.SphereGeometry(1.5, 12, 10);
  const foliageMaterial1 = new THREE.MeshStandardMaterial({ color: 0xE91E63 });
  const foliage1 = new THREE.Mesh(foliageGeometry1, foliageMaterial1);
  foliage1.position.y = 2.8;
  group.add(foliage1);

  const foliageGeometry2 = new THREE.SphereGeometry(0.8, 10, 8);
  const foliageMaterial2 = new THREE.MeshStandardMaterial({ color: 0xF06292 });
  const foliage2 = new THREE.Mesh(foliageGeometry2, foliageMaterial2);
  foliage2.position.set(0.6, 2.5, 0.4);
  group.add(foliage2);

  const foliageGeometry3 = new THREE.SphereGeometry(0.7, 10, 8);
  const foliageMaterial3 = new THREE.MeshStandardMaterial({ color: 0xEC407A });
  const foliage3 = new THREE.Mesh(foliageGeometry3, foliageMaterial3);
  foliage3.position.set(-0.5, 3, -0.3);
  group.add(foliage3);
}

// Eastern White Pine - Tall iconic Canadian pine
function createEasternWhitePine(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.3, 3, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4E342E });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.5;
  group.add(trunk);

  const coneGeometry1 = new THREE.ConeGeometry(1.5, 2.5, 8);
  const coneMaterial1 = new THREE.MeshStandardMaterial({ color: 0x1B5E20 });
  const cone1 = new THREE.Mesh(coneGeometry1, coneMaterial1);
  cone1.position.y = 3.5;
  group.add(cone1);

  const coneGeometry2 = new THREE.ConeGeometry(1.1, 2, 8);
  const coneMaterial2 = new THREE.MeshStandardMaterial({ color: 0x2E7D32 });
  const cone2 = new THREE.Mesh(coneGeometry2, coneMaterial2);
  cone2.position.y = 5;
  group.add(cone2);

  const coneGeometry3 = new THREE.ConeGeometry(0.7, 1.5, 8);
  const coneMaterial3 = new THREE.MeshStandardMaterial({ color: 0x388E3C });
  const cone3 = new THREE.Mesh(coneGeometry3, coneMaterial3);
  cone3.position.y = 6.2;
  group.add(cone3);
}

// McIntosh Apple - Canada's national apple tree
function createMcIntoshApple(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 1.4, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.7;
  group.add(trunk);

  const foliageGeometry = new THREE.SphereGeometry(1, 12, 10);
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: 0x689F38 });
  const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
  foliage.position.y = 1.8;
  group.add(foliage);

  // Green apples
  const appleGeometry1 = new THREE.SphereGeometry(0.09, 8, 8);
  const appleMaterial1 = new THREE.MeshStandardMaterial({ color: 0x7CB342 });
  const apple1 = new THREE.Mesh(appleGeometry1, appleMaterial1);
  apple1.position.set(0.25, 1.5, 0.15);
  group.add(apple1);

  const appleGeometry2 = new THREE.SphereGeometry(0.08, 8, 8);
  const appleMaterial2 = new THREE.MeshStandardMaterial({ color: 0x8BC34A });
  const apple2 = new THREE.Mesh(appleGeometry2, appleMaterial2);
  apple2.position.set(-0.15, 1.9, -0.2);
  group.add(apple2);
}

// Northern Red Oak - Large majestic oak
function createNorthernRedOak(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.35, 0.45, 3, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4E342E });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.5;
  group.add(trunk);

  const foliageGeometry1 = new THREE.SphereGeometry(2.5, 16, 12);
  const foliageMaterial1 = new THREE.MeshStandardMaterial({ color: 0x33691E });
  const foliage1 = new THREE.Mesh(foliageGeometry1, foliageMaterial1);
  foliage1.position.y = 4.5;
  group.add(foliage1);

  const foliageGeometry2 = new THREE.SphereGeometry(1.5, 12, 10);
  const foliageMaterial2 = new THREE.MeshStandardMaterial({ color: 0x558B2F });
  const foliage2 = new THREE.Mesh(foliageGeometry2, foliageMaterial2);
  foliage2.position.set(1, 4, 0.6);
  group.add(foliage2);

  const foliageGeometry3 = new THREE.SphereGeometry(1.3, 12, 10);
  const foliageMaterial3 = new THREE.MeshStandardMaterial({ color: 0x689F38 });
  const foliage3 = new THREE.Mesh(foliageGeometry3, foliageMaterial3);
  foliage3.position.set(-0.8, 4.8, -0.5);
  group.add(foliage3);
}

// Paper Birch - White peeling bark
function createPaperBirch(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 2.4, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0xECEFF1 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.2;
  group.add(trunk);

  const foliageGeometry1 = new THREE.SphereGeometry(1.2, 12, 10);
  const foliageMaterial1 = new THREE.MeshStandardMaterial({ color: 0xC0CA33 });
  const foliage1 = new THREE.Mesh(foliageGeometry1, foliageMaterial1);
  foliage1.position.y = 2.8;
  group.add(foliage1);

  const foliageGeometry2 = new THREE.SphereGeometry(0.7, 10, 8);
  const foliageMaterial2 = new THREE.MeshStandardMaterial({ color: 0xCDDC39 });
  const foliage2 = new THREE.Mesh(foliageGeometry2, foliageMaterial2);
  foliage2.position.set(0.4, 2.5, 0.3);
  group.add(foliage2);

  const foliageGeometry3 = new THREE.SphereGeometry(0.6, 10, 8);
  const foliageMaterial3 = new THREE.MeshStandardMaterial({ color: 0xD4E157 });
  const foliage3 = new THREE.Mesh(foliageGeometry3, foliageMaterial3);
  foliage3.position.set(-0.3, 3, -0.2);
  group.add(foliage3);
}

// Sugar Maple - Iconic Canadian maple
function createSugarMaple(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.4, 4, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 2;
  group.add(trunk);

  const foliageGeometry1 = new THREE.SphereGeometry(2.8, 16, 12);
  const foliageMaterial1 = new THREE.MeshStandardMaterial({ color: 0xE65100 });
  const foliage1 = new THREE.Mesh(foliageGeometry1, foliageMaterial1);
  foliage1.position.y = 5.5;
  group.add(foliage1);

  const foliageGeometry2 = new THREE.SphereGeometry(1.6, 12, 10);
  const foliageMaterial2 = new THREE.MeshStandardMaterial({ color: 0xEF6C00 });
  const foliage2 = new THREE.Mesh(foliageGeometry2, foliageMaterial2);
  foliage2.position.set(1.2, 5, 0.8);
  group.add(foliage2);

  const foliageGeometry3 = new THREE.SphereGeometry(1.4, 12, 10);
  const foliageMaterial3 = new THREE.MeshStandardMaterial({ color: 0xF57C00 });
  const foliage3 = new THREE.Mesh(foliageGeometry3, foliageMaterial3);
  foliage3.position.set(-1, 5.8, -0.6);
  group.add(foliage3);
}

// White Spruce - Hardy Canadian conifer
function createWhiteSpruce(group: THREE.Group): void {
  const trunkGeometry = new THREE.CylinderGeometry(0.15, 0.2, 1, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 0.5;
  group.add(trunk);

  const coneGeometry1 = new THREE.ConeGeometry(1, 1.8, 8);
  const coneMaterial1 = new THREE.MeshStandardMaterial({ color: 0x2E7D32 });
  const cone1 = new THREE.Mesh(coneGeometry1, coneMaterial1);
  cone1.position.y = 1.5;
  group.add(cone1);

  const coneGeometry2 = new THREE.ConeGeometry(0.8, 1.5, 8);
  const coneMaterial2 = new THREE.MeshStandardMaterial({ color: 0x388E3C });
  const cone2 = new THREE.Mesh(coneGeometry2, coneMaterial2);
  cone2.position.y = 2.6;
  group.add(cone2);

  const coneGeometry3 = new THREE.ConeGeometry(0.5, 1.2, 8);
  const coneMaterial3 = new THREE.MeshStandardMaterial({ color: 0x43A047 });
  const cone3 = new THREE.Mesh(coneGeometry3, coneMaterial3);
  cone3.position.y = 3.5;
  group.add(cone3);
}

/**
 * Check if a mesh has road-like material (dark gray color)
 */
function isRoadMaterial(mesh: THREE.Mesh): boolean {
  const material = mesh.material;
  if (!material) return false;

  // Handle single material
  if (material instanceof THREE.MeshBasicMaterial ||
      material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshLambertMaterial) {
    const color = material.color;
    // Check for dark gray colors (roads are typically 0x333333)
    // RGB values around 0.2 (51/255 ≈ 0.2)
    if (color && color.r < 0.3 && color.g < 0.3 && color.b < 0.3 &&
        Math.abs(color.r - color.g) < 0.1 && Math.abs(color.g - color.b) < 0.1) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a point overlaps with any object in the collision list
 */
function checkTreeCollision(
  treePosition: THREE.Vector3,
  treeRadius: number,
  buildingBbox: THREE.Box3,
  roadMeshes: THREE.Object3D[],
  otherBuildingBboxes: THREE.Box3[]
): boolean {
  // Create a bounding box for the tree base (cylinder around the trunk)
  const treeBbox = new THREE.Box3(
    new THREE.Vector3(
      treePosition.x - treeRadius,
      treePosition.y,
      treePosition.z - treeRadius
    ),
    new THREE.Vector3(
      treePosition.x + treeRadius,
      treePosition.y + treeRadius * 2,
      treePosition.z + treeRadius
    )
  );

  // Check collision with the main building
  if (treeBbox.intersectsBox(buildingBbox)) {
    return true;
  }

  // Check collision with other buildings
  for (const bbox of otherBuildingBboxes) {
    if (treeBbox.intersectsBox(bbox)) {
      return true;
    }
  }

  // Check collision with roads
  for (const roadMesh of roadMeshes) {
    if (roadMesh instanceof THREE.Mesh || roadMesh instanceof THREE.Line) {
      const roadBbox = new THREE.Box3().setFromObject(roadMesh);
      // Expand road bbox significantly to keep trees away from roads
      // Use road width if available, otherwise use a default margin
      const roadWidth = roadMesh.userData.roadWidth || 20;
      const margin = Math.max(roadWidth * 0.5, 10); // At least half the road width or 10 units
      roadBbox.expandByScalar(margin);
      if (treeBbox.intersectsBox(roadBbox)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Render trees around a building and add them to the scene
 * Returns a group containing all tree meshes
 * @param buildingScale - Scale factor to apply to trees (matches building scale)
 * @param buildingModel - The building model to avoid collisions with
 * @param staticGeometry - Group containing roads and other static objects to avoid
 * @param otherBuildings - Other building models to check for collisions
 */
export function renderTreesAroundBuilding(
  buildingPosition: { x: number; y: number; z: number },
  buildingWidth: number,
  buildingDepth: number,
  config: TreeConfig,
  scene: THREE.Object3D,
  buildingScale: number = 1,
  buildingModel?: THREE.Object3D,
  staticGeometry?: THREE.Object3D,
  otherBuildings?: THREE.Object3D[]
): THREE.Group {
  const treeGroup = new THREE.Group();
  treeGroup.name = 'building-trees';

  const treeInstances = generateTreesAroundBuilding(
    buildingPosition,
    buildingWidth,
    buildingDepth,
    config
  );

  // Get building bounding box for collision detection
  let buildingBbox = new THREE.Box3();
  if (buildingModel) {
    buildingBbox = new THREE.Box3().setFromObject(buildingModel);
    // Expand slightly to give some margin
    buildingBbox.expandByScalar(2);
  } else {
    // Fallback: create bbox from position and dimensions
    buildingBbox = new THREE.Box3(
      new THREE.Vector3(
        buildingPosition.x - buildingWidth / 2,
        buildingPosition.y,
        buildingPosition.z - buildingDepth / 2
      ),
      new THREE.Vector3(
        buildingPosition.x + buildingWidth / 2,
        buildingPosition.y + 50, // Assume some height
        buildingPosition.z + buildingDepth / 2
      )
    );
  }

  // Collect road meshes for collision detection
  const roadMeshes: THREE.Object3D[] = [];
  if (staticGeometry) {
    staticGeometry.traverse((child) => {
      // Check if this is a road using multiple detection methods
      const isRoad =
        child.name.includes('road') ||
        child.userData.isRoad ||
        (child instanceof THREE.Line) ||
        // Check for road-like meshes (flat, dark colored, at ground level)
        (child instanceof THREE.Mesh && (
          child.geometry instanceof THREE.PlaneGeometry ||
          child.geometry instanceof THREE.BufferGeometry
        ) && isRoadMaterial(child));

      if (isRoad) {
        roadMeshes.push(child);
      }
    });
  }

  // Collect other building bounding boxes
  const otherBuildingBboxes: THREE.Box3[] = [];
  if (otherBuildings) {
    for (const building of otherBuildings) {
      const bbox = new THREE.Box3().setFromObject(building);
      bbox.expandByScalar(2); // Add margin
      otherBuildingBboxes.push(bbox);
    }
  }

  let addedCount = 0;
  let skippedCount = 0;

  treeInstances.forEach((instance, index) => {
    // Apply building scale to tree scale
    const treeScale = instance.scale * buildingScale;
    const treePosition = new THREE.Vector3(
      instance.position[0],
      instance.position[1],
      instance.position[2]
    );

    // Tree radius for collision (base of tree trunk, scaled)
    const treeRadius = 1.5 * treeScale;

    // Check for collisions
    if (checkTreeCollision(treePosition, treeRadius, buildingBbox, roadMeshes, otherBuildingBboxes)) {
      skippedCount++;
      return; // Skip this tree
    }

    const treeMesh = createTreeMesh(instance.type, treeScale, instance.rotation);
    treeMesh.position.copy(treePosition);
    treeMesh.name = `tree-${index}`;
    treeMesh.userData.isTree = true;

    // Enable shadows
    treeMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    treeGroup.add(treeMesh);
    addedCount++;
  });

  scene.add(treeGroup);
  console.log(`🌲 Rendered ${addedCount} trees around building (skipped ${skippedCount} due to collisions, scale: ${buildingScale})`);

  return treeGroup;
}

/**
 * Get default tree config for map placement
 * Trees are always enabled by default for placed buildings
 */
export function getDefaultTreeConfigForMap(): TreeConfig {
  return {
    ...DEFAULT_TREE_CONFIG,
    enabled: true,  // Always enabled for map placement
    density: 5,     // Good coverage around buildings
    radius: 12,     // Reasonable distance from building edge
    types: ['sugar-maple', 'northern-red-oak', 'white-spruce', 'paper-birch', 'eastern-white-pine'],
  };
}
