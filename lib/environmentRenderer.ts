import * as THREE from "three";

/**
 * Fetches a static map image for a bounding box. Mapbox is preferred because
 * its Static Images API can legally be used as a rendered map surface when a
 * project token is configured. OSM is a no-token fallback for local demos.
 */
export async function fetchSatelliteImagery(
  bbox: [number, number, number, number],
  mapStyle: "satellite" | "light" = "satellite",
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

export async function applyGroundImagery(
  groundGroup: THREE.Group,
  bbox: [number, number, number, number],
  mapStyle: "satellite" | "light" = "satellite",
): Promise<boolean> {
  const imageUrl = await fetchSatelliteImagery(bbox, mapStyle);
  const plane = groundGroup.getObjectByName("ground-plane");
  if (!imageUrl || !(plane instanceof THREE.Mesh)) return false;

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");

  try {
    const texture = await new Promise<THREE.Texture>((resolve, reject) => {
      loader.load(imageUrl, resolve, undefined, reject);
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;

    const material = plane.material as THREE.MeshStandardMaterial;
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

/**
 * Creates a single ground plane covering the specified bounding box.
 */
export function createGround(
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  projection: { projectToWorld: (coord: [number, number]) => THREE.Vector3 },
  gridSize: number = 4,
): THREE.Group {
  void gridSize;
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
    color: 0xe8e4dd,
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

export function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(45000, 32, 32);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x66b8ff) },
      bottomColor: { value: new THREE.Color(0xf8fcff) },
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
        float t = max(pow(max(h, 0.0), 0.6), 0.0);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
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

export function setupFog(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(0xeaf6ff, 0.000004);
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
