import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneWithSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

/**
 * Cached GLTF loader.
 *
 * Two layers of reuse:
 *
 *   1. `THREE.Cache` is enabled globally so the underlying `FileLoader`
 *      reuses the raw ArrayBuffer across loads of the same URL.
 *   2. We additionally cache the *parsed* GLTF result by URL so the GLB
 *      doesn't have to be re-parsed (parsing is the expensive step on the
 *      main thread). For each subsequent caller we hand back a deep clone of
 *      the scene so independent placements can be positioned, scaled, and
 *      animated without sharing references.
 *
 * Safety: clones are produced via `SkeletonUtils.clone` so skinned meshes
 * and bone hierarchies are correctly duplicated. Materials are reused
 * (Three.js handles this safely as long as callers don't mutate uniforms in
 * place — none of our code does).
 */

let cacheEnabled = false;
function ensureGlobalCache() {
  if (cacheEnabled) return;
  THREE.Cache.enabled = true;
  cacheEnabled = true;
}

interface CacheRecord {
  gltf: GLTF;
}

// URL -> parsed GLTF promise (deduplicates in-flight loads)
const inFlight = new Map<string, Promise<CacheRecord>>();
// URL -> parsed GLTF (settled cache)
const parsed = new Map<string, CacheRecord>();

// Module-scoped loader so all callers share the same FileLoader pool.
let sharedLoader: GLTFLoader | null = null;
function getLoader(): GLTFLoader {
  if (!sharedLoader) {
    ensureGlobalCache();
    sharedLoader = new GLTFLoader();
  }
  return sharedLoader;
}

/**
 * Load a GLB/glTF model with caching. Returns a *fresh clone* of the parsed
 * scene each call, so the caller can mutate it freely.
 */
export async function loadCachedGltfScene(url: string): Promise<THREE.Group> {
  const cached = parsed.get(url);
  if (cached) {
    return cloneScene(cached.gltf);
  }

  const existingPromise = inFlight.get(url);
  if (existingPromise) {
    const record = await existingPromise;
    return cloneScene(record.gltf);
  }

  const loader = getLoader();
  const loadPromise = new Promise<CacheRecord>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const record: CacheRecord = { gltf };
        parsed.set(url, record);
        inFlight.delete(url);
        resolve(record);
      },
      undefined,
      (err) => {
        inFlight.delete(url);
        reject(err);
      },
    );
  });
  inFlight.set(url, loadPromise);
  const record = await loadPromise;
  return cloneScene(record.gltf);
}

function cloneScene(gltf: GLTF): THREE.Group {
  // SkeletonUtils.clone handles SkinnedMesh + bones; for non-skinned scenes
  // it behaves identically to a deep .clone(true).
  return cloneWithSkeleton(gltf.scene) as THREE.Group;
}

/** Prefetch a URL into the cache (does not throw on network errors). */
export function prefetchGltf(url: string): void {
  if (parsed.has(url) || inFlight.has(url)) return;
  void loadCachedGltfScene(url).catch((err) => {
    console.warn(`[gltfCache] prefetch failed for ${url}:`, err);
  });
}

/** Inspect cache state. Exposed for tests; not part of the public runtime API. */
export function _gltfCacheStateForTests() {
  return {
    parsedCount: parsed.size,
    inFlightCount: inFlight.size,
    threeCacheEnabled: cacheEnabled,
  };
}

/** Clear the cache. For tests only. */
export function _resetGltfCacheForTests() {
  parsed.clear();
  inFlight.clear();
  if (cacheEnabled) THREE.Cache.clear();
}
