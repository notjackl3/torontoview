/**
 * Toronto waterbodies + watercourses layer. Reads pre-filtered local data
 * written by scripts/import-toronto-layers.ts; for the downtown bbox this is
 * mainly the Lake Ontario shoreline arc plus a couple of inland ponds.
 *
 * Lake Ontario's polygon is the entire lake (~thousands of vertices). To
 * keep the mesh tiny we clip it to an extended bbox around downtown before
 * triangulating.
 */
import * as THREE from "three";
import { CityProjection } from "./projection";
import { getTheme, type MapStyle } from "./mapTheme";

type Ring = [number, number][];

interface WaterbodyFeature {
  id: number;
  name: string;
  polygons: Ring[][];
}

interface WatercourseFeature {
  id: number;
  name: string;
  line: [number, number][];
}

// -----------------------------------------------------------------------------
// Low-poly water shaders.
//
// Vertex shader displaces each tessellated vertex by a sum of three sine waves
// keyed off world XZ — the same wave function used everywhere, so neighbouring
// meshes line up seamlessly across polygon edges.
//
// Fragment shader computes a flat per-triangle normal from screen-space
// derivatives, then quantizes the lighting into a few bands for a clean
// cartoon look.
// -----------------------------------------------------------------------------

const WATER_VERTEX_SHADER = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uTime;
  varying vec3 vWorldPos;

  // Gerstner wave: shifts each vertex along the wave direction and lifts it
  // by sin(phase). The horizontal pull bunches vertices near crests, which
  // sharpens peaks and broadens troughs — the classic stylized wave look.
  // Phase = dir·base * k + t*omega, so crests travel coherently across the
  // whole surface at speed omega/k. Because every mesh evaluates the SAME
  // wave function on its world-XZ input, the surface stays connected across
  // polygon boundaries.
  void gerstner(
    in vec2 dir, in float k, in float omega, in float amp, in float steep,
    in vec2 base, in float t, inout vec3 p
  ) {
    float phase = dot(dir, base) * k + t * omega;
    float c = cos(phase);
    float s = sin(phase);
    p.x -= dir.x * steep * amp * c;
    p.z -= dir.y * steep * amp * c;
    p.y += amp * s;
  }

  void main() {
    vec3 pos = position;
    // Local XZ == world XZ here (mesh has only a Y translation, no XZ shift).
    vec2 base = pos.xz;
    float t = uTime;

    // Six wave layers with incommensurate frequencies and unaligned directions
    // so the combined surface never visibly repeats. Three primaries carry the
    // bulk amplitude; three secondaries break up the periodicity.
    gerstner(normalize(vec2( 1.00,  0.40)), 0.00240, 1.00, 62.0, 0.70, base, t, pos);
    gerstner(normalize(vec2(-0.40,  1.00)), 0.00180, 0.80, 46.0, 0.60, base, t, pos);
    gerstner(normalize(vec2( 0.70, -0.50)), 0.00400, 1.40, 22.0, 0.30, base, t, pos);
    gerstner(normalize(vec2(-0.85,  0.30)), 0.00113, 0.47, 16.0, 0.30, base, t, pos);
    gerstner(normalize(vec2( 0.55,  0.90)), 0.00157, 0.63, 11.0, 0.25, base, t, pos);
    gerstner(normalize(vec2( 0.95, -0.15)), 0.00301, 1.13,  7.0, 0.20, base, t, pos);

    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
    // Log-depth correction — required because the renderer uses
    // logarithmicDepthBuffer:true. Without this the fragment's z is computed
    // from a linear gl_Position.z while the depth test compares log-z values,
    // and the water plane gets clipped or hidden behind the ground.
    #include <logdepthbuf_vertex>
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uShallow;
  uniform vec3 uMid;
  uniform vec3 uDeep;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uOpacity;
  varying vec3 vWorldPos;

  void main() {
    // Flat per-triangle normal from screen-space derivatives. Each triangle
    // gets one normal → one shading value → one solid color band.
    vec3 dx = dFdx(vWorldPos);
    vec3 dy = dFdy(vWorldPos);
    vec3 normal = normalize(cross(dy, dx));
    if (normal.y < 0.0) normal = -normal;

    vec3 sunDir = normalize(uSunDir);
    float aboveHorizon = smoothstep(0.0, 0.15, sunDir.y);
    float ndotl = max(dot(normal, sunDir), 0.0);

    // Banding is keyed off the DELTA from the baseline ndotl that a flat
    // (horizontal) facet would have. That way the bands work no matter how
    // high the sun is — facets tilted toward the sun trigger LIT, facets
    // tilted away trigger DEEP, untilted stay MID. Without this the absolute
    // ndotl of every facet stays close to sunDir.y and they all share a band.
    float baseLight = sunDir.y;
    float delta = ndotl - baseLight;
    float lit = smoothstep(0.010, 0.025, delta);
    float dim = smoothstep(0.010, 0.025, -delta);

    vec3 col = uMid;
    col = mix(col, uShallow, lit);
    col = mix(col, uDeep, dim);

    // Very faint warm tint on the lit band — the palette itself carries the
    // band differentiation; this just keeps the highlights from looking inert.
    col = mix(col, uSunColor, lit * 0.05 * aboveHorizon);

    // If the sun is below the horizon, collapse to mid-blue so the surface
    // doesn't go pitch black.
    col = mix(uMid * 0.7, col, aboveHorizon);

    gl_FragColor = vec4(col, uOpacity);
    // Write the correct log-depth value so the depth test sees this fragment
    // at its true world-space depth (paired with logdepthbuf_pars_vertex).
    #include <logdepthbuf_fragment>
  }
`;

function createWaterMaterial(mapStyle: MapStyle = "satellite"): THREE.ShaderMaterial {
  const palette = getTheme(mapStyle).water;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      // Near-monochromatic surface color. Each band differs from its neighbour
      // by only a few RGB units so adjacent facets barely contrast — enough to
      // see motion, not enough to look like a tile pattern.
      uShallow: { value: new THREE.Color(palette.shallow) },
      uMid: { value: new THREE.Color(palette.mid) },
      uDeep: { value: new THREE.Color(palette.deep) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(palette.sun) },
      uOpacity: { value: mapStyle === "light" ? 0.92 : 0.97 },
    },
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    // No polygonOffset: under the renderer's logarithmic depth buffer,
    // negative polygonOffsets push fragments behind the ground in log-z
    // space and the water becomes invisible. We rely on the explicit Y lift
    // (HEIGHT_OFFSET below) to keep water above the ground plane.
  });
  // dFdx/dFdy are core in WebGL2 but this hint also enables the GL1 extension.
  mat.extensions = { derivatives: true } as THREE.ShaderMaterial["extensions"];
  return mat;
}

// Extended bbox for Lake Ontario clipping — anything beyond this is offscreen
// for the downtown camera anyway.
const CLIP_BBOX = {
  south: 43.58,
  north: 43.67,
  west: -79.42,
  east: -79.34,
};

function clipRingToBbox(ring: Ring): Ring {
  // Simple Sutherland–Hodgman clip against the 4 bbox edges. Good enough for
  // a roughly-rectangular clip of a city-scale polygon.
  let out: Ring = ring.slice();
  out = clipEdge(out, (p) => p[0] >= CLIP_BBOX.west, (a, b) =>
    intersect(a, b, "x", CLIP_BBOX.west)
  );
  out = clipEdge(out, (p) => p[0] <= CLIP_BBOX.east, (a, b) =>
    intersect(a, b, "x", CLIP_BBOX.east)
  );
  out = clipEdge(out, (p) => p[1] >= CLIP_BBOX.south, (a, b) =>
    intersect(a, b, "y", CLIP_BBOX.south)
  );
  out = clipEdge(out, (p) => p[1] <= CLIP_BBOX.north, (a, b) =>
    intersect(a, b, "y", CLIP_BBOX.north)
  );
  return out;
}

function clipEdge(
  ring: Ring,
  inside: (p: [number, number]) => boolean,
  cut: (a: [number, number], b: [number, number]) => [number, number]
): Ring {
  if (ring.length === 0) return ring;
  const out: Ring = [];
  let prev = ring[ring.length - 1];
  let prevIn = inside(prev);
  for (const cur of ring) {
    const curIn = inside(cur);
    if (curIn) {
      if (!prevIn) out.push(cut(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(cut(prev, cur));
    }
    prev = cur;
    prevIn = curIn;
  }
  return out;
}

function intersect(
  a: [number, number],
  b: [number, number],
  axis: "x" | "y",
  v: number
): [number, number] {
  if (axis === "x") {
    const t = (v - a[0]) / (b[0] - a[0]);
    return [v, a[1] + t * (b[1] - a[1])];
  } else {
    const t = (v - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), v];
  }
}

/**
 * Tessellates a polygon (lng/lat ring) into a regular triangle grid in world
 * XZ space. Every quad cell that falls inside the polygon is split into two
 * triangles. Triangles are emitted with unshared vertices so that flat
 * per-triangle normals (via dFdx/dFdy in the fragment shader) read as crisp
 * facets rather than smoothed across cell boundaries.
 *
 * cellSize is in world units; with the city projection's 7.14× scale a cell of
 * 600 world units ≈ 84 m physical, which reads as visible "low-poly" facets
 * from anywhere between street-level and bird's-eye.
 */
function tessellatePolygonToGrid(
  ring: Ring,
  cellSize: number
): THREE.BufferGeometry | null {
  if (ring.length < 3) return null;

  // Project ring vertices once.
  const worldRing: { x: number; z: number }[] = ring.map((p) => {
    const w = CityProjection.projectToWorld(p);
    return { x: w.x, z: w.z };
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of worldRing) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const x0 = Math.floor(minX / cellSize) * cellSize;
  const x1 = Math.ceil(maxX / cellSize) * cellSize;
  const z0 = Math.floor(minZ / cellSize) * cellSize;
  const z1 = Math.ceil(maxZ / cellSize) * cellSize;

  const positions: number[] = [];

  for (let x = x0; x < x1; x += cellSize) {
    for (let z = z0; z < z1; z += cellSize) {
      const xa = x;
      const xb = x + cellSize;
      const za = z;
      const zb = z + cellSize;
      const cx = x + cellSize * 0.5;
      const cz = z + cellSize * 0.5;
      if (!pointInRing(cx, cz, worldRing)) continue;

      // Alternate split direction in a checker pattern so triangles don't all
      // share orientation — important for the irregular low-poly aesthetic.
      const ix = Math.round((x - x0) / cellSize);
      const iz = Math.round((z - z0) / cellSize);
      const flip = (ix + iz) % 2 === 0;
      if (flip) {
        positions.push(xa, 0, za, xb, 0, za, xb, 0, zb);
        positions.push(xa, 0, za, xb, 0, zb, xa, 0, zb);
      } else {
        positions.push(xa, 0, za, xb, 0, za, xa, 0, zb);
        positions.push(xb, 0, za, xb, 0, zb, xa, 0, zb);
      }
    }
  }

  if (positions.length === 0) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geom.computeBoundingSphere();
  return geom;
}

function pointInRing(
  x: number,
  z: number,
  ring: { x: number; z: number }[]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    const crosses =
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function renderWaterLayer(
  bodies: WaterbodyFeature[],
  lines: WatercourseFeature[],
  mapStyle: MapStyle = "satellite",
): THREE.Group {
  const group = new THREE.Group();
  group.name = "waterLayer";
  const waterlineColor = getTheme(mapStyle).water.line;

  // Lift well clear of the ground plane (y=0). Six wave layers can push
  // vertices down by ~165 world units in deep troughs, so the base offset
  // must comfortably exceed that to keep the surface above ground.
  const HEIGHT_OFFSET = 180.0;

  // Tessellation cell — fine enough that the surface reads as smooth water
  // (~14 m physical) but coarse enough that the low-poly aesthetic remains.
  const CELL_SIZE = 100;

  for (const body of bodies) {
    for (const poly of body.polygons) {
      const ring = clipRingToBbox(poly[0]);
      const geometry = tessellatePolygonToGrid(ring, CELL_SIZE);
      if (!geometry) continue;
      const material = createWaterMaterial(mapStyle);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = HEIGHT_OFFSET;
      mesh.renderOrder = 1;
      mesh.userData.waterbodyName = body.name;
      mesh.userData.isWater = true;
      mesh.userData.isAnimatedWater = true;
      // The vertex shader displaces along Y; widen the bounding sphere so the
      // mesh isn't culled when its visible bounds expand past the flat-plane
      // bounding sphere computed at tessellation time.
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  // Watercourses as wide line strips at ground level. Empty downtown, but
  // we render them anyway so the layer works elsewhere.
  for (const wc of lines) {
    const pts3: THREE.Vector3[] = wc.line.map(([lng, lat]) =>
      CityProjection.projectToWorld([lng, lat])
    );
    if (pts3.length < 2) continue;
    const geometry = new THREE.BufferGeometry().setFromPoints(
      pts3.map((p) => new THREE.Vector3(p.x, HEIGHT_OFFSET + 0.2, p.z))
    );
    const material = new THREE.LineBasicMaterial({
      color: waterlineColor,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const line = new THREE.Line(geometry, material);
    line.userData.watercourseName = wc.name;
    group.add(line);
  }

  console.log(
    `✅ Water layer: ${bodies.length} polygons, ${lines.length} lines`
  );
  return group;
}

export async function loadAndRenderWaterLayer(
  mapStyle: MapStyle = "satellite",
): Promise<THREE.Group | null> {
  try {
    const [bRes, lRes] = await Promise.all([
      fetch("/map-data/waterbodies.json", { cache: "force-cache" }),
      fetch("/map-data/watercourses.json", { cache: "force-cache" }),
    ]);
    const bodies = bRes.ok ? ((await bRes.json()) as WaterbodyFeature[]) : [];
    const lines = lRes.ok ? ((await lRes.json()) as WatercourseFeature[]) : [];
    return renderWaterLayer(bodies, lines, mapStyle);
  } catch (err) {
    console.error("Water layer load error:", err);
    return null;
  }
}
