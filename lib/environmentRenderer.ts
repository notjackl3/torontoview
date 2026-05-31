import * as THREE from "three";

/**
 * Fetches map imagery for a bounding box from OSM-based sources
 * Uses the same data source as buildings/roads for perfect alignment
 * @param bbox - [south, west, north, east] bounding box
 * @returns Promise resolving to map image URL or null
 */
export async function fetchSatelliteImagery(
  bbox: [number, number, number, number],
  mapStyle: "satellite" | "light" = "satellite",
): Promise<string | null> {
  const [south, west, north, east] = bbox;

  // Calculate image dimensions that match the bbox aspect ratio
  // so the image maps 1:1 onto the plane without distortion
  const latRad = ((south + north) / 2) * (Math.PI / 180);
  const lngSpan = (east - west) * Math.cos(latRad); // adjusted for latitude
  const latSpan = north - south;
  const aspect = lngSpan / latSpan;
  const maxDim = 1280;
  const width = aspect >= 1 ? maxDim : Math.round(maxDim * aspect);
  const height = aspect >= 1 ? Math.round(maxDim / aspect) : maxDim;

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (mapboxToken) {
    const styles = mapStyle === "light"
      ? ["streets-v12"]
      : ["satellite-v9", "satellite-streets-v12"];
    for (const style of styles) {
      try {
        const url = `https://api.mapbox.com/styles/v1/mapbox/${style}/static/[${west},${south},${east},${north}]/${width}x${height}@2x?access_token=${mapboxToken}`;
        const res = await fetch(url, { method: "HEAD" });
        if (res.ok) {
          console.log(`✅ Mapbox ${style} imagery ready`);
          return url;
        }
      } catch (error) {
        console.warn(`Mapbox ${style} failed`, error);
      }
    }
  }

  // Fallback: OpenStreetMap static map
  try {
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;
    const zoom = Math.floor(Math.log2(360 / (north - south))) - 1;
    const osmUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=${zoom}&size=${width}x${height}&maptype=mapnik`;
    console.log("✅ OSM static map URL generated");
    return osmUrl;
  } catch (error) {
    console.warn("OSM static map failed", error);
  }

  return null;
}

/**
 * Creates a grid of ground planes covering the specified bounding box.
 * Each cell gets its own satellite texture for high resolution.
 *
 * @param bbox - Bounding box defining the area to cover
 * @param projection - CityProjection class for coordinate conversion
 * @param gridSize - Number of tiles per axis (e.g. 4 → 4x4 = 16 tiles)
 * @returns Ground group with named children "ground-tile-{row}-{col}"
 */
export function createGround(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  projection: { projectToWorld: (coord: [number, number]) => THREE.Vector3 },
  gridSize: number = 4,
): THREE.Group {
  void gridSize; // kept for backwards-compat with callers
  const group = new THREE.Group();

  // Single flat plane in a neutral planning-map tone. No polygonOffset (no
  // co-planar geometry sits on it — parks/water/roads are stacked at distinct
  // Y heights), no transparency. Keeps the surface clean and the GPU happy.
  const topLeft = projection.projectToWorld([bbox.minLng, bbox.maxLat]);
  const bottomRight = projection.projectToWorld([bbox.maxLng, bbox.minLat]);
  const width = Math.abs(bottomRight.x - topLeft.x);
  const depth = Math.abs(bottomRight.z - topLeft.z);
  const centerX = (topLeft.x + bottomRight.x) / 2;
  const centerZ = (topLeft.z + bottomRight.z) / 2;

  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.MeshStandardMaterial({
    color: 0xe8e4dd, // warm neutral — planning-map / architect's plan tone
    roughness: 1.0,
    metalness: 0.0,
  });

  const plane = new THREE.Mesh(geometry, material);
  plane.position.set(centerX, 0, centerZ);
  plane.receiveShadow = true;
  plane.name = "ground-plane";
  group.add(plane);

  return group;
}

/**
 * Creates a sky dome with gradient shader
 * @returns Sky mesh
 */
export function createSky(): THREE.Mesh {
  // Full sphere so it covers every angle — no edge clipping when orbiting
  const geometry = new THREE.SphereGeometry(45000, 32, 32);

  // Gradient shader: topColor at zenith, bottomColor at horizon and below
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x0077ff) },
      bottomColor: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition).y;
        // Above horizon: gradient from bottom→top. Below horizon: solid bottomColor.
        float t = max(pow(max(h, 0.0), 0.6), 0.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });

  const sky = new THREE.Mesh(geometry, material);
  return sky;
}

/**
 * Creates sun and moon sprites that follow solar position
 * @returns Object with sun and moon meshes
 */
export function createCelestialBodies(): { sun: THREE.Mesh; moon: THREE.Mesh } {
  // Sun — glowing disc
  const sunGeo = new THREE.CircleGeometry(800, 32);
  const sunMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.name = "celestial-sun";

  // Glow ring around sun
  const glowGeo = new THREE.RingGeometry(800, 1600, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.15,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  sun.add(glow);

  // Moon — smaller, white-blue disc
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

/**
 * Adds exponential fog to the scene for atmospheric depth
 * @param scene - Three.js scene to add fog to
 */
export function setupFog(scene: THREE.Scene): void {
  // Light blue-gray fog for atmospheric effect
  scene.fog = new THREE.FogExp2(0xccccff, 0.0015);
}

/**
 * Configures shadow settings for the renderer and light
 * @param renderer - Three.js WebGL renderer
 * @param light - Directional light for shadows
 */
export function setupShadows(
  renderer: THREE.WebGLRenderer,
  light: THREE.DirectionalLight,
): void {
  // Enable shadow mapping on renderer
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft shadows for better quality

  // Configure directional light for shadows
  light.castShadow = true;

  // Set up shadow camera bounds
  const shadowSize = 2000;
  light.shadow.camera.left = -shadowSize;
  light.shadow.camera.right = shadowSize;
  light.shadow.camera.top = shadowSize;
  light.shadow.camera.bottom = -shadowSize;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 5000;

  // Shadow map resolution
  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;

  // Shadow bias to reduce artifacts
  light.shadow.bias = -0.0001;
}
