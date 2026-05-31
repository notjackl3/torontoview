import * as THREE from "three";
import { getTheme, type MapStyle } from "./mapTheme";

/**
 * Fetches a static map image for a bounding box. Mapbox is preferred because
 * its Static Images API can legally be used as a rendered map surface when a
 * project token is configured. OSM is a no-token fallback for local demos.
 */
export async function fetchSatelliteImagery(
  bbox: [number, number, number, number],
  mapStyle: MapStyle = "satellite",
): Promise<string | null> {
  const [south, west, north, east] = bbox;

  const latRad = ((south + north) / 2) * (Math.PI / 180);
  const lngSpan = (east - west) * Math.cos(latRad);
  const latSpan = north - south;
  const aspect = lngSpan / latSpan;
  const maxDim = 1280;
  const width = aspect >= 1 ? maxDim : Math.round(maxDim * aspect);
  const height = aspect >= 1 ? Math.round(maxDim / aspect) : maxDim;

  const mapboxToken =
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (mapboxToken) {
    const style =
      mapStyle === "light" ? "light-v11" : "satellite-streets-v12";
    return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/[${west},${south},${east},${north}]/${width}x${height}@2x?access_token=${mapboxToken}`;
  }

  try {
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const zoom = Math.floor(Math.log2(360 / (north - south))) - 1;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik`;
  } catch (error) {
    console.warn("OSM static map URL generation failed", error);
  }

  return null;
}

/**
 * Applies a base for the ground plane.
 *
 * For "satellite" we fetch a real Mapbox/OSM static image. For "light" we
 * intentionally skip the texture: the Apple-Maps look comes from our own
 * colored 3D layers (roads, parks, water) rendered on a clean cream slab —
 * laying a separate Mapbox raster underneath would double-paint roads and
 * tint the cream gray.
 */
export async function applyGroundImagery(
  groundGroup: THREE.Group,
  bbox: [number, number, number, number],
  mapStyle: MapStyle = "satellite",
): Promise<boolean> {
  const plane = groundGroup.getObjectByName("ground-plane");
  if (!(plane instanceof THREE.Mesh)) return false;
  const material = plane.material as THREE.MeshStandardMaterial;
  const palette = getTheme(mapStyle);

  if (mapStyle === "light") {
    if (material.map) {
      material.map.dispose();
      material.map = null;
    }
    material.color.setHex(palette.ground);
    material.roughness = 1.0;
    material.needsUpdate = true;
    plane.userData.hasMapImagery = false;
    plane.userData.mapStyle = mapStyle;
    return true;
  }

  const imageUrl = await fetchSatelliteImagery(bbox, mapStyle);
  if (!imageUrl) return false;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");

  try {
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(imageUrl, resolve, undefined, reject);
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    if (material.map) material.map.dispose();
    material.map = texture;
    material.color.setHex(0xffffff);
    material.roughness = 1.0;
    material.needsUpdate = true;
    plane.userData.hasMapImagery = true;
    plane.userData.mapStyle = mapStyle;
    return true;
  } catch (error) {
    console.warn("Failed to apply ground imagery texture", error);
    return false;
  }
}

type Bbox = { minLat: number; maxLat: number; minLng: number; maxLng: number };

export interface CreateGroundOptions {
  /**
   * Inner region (typically the 3D-model bbox). Pixels outside this region are
   * desaturated and darkened with a soft edge so that surrounding context reads
   * as background. Omit to render the full plane at full brightness.
   */
  innerBbox?: Bbox;
  /** Width of the soft transition in UV space (0..1). Default 0.04. */
  featherUV?: number;
  /** Multiplier on outside luminance. 1 = unchanged, 0 = black. Default 0.4. */
  outsideDarken?: number;
  /** Saturation outside. 1 = full color, 0 = grayscale. Default 0.25. */
  outsideSaturation?: number;
  /**
   * Soft alpha-fade applied along the plane's outer edges so the ground
   * doesn't read as a hard rectangular cut-off against the sky. Value is
   * the fade width in UV space (0..1): 0 disables, 0.15 means the outer
   * 15 % of the plane fades from full opacity at the inner boundary to
   * fully transparent at the edge. Default 0 (disabled) — turning the fade
   * on forces the ground material to `transparent: true`, which puts it in
   * the transparent render pass *after* opaque parks/water and ends up
   * drawing on top of them. Opt in explicitly if you need the fade.
   */
  edgeFadeUV?: number;
}

/**
 * Creates a single ground plane covering the specified bounding box.
 */
export function createGround(
  bbox: Bbox,
  projection: { projectToWorld: (coord: [number, number]) => THREE.Vector3 },
  options: CreateGroundOptions = {},
  mapStyle: MapStyle = "satellite",
): THREE.Group {
  const group = new THREE.Group();

  const topLeft = projection.projectToWorld([bbox.minLng, bbox.maxLat]);
  const bottomRight = projection.projectToWorld([bbox.maxLng, bbox.minLat]);
  const width = Math.abs(bottomRight.x - topLeft.x);
  const depth = Math.abs(bottomRight.z - topLeft.z);
  const centerX = (topLeft.x + bottomRight.x) / 2;
  const centerZ = (topLeft.z + bottomRight.z) / 2;

  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: getTheme(mapStyle).ground,
    roughness: 1.0,
    metalness: 0.0,
  });

  const edgeFadeUV = options.edgeFadeUV ?? 0;
  const wantEdgeFade = edgeFadeUV > 0;
  const wantInnerFeather = !!options.innerBbox;

  if (wantInnerFeather || wantEdgeFade) {
    const inner = options.innerBbox;
    const innerUMin = inner
      ? (inner.minLng - bbox.minLng) / (bbox.maxLng - bbox.minLng)
      : 0;
    const innerUMax = inner
      ? (inner.maxLng - bbox.minLng) / (bbox.maxLng - bbox.minLng)
      : 1;
    const innerVMin = inner
      ? (inner.minLat - bbox.minLat) / (bbox.maxLat - bbox.minLat)
      : 0;
    const innerVMax = inner
      ? (inner.maxLat - bbox.minLat) / (bbox.maxLat - bbox.minLat)
      : 1;

    const featherUV = options.featherUV ?? 0.04;
    const outsideDarken = options.outsideDarken ?? 0.4;
    const outsideSaturation = options.outsideSaturation ?? 0.25;

    // Plane half-extents in local geometry units, used by the edge-fade
    // shader. PlaneGeometry creates vertices in (x, y, 0) with x in
    // [-width/2, width/2] and y in [-depth/2, depth/2]; rotateX(-π/2)
    // remaps that to (x, 0, -y) — so local position.x and position.z
    // sweep over the plane regardless of whether USE_UV is enabled.
    const halfExtent = new THREE.Vector2(width / 2, depth / 2);

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uInnerMin = { value: new THREE.Vector2(innerUMin, innerVMin) };
      shader.uniforms.uInnerMax = { value: new THREE.Vector2(innerUMax, innerVMax) };
      shader.uniforms.uFeather = { value: featherUV };
      shader.uniforms.uOutsideDarken = { value: outsideDarken };
      shader.uniforms.uOutsideSat = { value: outsideSaturation };
      shader.uniforms.uEdgeFade = { value: edgeFadeUV };
      shader.uniforms.uUseInner = { value: wantInnerFeather ? 1.0 : 0.0 };
      shader.uniforms.uPlaneHalf = { value: halfExtent };

      // Pipe local-space position from vertex to fragment so we can
      // compute the distance to the plane edge without depending on the
      // optional `uv` attribute (which Three only injects when USE_UV is
      // defined).
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
            varying vec2 vGroundLocal;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
            vGroundLocal = vec2(position.x, position.z);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
            uniform vec2 uInnerMin;
            uniform vec2 uInnerMax;
            uniform float uFeather;
            uniform float uOutsideDarken;
            uniform float uOutsideSat;
            uniform float uEdgeFade;
            uniform float uUseInner;
            uniform vec2 uPlaneHalf;
            varying vec2 vGroundLocal;`,
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
            // Inner-bbox darken/desaturate uses the basemap texture's UV
            // when available — that's still authoritative for which
            // pixels are "inside the data" — but falls through silently
            // if no texture is bound yet.
            #ifdef USE_MAP
            if (uUseInner > 0.5) {
              vec2 dOut = max(uInnerMin - vMapUv, vMapUv - uInnerMax);
              float outside = clamp(max(dOut.x, dOut.y) / max(uFeather, 1e-4), 0.0, 1.0);
              outside = smoothstep(0.0, 1.0, outside);
              float gray = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              vec3 desat = mix(vec3(gray), diffuseColor.rgb, uOutsideSat);
              vec3 outCol = desat * uOutsideDarken;
              diffuseColor.rgb = mix(diffuseColor.rgb, outCol, outside);
            }
            #endif
            // Soft alpha fade along the outer edges of the plane. We map
            // local position into [0,1] across the plane and smoothstep
            // the last uEdgeFade band so the ground melts into the sky
            // instead of ending in a rectangular cut-off. Fragments below
            // a tiny threshold are discarded so they neither write depth
            // nor contribute to fog, leaving the sky to read cleanly
            // through the faded margin.
            if (uEdgeFade > 0.0) {
              vec2 norm = clamp(vGroundLocal / max(uPlaneHalf, vec2(1e-4)), vec2(-1.0), vec2(1.0));
              vec2 dEdge = vec2(1.0) - abs(norm); // 1 = center, 0 = edge
              float nearest = min(dEdge.x, dEdge.y) * 0.5; // remap to [0, 0.5]
              float edgeAlpha = smoothstep(0.0, uEdgeFade, nearest);
              if (edgeAlpha < 0.01) discard;
              diffuseColor.a *= edgeAlpha;
            }`,
        );
    };

    if (wantEdgeFade) {
      // Transparent so the outer band can blend out, but we still write
      // depth so buildings/roads at the boundary aren't double-drawn
      // against the sky behind them.
      material.transparent = true;
      material.depthWrite = true;
    }
  }

  const plane = new THREE.Mesh(geometry, material);
  plane.position.set(centerX, 0, centerZ);
  plane.receiveShadow = true;
  plane.name = "ground-plane";
  // Render the ground first so the transparent edge blends against the
  // sky dome (drawn earlier) rather than over later-drawn transparents.
  plane.renderOrder = -10;
  group.add(plane);

  return group;
}

export function createSky(mapStyle: MapStyle = "satellite"): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(45000, 32, 32);
  const palette = getTheme(mapStyle);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(palette.sky.top) },
      bottomColor: { value: new THREE.Color(palette.sky.bottom) },
    },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        float t = max(pow(max(h, 0.0), 0.6), 0.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        #include <logdepthbuf_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });

  return new THREE.Mesh(geometry, material);
}

export function createCelestialBodies(): { sun: THREE.Mesh; moon: THREE.Mesh } {
  const sunGeo = new THREE.CircleGeometry(800, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.name = "celestial-sun";

  const glowGeo = new THREE.RingGeometry(800, 1600, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  sun.add(new THREE.Mesh(glowGeo, glowMat));

  const moonGeo = new THREE.CircleGeometry(500, 32);
  const moonMat = new THREE.MeshBasicMaterial({
    color: 0xddeeff,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.name = "celestial-moon";

  return { sun, moon };
}

export function setupFog(
  scene: THREE.Scene,
  mapStyle: MapStyle = "satellite",
): void {
  scene.fog = new THREE.FogExp2(getTheme(mapStyle).fog, 0.0000022);
}

/**
 * Re-applies the palette to ground, sky, and fog when the user toggles base
 * style without rebuilding the scene. Called from ThreeMap's mapStyle effect.
 */
export function applyThemeToEnvironment(
  scene: THREE.Scene,
  groundGroup: THREE.Group | null,
  sky: THREE.Mesh | null,
  mapStyle: MapStyle,
): void {
  const palette = getTheme(mapStyle);

  if (scene.fog instanceof THREE.FogExp2 || scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(palette.fog);
  }

  if (sky && sky.material instanceof THREE.ShaderMaterial) {
    const u = sky.material.uniforms as Record<string, { value: THREE.Color }>;
    if (u.topColor) u.topColor.value.setHex(palette.sky.top);
    if (u.bottomColor) u.bottomColor.value.setHex(palette.sky.bottom);
  }

  if (groundGroup) {
    const plane = groundGroup.getObjectByName("ground-plane");
    if (plane instanceof THREE.Mesh) {
      const mat = plane.material as THREE.MeshStandardMaterial;
      // In light mode we always show the cream slab. In satellite mode we
      // restore white tint so the texture (if any) reads at full color; if no
      // texture is loaded the existing color is fine.
      if (mapStyle === "light") {
        mat.color.setHex(palette.ground);
      } else if (plane.userData.hasMapImagery) {
        mat.color.setHex(0xffffff);
      } else {
        mat.color.setHex(palette.ground);
      }
      mat.needsUpdate = true;
    }
  }
}

export function setupShadows(
  renderer: THREE.WebGLRenderer,
  light: THREE.DirectionalLight,
): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  light.castShadow = true;

  const shadowSize = 2000;
  light.shadow.camera.left = -shadowSize;
  light.shadow.camera.right = shadowSize;
  light.shadow.camera.top = shadowSize;
  light.shadow.camera.bottom = -shadowSize;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 5000;

  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;
  light.shadow.bias = -0.0001;
}
