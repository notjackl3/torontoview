/**
 * Toronto street-trees layer. Renders ~5-6k tree points downtown from the
 * City of Toronto Open Data "Street Tree Data" dataset (open.toronto.ca).
 *
 * Each tree carries (lng, lat, COMMON_NAME, DBH_TRUNK). We bucket by species
 * family (conifer / columnar / flowering / broadleaf) and emit one trunk +
 * one foliage InstancedMesh per bucket, so the whole layer stays at 8 draw
 * calls regardless of tree count. Trunk size scales with DBH.
 */
import * as THREE from "three";
import { CityProjection } from "./projection";

interface TreeFeature {
  lng: number;
  lat: number;
  species: string;
  dbh: number; // cm
}

type SpeciesFamily = "conifer" | "columnar" | "flowering" | "broadleaf";

interface FamilyStyle {
  trunkColor: number;
  foliageColor: number;
  foliageEmissive: number;
  /** Foliage geometry — instanced once per family. */
  foliageGeo: THREE.BufferGeometry;
  /** Per-tree foliage radius multiplier (relative to broadleaf default). */
  foliageScale: number;
  /** Aspect ratio of the foliage crown (vertical / horizontal). */
  crownAspect: number;
}

const SCALE = 10 / 1.4;

function classify(species: string): SpeciesFamily {
  const s = species.replace(/^"|"$/g, "").toLowerCase();
  if (/pine|spruce|cedar|fir|hemlock|yew|juniper|larch/.test(s)) return "conifer";
  if (/columnar|fastigiate|poplar/.test(s)) return "columnar";
  if (
    /cherry|magnolia|crabapple|dogwood|redbud|hawthorn|pear|apple|plum|lilac|serviceberry/.test(
      s,
    )
  ) {
    return "flowering";
  }
  return "broadleaf";
}

function makeStyles(): Record<SpeciesFamily, FamilyStyle> {
  // Low-poly geos so 6k instances stay cheap.
  const sphere = new THREE.SphereGeometry(1, 6, 5);
  const cone = new THREE.ConeGeometry(1, 1, 6);
  cone.translate(0, 0.5, 0); // origin at base of cone, point at +Y
  const tallSphere = new THREE.SphereGeometry(1, 6, 5);
  const flowerSphere = new THREE.SphereGeometry(1, 6, 5);

  return {
    broadleaf: {
      trunkColor: 0x7a4f2e,
      foliageColor: 0x4f9a3a,
      foliageEmissive: 0x2f6f2f,
      foliageGeo: sphere,
      foliageScale: 1.0,
      crownAspect: 1.0,
    },
    conifer: {
      trunkColor: 0x6b3f24,
      foliageColor: 0x2c5e3a,
      foliageEmissive: 0x1a4025,
      foliageGeo: cone,
      foliageScale: 0.9,
      crownAspect: 2.4, // tall narrow cone
    },
    columnar: {
      trunkColor: 0x7a4f2e,
      foliageColor: 0x3d7d3a,
      foliageEmissive: 0x2a5a2a,
      foliageGeo: tallSphere,
      foliageScale: 0.55,
      crownAspect: 3.0, // tall narrow ellipsoid
    },
    flowering: {
      trunkColor: 0x8b5a3c,
      foliageColor: 0xe8a8c8, // soft pink crown
      foliageEmissive: 0xa05c7a,
      foliageGeo: flowerSphere,
      foliageScale: 0.75,
      crownAspect: 0.85, // squat rounded crown
    },
  };
}

export function renderTorontoTreesLayer(trees: TreeFeature[]): THREE.Group {
  const group = new THREE.Group();
  group.name = "torontoTreesLayer";

  if (trees.length === 0) return group;

  // Bucket trees by species family.
  const buckets: Record<SpeciesFamily, TreeFeature[]> = {
    broadleaf: [],
    conifer: [],
    columnar: [],
    flowering: [],
  };
  for (const tree of trees) buckets[classify(tree.species)].push(tree);

  const styles = makeStyles();
  const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  trunkGeo.translate(0, 0.5, 0);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  // Trees sit on the ground. With the renderer's logarithmic depth buffer
  // (see sceneManager) we no longer need a huge lift to dodge z-fighting at
  // the overhead view — a 0.5-unit lift keeps the trunk base just above any
  // ground texture without making trees look airborne at close zoom.
  const BASE_LIFT = 0.5;

  for (const family of Object.keys(buckets) as SpeciesFamily[]) {
    const list = buckets[family];
    if (list.length === 0) continue;
    const style = styles[family];

    const trunkMat = new THREE.MeshPhongMaterial({
      color: style.trunkColor,
      emissive: new THREE.Color(style.trunkColor),
      emissiveIntensity: 0.18,
      shininess: 8,
    });
    const foliageMat = new THREE.MeshPhongMaterial({
      color: style.foliageColor,
      emissive: new THREE.Color(style.foliageEmissive),
      emissiveIntensity: 0.28,
      shininess: 10,
    });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    const foliageMesh = new THREE.InstancedMesh(
      style.foliageGeo,
      foliageMat,
      list.length,
    );
    trunkMesh.userData.isTorontoTrees = true;
    foliageMesh.userData.isTorontoTrees = true;
    trunkMesh.name = `trees-${family}-trunk`;
    foliageMesh.name = `trees-${family}-foliage`;

    for (let i = 0; i < list.length; i++) {
      const tree = list[i];
      const world = CityProjection.projectToWorld([tree.lng, tree.lat]);

      // DBH (cm) → tree height (m). ~30× trunk diameter is typical for mature
      // street trees; clamp to a sensible window so missing DBH still renders.
      const dbhM = tree.dbh > 0 ? tree.dbh / 100 : 0.2;
      const treeHeightM = Math.min(Math.max(dbhM * 30, 4), 20);
      const trunkHeightM = treeHeightM * 0.5;
      const trunkRadiusM = Math.max(dbhM / 2, 0.05);

      const baseFoliageR = Math.max(treeHeightM * 0.25, 1.5);
      const foliageRadiusM = baseFoliageR * style.foliageScale;
      const foliageHeightM = foliageRadiusM * style.crownAspect;
      const foliageCenterYm =
        family === "conifer"
          ? trunkHeightM // cone sits on top of trunk (origin = cone base)
          : trunkHeightM + foliageHeightM * 0.5;

      v.set(world.x, BASE_LIFT, world.z);
      s.set(trunkRadiusM * SCALE, trunkHeightM * SCALE, trunkRadiusM * SCALE);
      m.compose(v, q, s);
      trunkMesh.setMatrixAt(i, m);

      v.set(world.x, foliageCenterYm * SCALE + BASE_LIFT, world.z);
      s.set(
        foliageRadiusM * SCALE,
        foliageHeightM * SCALE,
        foliageRadiusM * SCALE,
      );
      m.compose(v, q, s);
      foliageMesh.setMatrixAt(i, m);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    foliageMesh.instanceMatrix.needsUpdate = true;
    group.add(trunkMesh);
    group.add(foliageMesh);
  }

  console.log(
    `✅ Toronto trees layer: ${trees.length} trees ` +
      `(broadleaf ${buckets.broadleaf.length}, conifer ${buckets.conifer.length}, ` +
      `columnar ${buckets.columnar.length}, flowering ${buckets.flowering.length})`,
  );
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
