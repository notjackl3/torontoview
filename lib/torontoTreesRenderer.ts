/**
 * Toronto street-trees layer. Renders ~5-6k tree points downtown as two
 * InstancedMeshes (one trunk, one foliage) for one draw call each.
 *
 * Trunk diameter scales with DBH_TRUNK (cm). Foliage radius is a rough
 * function of DBH (mature city trees are ~10-20× their trunk diameter).
 */
import * as THREE from "three";
import { CityProjection } from "./projection";

interface TreeFeature {
  lng: number;
  lat: number;
  species: string;
  dbh: number; // cm
}

const TRUNK_COLOR = 0x5a3a22;
const FOLIAGE_COLOR = 0x356b2c;

// World scale factor — matches CityProjection.SCALE_FACTOR so the tree's
// real-world size is preserved.
const SCALE = 10 / 1.4;

export function renderTorontoTreesLayer(trees: TreeFeature[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "torontoTreesLayer";

  if (trees.length === 0) return group;

  // Shared per-tree geometry. Picked low-poly so 6k instances stay cheap.
  const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  trunkGeo.translate(0, 0.5, 0); // origin at base
  const foliageGeo = new THREE.SphereGeometry(1, 6, 5);

  const trunkMat = new THREE.MeshLambertMaterial({ color: TRUNK_COLOR });
  const foliageMat = new THREE.MeshLambertMaterial({ color: FOLIAGE_COLOR });

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const foliageMesh = new THREE.InstancedMesh(
    foliageGeo,
    foliageMat,
    trees.length
  );
  trunkMesh.userData.isTorontoTrees = true;
  foliageMesh.userData.isTorontoTrees = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();

  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const world = CityProjection.projectToWorld([tree.lng, tree.lat]);

    // Convert DBH (cm) to a sensible tree height (m): ~30× trunk diameter is
    // typical for mature street trees, capped at 20 m. Unknown DBH → 7 m.
    const dbhM = tree.dbh > 0 ? tree.dbh / 100 : 0.2;
    const treeHeightM = Math.min(Math.max(dbhM * 30, 4), 20);
    const trunkHeightM = treeHeightM * 0.5;
    const trunkRadiusM = Math.max(dbhM / 2, 0.05);
    const foliageRadiusM = Math.max(treeHeightM * 0.25, 1.5);
    const foliageCenterYm = trunkHeightM + foliageRadiusM * 0.6;

    // Trunk: scale (radius, height, radius) — apply world SCALE.
    v.set(world.x, 0, world.z);
    s.set(trunkRadiusM * SCALE, trunkHeightM * SCALE, trunkRadiusM * SCALE);
    m.compose(v, q, s);
    trunkMesh.setMatrixAt(i, m);

    // Foliage: positioned above trunk, scaled to foliage radius.
    v.set(world.x, foliageCenterYm * SCALE, world.z);
    s.set(
      foliageRadiusM * SCALE,
      foliageRadiusM * SCALE,
      foliageRadiusM * SCALE
    );
    m.compose(v, q, s);
    foliageMesh.setMatrixAt(i, m);
  }

  trunkMesh.instanceMatrix.needsUpdate = true;
  foliageMesh.instanceMatrix.needsUpdate = true;

  group.add(trunkMesh);
  group.add(foliageMesh);

  console.log(`✅ Toronto trees layer: ${trees.length} trees`);
  return group;
}

export async function loadAndRenderTorontoTreesLayer(): Promise<THREE.Group | null> {
  try {
    const res = await fetch("/map-data/trees.json", { cache: "force-cache" });
    if (!res.ok) {
      console.warn("Trees fetch failed:", res.status);
      return null;
    }
    const trees = (await res.json()) as TreeFeature[];
    return renderTorontoTreesLayer(trees);
  } catch (err) {
    console.error("Trees layer load error:", err);
    return null;
  }
}
