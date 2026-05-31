"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import * as turf from "@turf/turf";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { Briefcase } from "lucide-react";
import {
  consumeNextBusinessId,
  peekNextBusinessId,
} from "@/lib/businessIdCounter";
import { getOsmPlanId, setOsmPlanId } from "@/lib/osmBusinessPlans";
import {
  computeBuildingClusters,
  type BuildingClusterIndex,
} from "@/lib/buildingClusters";

// Scene management
import {
  createSceneManager,
  handleResize,
  type SceneGroups,
} from "@/lib/sceneManager";

// Rendering systems
import { fetchBuildings } from "@/lib/buildingData";
import { renderBuildings } from "@/lib/buildingRenderer";
import { renderRoads, renderTrafficHeatmap, renderCongestionMarkers, renderBarricadeMarkers } from "@/lib/roadRenderer";
import {
  applyGroundImagery,
  createCelestialBodies,
  createGround,
  createSky,
} from "@/lib/environmentRenderer";
import { computeTimeOfDay, applyTimeOfDay } from "@/lib/sun/timeOfDay";
import { analyzeShadowImpact, applyShadowOverlay as applyShadowOverlayFn } from "@/lib/sun/shadowAnalysis";
import {
  renderTreesAroundBuilding,
  getDefaultTreeConfigForMap,
} from "@/lib/treeRenderer";
import { TreeConfig } from "@/lib/editor/types/buildingSpec";

// Projection and camera
import { CityProjection } from "@/lib/projection";
import {
  setupControls,
  flyToLocation,
  updateTweens,
  attachKeyboardControls,
  updateKeyboardMovement,
  flyToStreetLevel,
  exitStreetLevel,
  isInStreetMode,
  updateStreetWalkMovement,
} from "@/lib/cameraController";

// Traffic simulation
import { RoadNetwork } from "@/lib/roadNetwork";
import { Pathfinder } from "@/lib/pathfinding";
import { Spawner, SpawnedCar } from "@/lib/spawning";

// Traffic infrastructure and physics
import { TrafficInfrastructureManager } from "@/lib/trafficInfrastructure";
import { VehiclePhysics } from "@/lib/vehiclePhysics";
import { VehicleBehaviorController } from "@/lib/traffic/vehicleBehavior";
import {
  SignalCoordinator,
  createSignalCoordinator,
} from "@/lib/traffic/signalCoordination";
import {
  CollisionSystem,
  createCollisionSystem,
} from "@/lib/traffic/collisionSystem";
import { ConfigurationManager } from "@/lib/simulationConfig";

// Rendering and performance
import {
  createEnhancedCarModel,
  updateTurnSignals,
  updateBrakeLights,
  EnhancedVehicleMesh,
} from "@/lib/vehicleRenderer";
import {
  VehiclePool,
  LODManager,
  StaggeredUpdateManager,
  PerformanceMonitor,
} from "@/lib/performanceOptimizer";

// Analytics
import { TrafficAnalytics } from "@/lib/analytics";
import { applyImpactColors } from "@/lib/stakeholderImpact";
import DebugOverlay from "./DebugOverlay";
import AnalyticsDashboard from "./AnalyticsDashboard";
import {
  isUnderConstruction,
  getConstructionSourceDb,
} from "@/lib/constructionNoise";
import { loadAndRenderZoningLayer } from "@/lib/zoningRenderer";
import { loadAndRenderParksLayer } from "@/lib/parksRenderer";
import { loadAndRenderWaterLayer } from "@/lib/torontoWaterRenderer";
import { loadAndRenderTorontoTreesLayer } from "@/lib/torontoTreesRenderer";
import { createWindVisualization, WindVisualization, WindCell, precomputeWindFields } from "@/lib/windSimulation";
import type { WindDataSet } from "@/lib/windData";

interface PlacedBuilding {
  id: string;
  modelPath: string;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  lat: number;
  lng: number;
  timeline?: {
    zoneType?: string;
    startDate?: string;
    durationDays?: number;
  };
  treeConfig?: TreeConfig; // Optional tree configuration for landscaping
}

interface ThreeMapProps {
  initialCenter?: [number, number];
  className?: string;
  onCoordinateClick?: (
    coordinate: {
      lat: number;
      lng: number;
      worldX: number;
      worldY: number;
      worldZ: number;
      ghostRotationY?: number; // Current rotation of ghost preview
    } | null,
  ) => void;
  placedBuildings?: PlacedBuilding[];
  isPlacementMode?: boolean;
  buildingScale?: { x: number; y: number; z: number };
  selectedBuildingId?: string | null;
  onBuildingSelect?: (id: string | null) => void;
  customModelPath?: string | null;
  onOsmBuildingDelete?: (buildingId: string) => void;
  timelineDate?: string;
  showNoiseRipple?: boolean;
  showZoningLayer?: boolean;
  /** Show Toronto parks/green-spaces polygons */
  showParksLayer?: boolean;
  /** Show Toronto waterbodies (Lake Ontario shoreline + inland ponds) */
  showWaterLayer?: boolean;
  /** Show Toronto street-trees (instanced trunk + foliage per tree) */
  showTorontoTreesLayer?: boolean;
  /** Show wind effect visualization overlay */
  showWindLayer?: boolean;
  /** Hourly wind data from Open-Meteo for time-of-day scrubbing */
  windData?: WindDataSet | null;
  /** Offset to align zoning layer (world units) */
  zoningOffset?: { x: number; z: number };
  /** Rotation in degrees (Y axis) */
  zoningRotationY?: number;
  /** Flip zoning layer horizontally */
  zoningFlipH?: boolean;
  /** When provided, debug/dashboard visibility is controlled by parent (e.g. buttons in sidebar) */
  debugOverlayVisible?: boolean;
  onDebugOverlayChange?: (visible: boolean) => void;
  dashboardVisible?: boolean;
  onDashboardVisibleChange?: (visible: boolean) => void;
  /** When set, panels (car details, debug, analytics) are portaled here so they appear above sidebars */
  panelsPortalRef?: React.RefObject<HTMLDivElement | null>;
  /** When set, camera flies to this [lng, lat]. Change the value to trigger a new fly-to. */
  flyToTarget?: { lngLat: [number, number]; id: number };
  /** Time of day as decimal hour (0-24). Controls sun position, lighting, sky, and ground tint. */
  timeOfDayHour?: number;
  /** When set, triggers a street-level fly-to at the given world position. Change id to trigger again. */
  streetViewTarget?: { worldX: number; worldZ: number; id: number } | null;
  /** Called when street view mode changes */
  onStreetViewChange?: (active: boolean) => void;
  /** Increment to trigger exit from street view back to bird-eye */
  exitStreetViewTrigger?: number;
  /** Day of year (1-365) for sun angle calculation. Default 80 (spring equinox). */
  dayOfYear?: number;
  /** When false, hides all placed buildings (before/after comparison). Default true. */
  showProposedBuilding?: boolean;
  /** Ref-based API for shadow analysis — parent can call methods on this ref */
  shadowAnalysisRef?: React.MutableRefObject<{
    runAnalysis: (dayOfYear: number) => Promise<import("@/lib/sun/shadowAnalysis").ShadowAnalysisSummary | null>;
    applyShadowOverlay: (impacts: import("@/lib/sun/shadowAnalysis").BuildingShadowImpact[], filterHour?: number) => void;
    clearShadowOverlay: () => void;
  } | null>;
  /** Called once after OSM buildings are fetched, passing the raw building data array */
  onOsmBuildingsLoaded?: (buildings: import("@/lib/buildingData").Building[]) => void;
  /** Called once after OSM clusters are computed (touching buildings grouped together) */
  onOsmClustersComputed?: (index: BuildingClusterIndex) => void;
  /** When set, applies stakeholder impact color-coding to OSM building meshes */
  stakeholderImpactAnalysis?: import("@/lib/stakeholderImpact").StakeholderAnalysis | null;
  /** Show traffic impact heatmap overlay on roads */
  showTrafficHeatmap?: boolean;
  /** Traffic impact analysis result — drives heatmap + congestion markers */
  trafficImpactResult?: import("@/lib/trafficImpact").TrafficImpactResult | null;
  /** Called once after road network is loaded, passing the RoadNetwork instance */
  onRoadNetworkLoaded?: (roadNetwork: RoadNetwork) => void;
  /** Whether barricade placement mode is active */
  isBarricadeMode?: boolean;
  /** Set of barricaded edge IDs */
  barricadedEdgeIds?: Set<string>;
  /** Called when user clicks a road to toggle barricade */
  onBarricadeToggle?: (edgeId: string) => void;
  /** When true, mouse movement shows a street-view pin preview; click triggers street view */
  isStreetViewSelectionMode?: boolean;
  /** Map base style: satellite imagery or light/street map */
  mapStyle?: "satellite" | "light";
}

type CarType = "sedan" | "suv" | "truck" | "compact";

interface TrafficLight {
  id: string;
  position: [number, number];
  state: "red" | "yellow" | "green";
  timer: number;
  mesh?: THREE.Group;
  intersectionId: string;
  direction: "ns" | "ew";
}

const TRAFFIC_LIGHT_TIMINGS = {
  green: 8000,
  yellow: 2000,
  red: 8000,
};

// Create 3D car models (real-world meters × map SCALE_FACTOR)
function createCarModel(type: CarType, color: string): THREE.Mesh {
  const S = 10 / 1.4; // map scale factor
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const bodyMat = new THREE.MeshPhongMaterial({ color, emissive: c, emissiveIntensity: 0.35 });
  const wheelMat = new THREE.MeshPhongMaterial({ color: 0x222222, emissive: new THREE.Color(0x222222), emissiveIntensity: 0.2 });
  const rimMat  = new THREE.MeshPhongMaterial({ color: 0xaaaaaa, emissive: new THREE.Color(0x888888), emissiveIntensity: 0.3 });

  // Per-type specs: all dimensions in real-world meters, Y=0 is ground.
  // wheelR = wheel radius, wheelW = wheel width, halfTrack = lateral offset of wheel centres,
  // frontAxleZ / rearAxleZ = Z position of front/rear axles.
  type CarSpec = {
    bodyW: number; bodyH: number; bodyL: number; bodyY: number;
    cabinW: number; cabinH: number; cabinL: number; cabinZ: number;
    wheelR: number; wheelW: number; halfTrack: number;
    frontAxleZ: number; rearAxleZ: number;
  };

  const specs: Record<CarType, CarSpec> = {
    sedan:   { bodyW:1.80, bodyH:0.62, bodyL:4.50, bodyY:0.32, cabinW:1.60, cabinH:0.52, cabinL:2.20, cabinZ:-0.25, wheelR:0.32, wheelW:0.22, halfTrack:1.00, frontAxleZ: 1.40, rearAxleZ:-1.40 },
    suv:     { bodyW:1.95, bodyH:0.80, bodyL:4.70, bodyY:0.36, cabinW:1.85, cabinH:0.68, cabinL:3.00, cabinZ:-0.10, wheelR:0.36, wheelW:0.24, halfTrack:1.10, frontAxleZ: 1.50, rearAxleZ:-1.50 },
    truck:   { bodyW:2.00, bodyH:0.48, bodyL:5.40, bodyY:0.38, cabinW:2.00, cabinH:0.95, cabinL:2.10, cabinZ: 1.35, wheelR:0.38, wheelW:0.26, halfTrack:1.12, frontAxleZ: 1.70, rearAxleZ:-1.60 },
    compact: { bodyW:1.70, bodyH:0.58, bodyL:3.90, bodyY:0.30, cabinW:1.55, cabinH:0.55, cabinL:2.40, cabinZ:-0.10, wheelR:0.30, wheelW:0.20, halfTrack:0.95, frontAxleZ: 1.20, rearAxleZ:-1.20 },
  };

  const sp = specs[type];

  // Body — lower slab
  const body = new THREE.Mesh(new THREE.BoxGeometry(sp.bodyW * S, sp.bodyH * S, sp.bodyL * S), bodyMat);
  body.position.y = (sp.bodyY + sp.bodyH / 2) * S;
  group.add(body);

  // Cabin — upper glasshouse
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(sp.cabinW * S, sp.cabinH * S, sp.cabinL * S), bodyMat);
  cabin.position.y = (sp.bodyY + sp.bodyH + sp.cabinH / 2) * S;
  cabin.position.z = sp.cabinZ * S;
  group.add(cabin);

  // Truck bed walls (open box look)
  if (type === 'truck') {
    const bedMat = new THREE.MeshPhongMaterial({ color: 0x333333, emissive: new THREE.Color(0x333333), emissiveIntensity: 0.2 });
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(1.90 * S, 0.08 * S, 2.80 * S), bedMat);
    bedFloor.position.set(0, (sp.bodyY + sp.bodyH) * S, -1.35 * S);
    group.add(bedFloor);
    [[0.95, 0.30, 0], [-0.95, 0.30, 0]].forEach(([lx, lh, _]) => {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.06 * S, lh * S, 2.80 * S), bedMat);
      side.position.set(lx * S, (sp.bodyY + sp.bodyH + lh / 2) * S, -1.35 * S);
      group.add(side);
    });
  }

  // 4 wheels — each is a dark cylinder with a lighter rim disc
  const wheelGeo = new THREE.CylinderGeometry(sp.wheelR * S, sp.wheelR * S, sp.wheelW * S, 16);
  const rimGeo   = new THREE.CylinderGeometry(sp.wheelR * 0.55 * S, sp.wheelR * 0.55 * S, sp.wheelW * 1.02 * S, 8);
  const axleY = sp.wheelR * S; // wheel centre sits exactly on ground

  [
    [ sp.halfTrack * S, axleY,  sp.frontAxleZ * S],
    [-sp.halfTrack * S, axleY,  sp.frontAxleZ * S],
    [ sp.halfTrack * S, axleY,  sp.rearAxleZ  * S],
    [-sp.halfTrack * S, axleY,  sp.rearAxleZ  * S],
  ].forEach(([wx, wy, wz]) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    group.add(wheel);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, wy, wz);
    group.add(rim);
  });

  // Invisible wrapper mesh so existing code that expects THREE.Mesh still works
  const wrapper = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.001, 0.001), bodyMat);
  wrapper.add(group);
  return wrapper;
}

// Simple street tree: cylinder trunk + cone canopy
function createStreetTreeModel(): THREE.Group {
  const S = 10 / 1.4;
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.15 * S, 0.2 * S, 1.2 * S, 8),
    new THREE.MeshPhongMaterial({ color: 0x5d3a1a, emissive: new THREE.Color(0x5d3a1a), emissiveIntensity: 0.3 }),
  );
  trunk.position.y = 0.6 * S;
  group.add(trunk);
  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(0.8 * S, 2.0 * S, 7),
    new THREE.MeshPhongMaterial({ color: 0x2d6a2d, emissive: new THREE.Color(0x2d6a2d), emissiveIntensity: 0.35 }),
  );
  canopy.position.y = 2.2 * S;
  group.add(canopy);
  return group;
}

// Simple human figure: body block + head block
function createHumanModel(color: string): THREE.Group {
  const S = 10 / 1.4;
  const group = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.4 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4 * S, 0.9 * S, 0.25 * S), mat);
  body.position.y = 0.9 * S;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.3 * S, 0.3 * S, 0.3 * S),
    new THREE.MeshPhongMaterial({ color: 0xf5cba7, emissive: new THREE.Color(0xf5cba7), emissiveIntensity: 0.4 }),
  );
  head.position.y = 1.5 * S;
  group.add(head);
  return group;
}

// Create traffic light 3D model (real-world scale, then multiplied by map SCALE_FACTOR)
function createTrafficLightModel(): THREE.Group {
  const S = 10 / 1.4; // map scale factor
  const group = new THREE.Group();

  // Pole: ~0.15m radius, 5m tall
  const poleGeometry = new THREE.CylinderGeometry(0.15 * S, 0.15 * S, 5 * S, 8);
  const poleMaterial = new THREE.MeshPhongMaterial({
    color: 0x444444,
    emissive: 0x222222,
    emissiveIntensity: 0.5,
  });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.y = 2.5 * S;
  group.add(pole);

  // Light housing: ~0.6m wide, 1.5m tall, 0.4m deep
  const housingGeometry = new THREE.BoxGeometry(0.6 * S, 1.5 * S, 0.4 * S);
  const housingMaterial = new THREE.MeshPhongMaterial({
    color: 0x222222,
    emissive: 0x111111,
    emissiveIntensity: 0.3,
  });
  const housing = new THREE.Mesh(housingGeometry, housingMaterial);
  housing.position.y = 5.5 * S;
  group.add(housing);

  // Lights: ~0.2m radius
  const lightGeometry = new THREE.SphereGeometry(0.2 * S, 16, 16);

  const redLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 2,
    }),
  );
  redLight.position.set(0, 6.1 * S, 0.25 * S);
  redLight.name = "red";
  group.add(redLight);

  const yellowLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0xffff00,
      emissiveIntensity: 2,
    }),
  );
  yellowLight.position.set(0, 5.5 * S, 0.25 * S);
  yellowLight.name = "yellow";
  group.add(yellowLight);

  const greenLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 2,
    }),
  );
  greenLight.position.set(0, 4.9 * S, 0.25 * S);
  greenLight.name = "green";
  group.add(greenLight);

  return group;
}

const MAP_SCALE = 10 / 1.4;

/** Construction zone: flat 10 km/h when car is within this radius of a building */
const CONSTRUCTION_ZONE_RADIUS_M = 20;
const CONSTRUCTION_ZONE_SPEED_LIMIT = 10; // flat 10 km/h

/** Red strip material for construction zone on the road */
const RED_STRIP_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xcc0000,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/**
 * Create a red strip mesh along a path (road segment) in world space.
 * Used to show "slow down" construction zone directly on the road.
 */
function createRedStripOnRoad(
  worldPoints: THREE.Vector3[],
  widthScene: number,
): THREE.Mesh {
  if (worldPoints.length < 2) {
    return new THREE.Mesh(new THREE.BufferGeometry(), RED_STRIP_MATERIAL);
  }
  const half = widthScene / 2;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < worldPoints.length - 1; i++) {
    const p1 = worldPoints[i];
    const p2 = worldPoints[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const perpX = (-dz / len) * half;
    const perpZ = (dx / len) * half;

    const i0 = vertices.length / 3;
    vertices.push(p1.x - perpX, p1.y + 0.2, p1.z - perpZ);
    vertices.push(p1.x + perpX, p1.y + 0.2, p1.z + perpZ);
    vertices.push(p2.x - perpX, p2.y + 0.2, p2.z - perpZ);
    vertices.push(p2.x + perpX, p2.y + 0.2, p2.z + perpZ);

    indices.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, RED_STRIP_MATERIAL);
}

/** Thin red ring border around the construction zone. Road strips are the primary indicator. */
function createConstructionZoneBorder(radiusScene: number): THREE.Group {
  const group = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xcc0000,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const ringThickness = radiusScene * 0.06;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radiusScene - ringThickness, radiusScene, 48, 1),
    ringMat,
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  ring.name = "construction-zone-border";
  group.add(ring);
  return group;
}

// Fetch traffic signals from Next.js API route
async function fetchAllTrafficSignals(): Promise<
  Array<{
    lat: number;
    lon: number;
    type: string;
    id: number;
  }>
> {
  try {
    console.log("Fetching traffic signals...");
    const response = await fetch(
      `/api/map/traffic-signals?south=43.640&west=-79.395&north=43.660&east=-79.365`,
      {
        cache: "no-store", // Don't cache - always fetch fresh data
      },
    );

    if (!response.ok) {
      console.warn(`API error: ${response.status}`);
      return [];
    }

    const signals = await response.json();
    console.log(`✅ Found ${signals.length} traffic controls from cache`);

    return signals;
  } catch (error) {
    console.warn("Error fetching traffic signals:", error);
    return [];
  }
}

export default function ThreeMap({
  initialCenter = [-79.3800, 43.6500], // Downtown Toronto (Union Station area)
  className = "w-full h-full",
  onCoordinateClick,
  placedBuildings = [],
  isPlacementMode = false,
  buildingScale = { x: 10, y: 10, z: 10 },
  selectedBuildingId = null,
  onBuildingSelect,
  customModelPath = null,
  onOsmBuildingDelete,
  timelineDate = new Date().toISOString().slice(0, 10),
  showNoiseRipple = false,
  showZoningLayer = false,
  showParksLayer = false,
  showWaterLayer = false,
  showTorontoTreesLayer = true,
  showWindLayer = false,
  windData = null,
  zoningOffset = { x: 0, z: 0 },
  zoningRotationY = 0,
  zoningFlipH = false,
  debugOverlayVisible: debugOverlayVisibleProp,
  onDebugOverlayChange,
  dashboardVisible: dashboardVisibleProp,
  onDashboardVisibleChange,
  panelsPortalRef,
  flyToTarget,
  timeOfDayHour,
  streetViewTarget,
  onStreetViewChange,
  exitStreetViewTrigger,
  dayOfYear = 80,
  showProposedBuilding = true,
  shadowAnalysisRef,
  onOsmBuildingsLoaded,
  onOsmClustersComputed,
  stakeholderImpactAnalysis,
  showTrafficHeatmap = false,
  trafficImpactResult,
  onRoadNetworkLoaded,
  isBarricadeMode = false,
  barricadedEdgeIds,
  onBarricadeToggle,
  isStreetViewSelectionMode = false,
  mapStyle = "satellite",
}: ThreeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const keyboardCleanupRef = useRef<(() => void) | null>(null);
  const groupsRef = useRef<SceneGroups | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const skyMeshRef = useRef<THREE.Mesh | null>(null);
  const sunMeshRef = useRef<THREE.Mesh | null>(null);
  const moonMeshRef = useRef<THREE.Mesh | null>(null);
  const groundGroupRef = useRef<THREE.Group | null>(null);
  const groundImageryBboxRef = useRef<[number, number, number, number] | null>(
    null,
  );
  const timeOfDayHourRef = useRef<number>(12);
  const dayOfYearRef = useRef<number>(80);
  // Saved bird-eye state so exit street view can return to exact pre-entry position
  const savedBirdEyeStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  // Group holding static parked cars shown only during street view
  const streetViewCarsRef = useRef<THREE.Group | null>(null);
  const shadowOverlayCleanupRef = useRef<(() => void) | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const initialized = useRef(false);

  const [loadingStatus, setLoadingStatus] = useState<string>("Initializing...");
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const [ghostPosition, setGhostPosition] = useState<THREE.Vector3 | null>(
    null,
  );
  const ghostModelRef = useRef<THREE.Group | null>(null);
  const buildingModelsRef = useRef<Map<string, THREE.Group>>(new Map());
  const buildingTreesRef = useRef<Map<string, THREE.Group>>(new Map()); // Trees for each placed building
  const osmBuildingMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const composerRef = useRef<EffectComposer | null>(null);
  const outlinePassRef = useRef<OutlinePass | null>(null);
  const [selectedOsmBuildingId, setSelectedOsmBuildingId] = useState<
    string | null
  >(null);
  const clusterIndexRef = useRef<BuildingClusterIndex | null>(null);
  const router = useRouter();
  const [osmPlanIdForSelected, setOsmPlanIdForSelected] = useState<number | null>(null);
  const [nextOsmPlanIdPreview, setNextOsmPlanIdPreview] = useState<number>(1);
  useEffect(() => {
    if (selectedOsmBuildingId) {
      setOsmPlanIdForSelected(getOsmPlanId(selectedOsmBuildingId) ?? null);
      setNextOsmPlanIdPreview(peekNextBusinessId());
    } else {
      setOsmPlanIdForSelected(null);
    }
  }, [selectedOsmBuildingId]);
  const openOsmBusinessPlan = (osmBuildingId: string) => {
    const existing = getOsmPlanId(osmBuildingId);
    const planId = existing ?? consumeNextBusinessId();
    if (existing == null) {
      setOsmPlanId(osmBuildingId, planId);
      setOsmPlanIdForSelected(planId);
      setNextOsmPlanIdPreview(peekNextBusinessId());
    }
    router.push(`/plan/business-${planId}?osmBuildingId=${encodeURIComponent(osmBuildingId)}`);
  };
  const [ghostRotationY, setGhostRotationY] = useState(0); // Rotation for ghost preview
  const noiseRippleGroupRef = useRef<THREE.Group | null>(null);
  const rippleTimeRef = useRef(0);
  const zoningGroupRef = useRef<THREE.Group | null>(null);
  const parksGroupRef = useRef<THREE.Group | null>(null);
  const waterGroupRef = useRef<THREE.Group | null>(null);
  const torontoTreesGroupRef = useRef<THREE.Group | null>(null);
  const windVizRef = useRef<WindVisualization | null>(null);
  const buildingsDataRef = useRef<import("@/lib/buildingData").Building[]>([]);
  const windFieldsRef = useRef<WindCell[][] | null>(null);

  // Sync time-of-day prop into ref for animation loop
  useEffect(() => {
    timeOfDayHourRef.current = timeOfDayHour ?? 12;
  }, [timeOfDayHour]);

  // Sync dayOfYear prop into ref
  useEffect(() => {
    dayOfYearRef.current = dayOfYear;
  }, [dayOfYear]);

  // Before/after toggle: show/hide placed building models
  useEffect(() => {
    buildingModelsRef.current.forEach((model) => {
      model.visible = showProposedBuilding;
    });
    // Also show/hide trees for placed buildings
    buildingTreesRef.current.forEach((treeGroup) => {
      treeGroup.visible = showProposedBuilding;
    });
  }, [showProposedBuilding, isReady]);

  // Expose shadow analysis API via ref
  useEffect(() => {
    if (!shadowAnalysisRef) return;
    shadowAnalysisRef.current = {
      runAnalysis: async (doy: number) => {
        if (!sceneRef.current) return null;
        const proposedObjs = Array.from(buildingModelsRef.current.values());
        if (proposedObjs.length === 0) return null;
        return analyzeShadowImpact(
          sceneRef.current,
          proposedObjs,
          osmBuildingMeshesRef.current,
          doy,
          1, // 1-hour intervals for performance with ~4776 buildings
        );
      },
      applyShadowOverlay: (impacts, filterHour) => {
        // Clear previous overlay
        if (shadowOverlayCleanupRef.current) {
          shadowOverlayCleanupRef.current();
        }
        shadowOverlayCleanupRef.current = applyShadowOverlayFn(
          impacts,
          osmBuildingMeshesRef.current,
          filterHour,
        );
      },
      clearShadowOverlay: () => {
        if (shadowOverlayCleanupRef.current) {
          shadowOverlayCleanupRef.current();
          shadowOverlayCleanupRef.current = null;
        }
      },
    };
    return () => {
      if (shadowAnalysisRef) shadowAnalysisRef.current = null;
    };
  }, [shadowAnalysisRef, isReady]);

  // Stakeholder impact: apply color-coding to OSM buildings
  useEffect(() => {
    if (!isReady || osmBuildingMeshesRef.current.size === 0) return;
    if (!stakeholderImpactAnalysis) return;

    const cleanup = applyImpactColors(stakeholderImpactAnalysis, osmBuildingMeshesRef.current);
    return cleanup;
  }, [stakeholderImpactAnalysis, isReady]);

  // Traffic impact heatmap overlay
  useEffect(() => {
    if (!isReady || !groupsRef.current) return;
    const groups = groupsRef.current;

    // Remove existing heatmap/markers/barricades
    if (trafficHeatmapGroupRef.current) {
      groups.dynamicObjects.remove(trafficHeatmapGroupRef.current);
      trafficHeatmapGroupRef.current = null;
    }
    if (congestionMarkersGroupRef.current) {
      groups.dynamicObjects.remove(congestionMarkersGroupRef.current);
      congestionMarkersGroupRef.current = null;
    }
    if (barricadeMarkersGroupRef.current) {
      groups.dynamicObjects.remove(barricadeMarkersGroupRef.current);
      barricadeMarkersGroupRef.current = null;
    }

    if (!showTrafficHeatmap || !trafficImpactResult || !roadNetworkRef.current) return;

    const roadNetwork = roadNetworkRef.current;
    const allEdges = roadNetwork.getEdges();

    // Extract building positions for gradient rendering
    const buildingPositions: [number, number][] = trafficImpactResult.buildings.map(b => b.position);

    // Render heatmap overlay on impacted roads with distance-based gradient
    const heatmapGroup = renderTrafficHeatmap(
      trafficImpactResult.edgeImpact,
      allEdges,
      CityProjection,
      buildingPositions,
      trafficImpactResult.maxImpactRadius,
    );
    groups.dynamicObjects.add(heatmapGroup);
    trafficHeatmapGroupRef.current = heatmapGroup;

    // Render congestion markers at congested intersections
    if (trafficImpactResult.congestedIntersections.length > 0) {
      const nodePositions = new Map<string, [number, number]>();
      for (const nodeId of trafficImpactResult.congestedIntersections) {
        const node = roadNetwork.getNode(nodeId);
        if (node) nodePositions.set(nodeId, node.position);
      }
      const markersGroup = renderCongestionMarkers(
        trafficImpactResult.congestedIntersections,
        nodePositions,
        CityProjection,
      );
      groups.dynamicObjects.add(markersGroup);
      congestionMarkersGroupRef.current = markersGroup;
    }

    // Render barricade markers if any
    if (barricadedEdgeIds && barricadedEdgeIds.size > 0) {
      const barricadeGroup = renderBarricadeMarkers(barricadedEdgeIds, allEdges, CityProjection);
      groups.dynamicObjects.add(barricadeGroup);
      barricadeMarkersGroupRef.current = barricadeGroup;
    }

    return () => {
      if (trafficHeatmapGroupRef.current) {
        groups.dynamicObjects.remove(trafficHeatmapGroupRef.current);
        trafficHeatmapGroupRef.current = null;
      }
      if (congestionMarkersGroupRef.current) {
        groups.dynamicObjects.remove(congestionMarkersGroupRef.current);
        congestionMarkersGroupRef.current = null;
      }
      if (barricadeMarkersGroupRef.current) {
        groups.dynamicObjects.remove(barricadeMarkersGroupRef.current);
        barricadeMarkersGroupRef.current = null;
      }
    };
  }, [showTrafficHeatmap, trafficImpactResult, barricadedEdgeIds, isReady]);

  // Apply a static map texture to the ground plane when a basemap source is
  // available. The neutral plane remains the fallback if texture loading fails.
  useEffect(() => {
    const groundGroup = groundGroupRef.current;
    const bbox = groundImageryBboxRef.current;
    if (!groundGroup || !bbox) return;

    let cancelled = false;
    applyGroundImagery(groundGroup, bbox, mapStyle).then((applied) => {
      if (!cancelled && applied) {
        console.log(`Applied ${mapStyle} basemap texture`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapStyle]);

  // Fly to target location when prop changes
  useEffect(() => {
    if (!flyToTarget || !cameraRef.current || !controlsRef.current) return;
    flyToLocation(
      cameraRef.current,
      controlsRef.current,
      flyToTarget.lngLat,
      600,
      2000,
    );
  }, [flyToTarget]);

  // Street-level POV: fly down when streetViewTarget changes
  useEffect(() => {
    if (!streetViewTarget || !cameraRef.current || !controlsRef.current) return;
    // Snapshot exact camera/target position before entering street view
    savedBirdEyeStateRef.current = {
      position: cameraRef.current.position.clone(),
      target: controlsRef.current.target.clone(),
    };

    // Spawn static street props on nearby roads
    if (groupsRef.current && roadNetworkRef.current) {
      const CAR_COLORS   = ["#c0392b","#2980b9","#27ae60","#f39c12","#8e44ad","#bdc3c7","#2c3e50","#e67e22"];
      const HUMAN_COLORS = ["#e74c3c","#3498db","#2ecc71","#f1c40f","#9b59b6","#1abc9c","#e67e22","#ecf0f1"];
      const CAR_TYPES: CarType[] = ["sedan", "suv", "compact", "truck"];

      const Wu = 10 / 1.4; // world-units per metre
      // Fixed lateral offsets from road centre-line (metres → world units)
      const CAR_SIDE    = 3.8 * Wu; // parking lane — just right of road edge
      const TREE_SIDE   = 5.5 * Wu; // nature strip between road & footpath
      const HUMAN_SIDE  = 7.2 * Wu; // footpath

      // Minimum spacing between objects of the same type (world units)
      const CAR_GAP   = 40 * Wu; // ~40 m (car length + gap)
      const TREE_GAP  = 12 * Wu; // ~12 m
      const HUMAN_GAP =  5 * Wu; // ~5 m

      const carsGroup = new THREE.Group();
      carsGroup.name = "street-view-parked-cars";

      const svLngLat = CityProjection.unprojectFromWorld(
        new THREE.Vector3(streetViewTarget.worldX, 0, streetViewTarget.worldZ)
      );
      const nearbyEdges = roadNetworkRef.current.findEdgesNearPosition(svLngLat, 200);

      // Track placed positions per type so we can enforce spacing
      const placedCars:   THREE.Vector2[] = [];
      const placedTrees:  THREE.Vector2[] = [];
      const placedHumans: THREE.Vector2[] = [];

      const tooClose = (list: THREE.Vector2[], x: number, z: number, minDist: number) =>
        list.some(p => Math.hypot(p.x - x, p.y - z) < minDist);

      const tryAdd = (
        list: THREE.Vector2[], minDist: number,
        x: number, z: number, rotY: number,
        factory: () => THREE.Object3D,
      ) => {
        if (tooClose(list, x, z, minDist)) return;
        list.push(new THREE.Vector2(x, z));
        const obj = factory();
        obj.position.set(x, 0, z);
        obj.rotation.y = rotY;
        carsGroup.add(obj);
      };

      nearbyEdges.forEach((edge) => {
        if (edge.geometry.length < 2) return;

        // Walk along each segment of the edge
        for (let si = 0; si < edge.geometry.length - 1; si++) {
          const p0 = CityProjection.projectToWorld(edge.geometry[si]     as [number,number]);
          const p1 = CityProjection.projectToWorld(edge.geometry[si + 1] as [number,number]);
          const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          if (segLen < 1) continue;

          // Road direction unit vector
          const rdx = (p1.x - p0.x) / segLen;
          const rdz = (p1.z - p0.z) / segLen;
          // Right-hand perpendicular: (rdz, 0, -rdx)
          const rpx = rdz;
          const rpz = -rdx;
          const roadAngle = Math.atan2(rdx, rdz);

          // Sample candidate points every ~8 m along this segment
          const step = 8 * Wu;
          for (let d = step * 0.5; d < segLen; d += step) {
            const t = d / segLen;
            const mx = p0.x + rdx * d;
            const mz = p0.z + rdz * d;

            const r = Math.random();

            if (r < 0.35) {
              // Parked car — right side of road
              const cx = mx + rpx * CAR_SIDE;
              const cz = mz + rpz * CAR_SIDE;
              const type  = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
              const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
              tryAdd(placedCars, CAR_GAP, cx, cz, roadAngle,
                () => createCarModel(type, color) as unknown as THREE.Group);

            } else if (r < 0.65) {
              // Street tree — nature strip
              const tx = mx + rpx * TREE_SIDE;
              const tz = mz + rpz * TREE_SIDE;
              tryAdd(placedTrees, TREE_GAP, tx, tz, 0, createStreetTreeModel);

            } else if (r < 0.80) {
              // Pedestrian — footpath
              const hx = mx + rpx * HUMAN_SIDE;
              const hz = mz + rpz * HUMAN_SIDE;
              const color  = HUMAN_COLORS[Math.floor(Math.random() * HUMAN_COLORS.length)];
              const facing = Math.random() * Math.PI * 2;
              tryAdd(placedHumans, HUMAN_GAP, hx, hz, facing, () => createHumanModel(color));
            }
          }
        }
      });

      groupsRef.current.dynamicObjects.add(carsGroup);
      streetViewCarsRef.current = carsGroup;
    }

    flyToStreetLevel(
      cameraRef.current,
      controlsRef.current,
      streetViewTarget.worldX,
      streetViewTarget.worldZ,
    ).then(() => {
      onStreetViewChange?.(true);
    });
  }, [streetViewTarget]);

  // Exit street view when trigger increments
  useEffect(() => {
    if (!exitStreetViewTrigger || !cameraRef.current || !controlsRef.current) return;

    // Remove parked cars
    if (streetViewCarsRef.current && groupsRef.current) {
      groupsRef.current.dynamicObjects.remove(streetViewCarsRef.current);
      streetViewCarsRef.current.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      });
      streetViewCarsRef.current = null;
    }

    const savedState = savedBirdEyeStateRef.current;
    savedBirdEyeStateRef.current = null;
    exitStreetLevel(cameraRef.current, controlsRef.current, 1500, savedState ?? undefined).then(() => {
      onStreetViewChange?.(false);
    });
  }, [exitStreetViewTrigger]);

  const analyticsRef = useRef<TrafficAnalytics | null>(null);
  const [internalDebugVisible, setInternalDebugVisible] = useState(false);
  const [internalDashboardVisible, setInternalDashboardVisible] =
    useState(false);
  const debugOverlayVisible = debugOverlayVisibleProp ?? internalDebugVisible;
  const setDebugOverlayVisible =
    onDebugOverlayChange ?? ((v: boolean) => setInternalDebugVisible(v));
  const dashboardVisible = dashboardVisibleProp ?? internalDashboardVisible;
  const setDashboardVisible =
    onDashboardVisibleChange ??
    ((v: boolean) => setInternalDashboardVisible(v));

  // Traffic system managers (integrated systems)
  const trafficInfrastructureRef = useRef<TrafficInfrastructureManager | null>(
    null,
  );
  const vehiclePhysicsRef = useRef<VehiclePhysics | null>(null);
  const behaviorControllerRef = useRef<VehicleBehaviorController | null>(null);
  const signalCoordinatorRef = useRef<SignalCoordinator | null>(null);
  const collisionSystemRef = useRef<CollisionSystem | null>(null);
  const configManagerRef = useRef<ConfigurationManager | null>(null);

  // Traffic spawner and road network refs (for building-vicinity spawning and lane blocks)
  const spawnerRef = useRef<Spawner | null>(null);
  const roadNetworkRef = useRef<RoadNetwork | null>(null);
  const speedZonesGroupRef = useRef<THREE.Group | null>(null);
  const trafficHeatmapGroupRef = useRef<THREE.Group | null>(null);
  const congestionMarkersGroupRef = useRef<THREE.Group | null>(null);
  const barricadeMarkersGroupRef = useRef<THREE.Group | null>(null);
  const carMeshesRef = useRef<Record<string, THREE.Mesh>>({});
  const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
  const [, setCarPanelTick] = useState(0);

  // Construction zone metrics for debug overlay
  const constructionZoneRef = useRef<{
    vehiclesInZone: number;
    avgSpeedInZone: number;
  }>({ vehiclesInZone: 0, avgSpeedInZone: 0 });

  // Performance optimization managers
  const vehiclePoolRef = useRef<VehiclePool | null>(null);
  const lodManagerRef = useRef<LODManager | null>(null);
  const staggeredUpdateRef = useRef<StaggeredUpdateManager | null>(null);
  const perfMonitorRef = useRef<PerformanceMonitor | null>(null);

  useEffect(() => {
    if (!canvasRef.current || initialized.current) return;
    initialized.current = true;

    let roadNetwork: RoadNetwork;
    let spawner: Spawner;
    const trafficLights: TrafficLight[] = [];
    const carMeshes: Record<string, THREE.Mesh> = {};

    async function initializeScene() {
      if (!canvasRef.current) return;

      try {
        // Create scene manager
        setLoadingStatus("Creating scene...");
        const { scene, camera, renderer, groups, directionalLight, ambientLight } = createSceneManager(
          canvasRef.current,
        );
        sceneRef.current = scene;
        cameraRef.current = camera;
        rendererRef.current = renderer;
        groupsRef.current = groups;
        directionalLightRef.current = directionalLight;
        ambientLightRef.current = ambientLight;

        // Setup camera controls
        const controls = setupControls(camera, renderer);
        controlsRef.current = controls;

        // Attach WASD keyboard controls
        keyboardCleanupRef.current = attachKeyboardControls();

        // Ensure controls are enabled
        controls.enabled = true;
        console.log("✅ OrbitControls initialized with WASD support");

        // Environment setup
        setLoadingStatus("Setting up environment...");

        // Add sky dome
        const sky = createSky();
        groups.environment.add(sky);
        skyMeshRef.current = sky;

        // Add sun and moon
        const { sun, moon } = createCelestialBodies();
        groups.environment.add(sun);
        groups.environment.add(moon);
        sunMeshRef.current = sun;
        moonMeshRef.current = moon;

        // Data bounding box for downtown Toronto (buildings, roads, traffic)
        const bbox: [number, number, number, number] = [
          43.64, -79.395, 43.66, -79.365,
        ];

        // Extended imagery bbox (~4x in each direction for surrounding city context)
        const latSpan = bbox[2] - bbox[0]; // 0.02
        const lngSpan = bbox[3] - bbox[1]; // 0.03
        const mapBbox: [number, number, number, number] = [
          bbox[0] - latSpan * 1.5, // south
          bbox[1] - lngSpan * 1.5, // west
          bbox[2] + latSpan * 1.5, // north
          bbox[3] + lngSpan * 1.5, // east
        ];
        groundImageryBboxRef.current = mapBbox;

        // Single styled ground plane — satellite tile imagery removed in favour
        // of a clean dark backdrop that lets the building extrusions read.
        setLoadingStatus("Creating ground plane...");
        const groundGroup = createGround(
          { minLat: mapBbox[0], maxLat: mapBbox[2], minLng: mapBbox[1], maxLng: mapBbox[3] },
          CityProjection,
        );
        groups.environment.add(groundGroup);
        groundGroupRef.current = groundGroup;
        void applyGroundImagery(groundGroup, mapBbox, mapStyle);

        // Fetch and render buildings
        setLoadingStatus("Fetching buildings from OpenStreetMap...");
        const buildings = await fetchBuildings(bbox);

        setLoadingStatus("Rendering buildings...");
        const osmMeshes = renderBuildings(
          buildings,
          CityProjection,
          groups.staticGeometry,
        );
        // Store OSM building meshes for click detection
        osmBuildingMeshesRef.current = osmMeshes;
        // Store buildings data for wind simulation and stakeholder analysis
        buildingsDataRef.current = buildings;
        onOsmBuildingsLoaded?.(buildings);

        // Cluster touching/adjacent buildings so they behave as a single entity
        const clusterIndex = computeBuildingClusters(buildings);
        clusterIndexRef.current = clusterIndex;
        onOsmClustersComputed?.(clusterIndex);

        // Initialize road network
        setLoadingStatus("Fetching road network from OpenStreetMap...");
        roadNetwork = new RoadNetwork();
        await roadNetwork.fetchFromOSM({
          south: 43.64,
          west: -79.395,
          north: 43.66,
          east: -79.365,
        });

        roadNetwork.addQueensDestinations();

        console.log("✅ Road network loaded successfully");
        console.log(`   Nodes: ${roadNetwork.getNodes().length}`);
        console.log(`   Edges: ${roadNetwork.getEdges().length}`);
        console.log(`   Destinations: ${roadNetwork.getDestinations().length}`);

        // Render roads
        setLoadingStatus("Rendering roads...");
        const edges = roadNetwork.getEdges();
        renderRoads(edges, CityProjection, groups.staticGeometry);

        // Update static geometry matrix after all additions
        groups.staticGeometry.updateMatrix();

        // Group for construction speed zones (red = very slow, yellow = slightly slow)
        const speedZonesGroup = new THREE.Group();
        speedZonesGroup.name = "speedZones";
        groups.dynamicObjects.add(speedZonesGroup);
        speedZonesGroupRef.current = speedZonesGroup;

        // Initialize spawner
        // TODO: Re-enable car simulation
        if (false) {
        setLoadingStatus("Initializing traffic simulation...");
        spawner = new Spawner(roadNetwork, {
          maxCars: 650,
          globalSpawnRate: 12.0, // Huge spawn for demo
          despawnRadius: 25,
          defaultCarSpeed: 40,
          carTypeDistribution: {
            sedan: 0.4,
            suv: 0.25,
            truck: 0.15,
            compact: 0.2,
          },
        });

        spawner.initializeQueensSpawnPoints();
        spawner.initializeFromRoadNetwork(70);
        spawnerRef.current = spawner;
        roadNetworkRef.current = roadNetwork;
        onRoadNetworkLoaded?.(roadNetwork);
        console.log(
          `✅ Spawner initialized with ${spawner.getSpawnPoints().length} spawn points`,
        );

        // Initialize analytics
        setLoadingStatus("Setting up analytics...");
        analyticsRef.current = new TrafficAnalytics({
          enablePerformanceMonitoring: true,
          enableTrafficMetrics: true,
          enableIntersectionTracking: true,
          enableNearMissDetection: true,
          nearMissThreshold: 5,
          snapshotInterval: 1000,
          maxHistoryLength: 300,
        });
        console.log("✅ Analytics initialized");

        // Initialize integrated traffic systems
        setLoadingStatus("Initializing traffic infrastructure...");

        // 1. Configuration Manager
        configManagerRef.current = new ConfigurationManager();
        console.log("✅ Configuration manager initialized");

        // 2. Traffic Infrastructure Manager
        trafficInfrastructureRef.current = new TrafficInfrastructureManager();

        // 3. Vehicle Physics Engine
        vehiclePhysicsRef.current = new VehiclePhysics();
        console.log("✅ Vehicle physics engine initialized");

        // 4. Collision System with bounds
        collisionSystemRef.current = createCollisionSystem({
          south: 43.64,
          west: -79.395,
          north: 43.66,
          east: -79.365,
        });
        console.log("✅ Collision detection system initialized");

        // 5. Vehicle Behavior Controller
        behaviorControllerRef.current = new VehicleBehaviorController();
        console.log("✅ Behavior controller initialized");

        // 6. Performance Optimization Systems
        vehiclePoolRef.current = new VehiclePool(150);
        lodManagerRef.current = new LODManager();
        staggeredUpdateRef.current = new StaggeredUpdateManager(4);
        perfMonitorRef.current = new PerformanceMonitor();
        console.log("✅ Performance optimization systems initialized");

        // Add all vehicle pool meshes to scene
        const pooledMeshes = vehiclePoolRef.current.getAllMeshes();
        console.log(
          `📦 Adding ${pooledMeshes.length} pooled vehicle meshes to scene`,
        );
        pooledMeshes.forEach((mesh) => {
          groups.dynamicObjects.add(mesh);
          mesh.visible = false; // Start hidden
        });
        console.log(
          `✅ Vehicle pool meshes added to scene (${groups.dynamicObjects.children.length} total objects in dynamicObjects)`,
        );

        } // end disabled car simulation

        // Road network is always needed for traffic impact analysis
        roadNetworkRef.current = roadNetwork;
        onRoadNetworkLoaded?.(roadNetwork);

        // Fetch and setup traffic lights using Traffic Infrastructure Manager
        setLoadingStatus("Setting up traffic lights...");
        const osmTrafficSignals = await fetchAllTrafficSignals();

        if (osmTrafficSignals.length > 0 && trafficInfrastructureRef.current) {
          // Load traffic controls into infrastructure manager
          trafficInfrastructureRef.current.loadFromOSM(osmTrafficSignals);
          console.log(
            `🚦 Loaded ${osmTrafficSignals.length} traffic controls from OSM`,
          );

          // SMART INTERSECTION-BASED PLACEMENT
          // 1. Find actual road intersections
          const intersections = roadNetwork.findIntersections();
          console.log(`🚦 Found ${intersections.length} road intersections`);

          const signals = trafficInfrastructureRef.current.getSignals();

          // 2. For each intersection, check if there's a traffic signal nearby
          intersections.forEach((intersection) => {
            // Find closest OSM traffic signal within 50 meters
            let closestSignal = null;
            let minDist = 50; // meters

            signals.forEach((signal) => {
              const dist = turf.distance(
                turf.point(intersection.position),
                turf.point(signal.position),
                { units: "meters" },
              );

              if (dist < minDist) {
                closestSignal = signal;
                minDist = dist;
              }
            });

            if (!closestSignal) return; // No signal at this intersection

            // 3. Get all roads approaching this intersection
            const approachingEdges = roadNetwork.getNodeEdges(intersection.id);

            // 4. Place one traffic light for each approach direction
            approachingEdges.forEach((edge, idx) => {
              const bearing = roadNetwork.getEdgeBearingAtNode(
                edge,
                intersection.id,
              );

              // Create mesh for this approach
              const mesh = createTrafficLightModel();
              const worldPos = CityProjection.projectToWorld(
                intersection.position,
              );

              // Place light on the FAR side of intersection (where traffic goes)
              // Offset 20m in the direction the traffic is heading (50% of original)
              const offsetDistance = 20; // meters in world units
              const offsetX =
                Math.sin((bearing * Math.PI) / 180) * offsetDistance;
              const offsetZ =
                Math.cos((bearing * Math.PI) / 180) * offsetDistance;

              mesh.position.set(
                worldPos.x + offsetX,
                worldPos.y,
                worldPos.z + offsetZ,
              );

              // Rotate to face oncoming traffic
              mesh.rotation.y = ((-bearing + 180) * Math.PI) / 180;

              groups.dynamicObjects.add(mesh);

              // Link to signal (all share same signal state)
              if (idx === 0) {
                closestSignal.mesh = mesh;
              }
            });
          });

          console.log(
            `✅ Placed traffic lights at ${intersections.length} intersections`,
          );

          // Initialize Signal Coordinator for green wave coordination
          if (signalCoordinatorRef.current) {
            signalCoordinatorRef.current = createSignalCoordinator(
              trafficInfrastructureRef.current,
              true, // Auto-analyze and apply coordination
            );
            console.log("✅ Signal coordination initialized");
          }
        }

        // Start animation loop
        setLoadingStatus("Starting simulation...");
        startAnimationLoop();

        // Show the scene immediately with the default wide city view
        setIsReady(true);
        setError(null);
        setLoadingStatus("Ready");
      } catch (err) {
        console.error("Error initializing scene:", err);
        setError(
          err instanceof Error ? err.message : "Failed to initialize scene",
        );
        setLoadingStatus("Error");
      }
    }

    function updateTrafficLights() {
      // Update traffic infrastructure manager (handles signal state transitions)
      if (trafficInfrastructureRef.current) {
        const deltaTime = 16.67; // Approximate ms since last frame (60 FPS)
        trafficInfrastructureRef.current.update(deltaTime);

        // Sync visual meshes with infrastructure manager state
        const signals = trafficInfrastructureRef.current.getSignals();
        signals.forEach((signal) => {
          // Update corresponding traffic light in the old array
          const oldLight = trafficLights.find((l) => l.id === signal.id);
          if (oldLight) {
            oldLight.state = signal.state;
            oldLight.timer = signal.timer;
          }

          // Update 3D mesh visualization
          if (signal.mesh) {
            const redLight = signal.mesh.getObjectByName("red") as THREE.Mesh;
            const yellowLight = signal.mesh.getObjectByName(
              "yellow",
            ) as THREE.Mesh;
            const greenLight = signal.mesh.getObjectByName(
              "green",
            ) as THREE.Mesh;

            if (redLight && yellowLight && greenLight) {
              const redMaterial =
                redLight.material as THREE.MeshStandardMaterial;
              const yellowMaterial =
                yellowLight.material as THREE.MeshStandardMaterial;
              const greenMaterial =
                greenLight.material as THREE.MeshStandardMaterial;

              // Fix: update BOTH base color and emissive so inactive lights
              // appear dark/off rather than staying their bright base color.
              const isRed = signal.state === "red";
              const isYellow = signal.state === "yellow";
              const isGreen = signal.state === "green";

              redMaterial.color.setHex(isRed ? 0xff0000 : 0x1a0000);
              redMaterial.emissive.setHex(isRed ? 0xff0000 : 0x1a0000);
              redMaterial.emissiveIntensity = isRed ? 2.5 : 0.1;

              yellowMaterial.color.setHex(isYellow ? 0xffff00 : 0x1a1a00);
              yellowMaterial.emissive.setHex(isYellow ? 0xffff00 : 0x1a1a00);
              yellowMaterial.emissiveIntensity = isYellow ? 2.5 : 0.1;

              greenMaterial.color.setHex(isGreen ? 0x00ff00 : 0x001a00);
              greenMaterial.emissive.setHex(isGreen ? 0x00ff00 : 0x001a00);
              greenMaterial.emissiveIntensity = isGreen ? 2.5 : 0.1;
            }
          }
        });
      }
    }

    function startAnimationLoop() {
      let lastTime = Date.now();

      function animate() {
        if (
          !sceneRef.current ||
          !cameraRef.current ||
          !rendererRef.current ||
          !controlsRef.current
        ) {
          return;
        }

        const currentTime = Date.now();
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Analytics: Track frame start
        const frameStartTime = performance.now();
        if (analyticsRef.current) {
          analyticsRef.current.onFrameStart(currentTime);
        }

        // Update traffic lights
        updateTrafficLights();

        // Analytics: Track update start
        const updateStartTime = performance.now();

        // Update spawner
        if (spawner) {
          spawner.update(deltaTime);

          const activeCars = spawner.getActiveCars();
          const processedCarIds = new Set<string>();

          // Debug: Log active car count and positions
          if (
            Math.floor(currentTime / 1000) % 5 === 0 &&
            currentTime % 1000 < 20
          ) {
            console.log(
              `🚗 Active cars: ${activeCars.length}, Meshes: ${Object.keys(carMeshes).length}`,
            );
            if (activeCars.length > 0 && cameraRef.current) {
              const firstCar = activeCars[0];
              const firstMesh = carMeshes[firstCar.id];
              console.log(
                `📍 Camera: [${cameraRef.current.position.x.toFixed(0)}, ${cameraRef.current.position.y.toFixed(0)}, ${cameraRef.current.position.z.toFixed(0)}]`,
              );
              if (firstMesh) {
                console.log(
                  `📍 First car (${firstCar.id}): [${firstMesh.position.x.toFixed(0)}, ${firstMesh.position.y.toFixed(0)}, ${firstMesh.position.z.toFixed(0)}], visible: ${firstMesh.visible}, scale: ${firstMesh.scale.x}`,
                );
                const distance = cameraRef.current.position.distanceTo(
                  firstMesh.position,
                );
                console.log(
                  `📏 Distance from camera to first car: ${distance.toFixed(0)} units`,
                );
              }
            }
          }

          // Update collision system spatial grid
          if (collisionSystemRef.current) {
            collisionSystemRef.current.updateGrid(activeCars);
          }

          // Update LOD manager camera position
          if (lodManagerRef.current && cameraRef.current) {
            lodManagerRef.current.updateCameraPosition(cameraRef.current);
          }

          // Performance monitor - record frame
          if (perfMonitorRef.current) {
            perfMonitorRef.current.recordFrame();
          }

          // Construction zone counters (accumulated during car loop)
          let czRedCount = 0;
          let czSpeedSum = 0;
          let czTotalInZone = 0;

          // Update each active car with integrated systems
          activeCars.forEach((spawnedCar) => {
            processedCarIds.add(spawnedCar.id);

            // Create mesh if needed (using vehicle pool for performance)
            if (!carMeshes[spawnedCar.id]) {
              let mesh: EnhancedVehicleMesh | null = null;

              // Try to get from pool
              if (vehiclePoolRef.current) {
                mesh = vehiclePoolRef.current.acquire(
                  spawnedCar.type,
                  spawnedCar.color,
                );
                if (mesh) {
                  console.log(
                    `♻️ Acquired pooled mesh for ${spawnedCar.id} (${spawnedCar.type})`,
                  );
                }
              }

              // Fallback to creating new mesh
              if (!mesh) {
                console.log(
                  `🆕 Creating new mesh for ${spawnedCar.id} (${spawnedCar.type})`,
                );
                mesh = createEnhancedCarModel(
                  spawnedCar.type,
                  spawnedCar.color,
                );
                groupsRef.current?.dynamicObjects.add(mesh);
              }

              carMeshes[spawnedCar.id] = mesh;
              carMeshesRef.current[spawnedCar.id] = mesh;
              (mesh as THREE.Mesh).userData.carId = spawnedCar.id;
              spawnedCar.meshRef = mesh; // Link mesh to car data
              console.log(
                `✅ Mesh ${mesh ? "created" : "FAILED"} for ${spawnedCar.id}, visible: ${mesh?.visible}, parent: ${mesh?.parent?.type}`,
              );

              // Register for staggered updates
              if (staggeredUpdateRef.current) {
                staggeredUpdateRef.current.register(spawnedCar.id);
              }

              // Analytics: Track spawn
              if (analyticsRef.current) {
                analyticsRef.current.trackSpawn();
              }
            }

            // INTEGRATED SIMULATION PIPELINE:
            // 1. Behavior evaluation (traffic rules, signals, following)
            // 2. Physics update (acceleration, velocity)
            // 3. Collision detection
            // 4. Position update
            // 5. Visual updates (lights, LOD)

            const allCarsMap = new Map(activeCars.map((car) => [car.id, car]));

            // 1. Evaluate vehicle behavior
            if (
              behaviorControllerRef.current &&
              trafficInfrastructureRef.current &&
              collisionSystemRef.current
            ) {
              const behaviorResult = behaviorControllerRef.current.evaluate(
                spawnedCar,
                {
                  infrastructureManager: trafficInfrastructureRef.current,
                  collisionSystem: collisionSystemRef.current,
                  allVehicles: allCarsMap,
                  deltaTime,
                },
              );

              spawnedCar.targetSpeed = behaviorResult.targetSpeed;
              spawnedCar.acceleration = behaviorResult.acceleration;
              spawnedCar.currentBehavior = behaviorResult.state;
              spawnedCar.behaviorReason = behaviorResult.reason;

              // Apply behavior to speed
              behaviorControllerRef.current.applyBehavior(
                spawnedCar,
                behaviorResult,
                deltaTime,
              );
            } else {
              // FALLBACK: If behavior system not working, just set speed directly!
              if (!spawnedCar.speed || spawnedCar.speed < 5) {
                spawnedCar.speed = spawnedCar.maxSpeed;
                spawnedCar.targetSpeed = spawnedCar.maxSpeed;
              }
            }

            // Construction zone: simple car-to-building distance → 10 km/h + status
            if (placedBuildings?.length) {
              const carPoint = turf.point(spawnedCar.position);
              let minDistM = Infinity;
              for (const b of placedBuildings) {
                const d = turf.distance(carPoint, turf.point([b.lng, b.lat]), {
                  units: "meters",
                });
                if (d < minDistM) minDistM = d;
              }
              if (minDistM < CONSTRUCTION_ZONE_RADIUS_M) {
                spawnedCar.targetSpeed = Math.min(
                  spawnedCar.targetSpeed,
                  CONSTRUCTION_ZONE_SPEED_LIMIT,
                );
                spawnedCar.speed = Math.min(
                  spawnedCar.speed,
                  CONSTRUCTION_ZONE_SPEED_LIMIT,
                );
                spawnedCar.behaviorReason =
                  "Near construction site – driving slowly";
                czRedCount++;
                czSpeedSum += spawnedCar.speed;
                czTotalInZone++;
              }
            }

            // If car is stuck at 0 but not at a signal/sign, force a small creep so it moves
            const stoppedAtControl =
              spawnedCar.currentBehavior === "stopped_at_signal" ||
              spawnedCar.currentBehavior === "stopped_at_sign";
            if (
              spawnedCar.speed === 0 &&
              spawnedCar.route &&
              !stoppedAtControl
            ) {
              spawnedCar.speed = 2; // 2 km/h creep
            }

            // 2. Update position along route
            spawner.updateCarPosition(spawnedCar.id, deltaTime);

            // 3. Update visual mesh
            const mesh = carMeshes[spawnedCar.id] as EnhancedVehicleMesh;
            if (mesh) {
              const worldPos = CityProjection.projectToWorld(
                spawnedCar.position,
              );
              mesh.position.set(worldPos.x, worldPos.y + 1, worldPos.z);
              mesh.rotation.y = (-spawnedCar.bearing * Math.PI) / 180;

              // Debug: Log first car position once
              if (
                spawnedCar.id === "car-0" &&
                Math.floor(currentTime / 1000) === 1
              ) {
                console.log(
                  `🎯 Car position - Lat/Lon: [${spawnedCar.position}], World: [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}], Visible: ${mesh.visible}, In scene: ${mesh.parent !== null}`,
                );
              }

              // 4. Update turn signals
              updateTurnSignals(mesh, spawnedCar.bearing, deltaTime);

              // 5. Update brake lights (braking if deceleration > 2 m/s²)
              const isBreaking = spawnedCar.acceleration < -2.0;
              updateBrakeLights(mesh, isBreaking);

              // 6. Apply LOD based on distance from camera
              if (lodManagerRef.current) {
                const currentLOD = mesh.userData.lodLevel || "full";
                const newLOD = lodManagerRef.current.calculateLODLevel(
                  mesh.position,
                );
                if (newLOD !== currentLOD) {
                  lodManagerRef.current.applyLOD(mesh, newLOD, currentLOD);
                  mesh.userData.lodLevel = newLOD;
                }
              }
            }
          });

          // Update construction zone metrics for debug overlay
          constructionZoneRef.current = {
            vehiclesInZone: czRedCount,
            avgSpeedInZone: czTotalInZone > 0 ? czSpeedSum / czTotalInZone : 0,
          };

          // Remove meshes for despawned cars
          Object.entries(carMeshes).forEach(([carId, mesh]) => {
            if (!processedCarIds.has(carId)) {
              // Return to pool if using vehicle pool
              if (vehiclePoolRef.current && mesh instanceof THREE.Mesh) {
                vehiclePoolRef.current.release(mesh as EnhancedVehicleMesh);
              } else {
                groupsRef.current?.dynamicObjects.remove(mesh);
              }

              delete carMeshes[carId];
              delete carMeshesRef.current[carId];

              // Unregister from staggered updates
              if (staggeredUpdateRef.current) {
                staggeredUpdateRef.current.unregister(carId);
              }

              // Clear behavior state
              if (behaviorControllerRef.current) {
                behaviorControllerRef.current.resetVehicleState(carId);
              }

              // Analytics: Track despawn
              if (analyticsRef.current) {
                analyticsRef.current.trackDespawn();
              }
            }
          });

          // Advance staggered update manager
          if (staggeredUpdateRef.current) {
            staggeredUpdateRef.current.nextFrame();
          }
        }

        // Analytics: Record update time
        const updateEndTime = performance.now();
        if (analyticsRef.current) {
          analyticsRef.current.recordUpdateTime(
            updateEndTime - updateStartTime,
          );
        }

        // Update tweens
        updateTweens();

        // Update construction noise ripple animation
        const rippleGroup = noiseRippleGroupRef.current;
        if (rippleGroup) {
          rippleTimeRef.current += deltaTime;
          const RIPPLE_DURATION = 3;
          const BASE_MAX_SCALE = 1400 / 50;
          rippleGroup.children.forEach((child) => {
            const mesh = child as THREE.Mesh;
            const phaseOffset = mesh.userData?.phaseOffset as
              | number
              | undefined;
            const intensity = (mesh.userData?.intensity as number) ?? 1;
            if (phaseOffset == null) return;
            const phase =
              ((rippleTimeRef.current + phaseOffset) % RIPPLE_DURATION) /
              RIPPLE_DURATION;
            const maxScale = BASE_MAX_SCALE * intensity;
            const scale = phase * maxScale;
            mesh.scale.set(scale, scale, scale);
            const mat = mesh.material as THREE.MeshBasicMaterial;
            if (mat.transparent)
              mat.opacity = (0.65 + 0.3 * intensity) * (1 - phase);
          });
        }

        // Update wind particle simulation
        if (windVizRef.current) {
          windVizRef.current.update(deltaTime);
        }

        // Update WASD keyboard movement + orbit controls
        if (isInStreetMode()) {
          updateStreetWalkMovement(cameraRef.current, controlsRef.current, deltaTime);
        } else {
          updateKeyboardMovement(cameraRef.current, controlsRef.current, deltaTime);
        }
        controlsRef.current.update();

        // Apply time-of-day lighting
        if (directionalLightRef.current && ambientLightRef.current) {
          const hour = timeOfDayHourRef.current;
          const todConfig = computeTimeOfDay(hour, dayOfYearRef.current);
          applyTimeOfDay(
            todConfig,
            sceneRef.current,
            directionalLightRef.current,
            ambientLightRef.current,
            skyMeshRef.current,
            groundGroupRef.current,
            sunMeshRef.current,
            moonMeshRef.current,
            cameraRef.current,
          );
        }

        // Analytics: Track render start
        const renderStartTime = performance.now();

        // Render with composer if available (for outline effect), otherwise normal render
        if (composerRef.current) {
          composerRef.current.render();
        } else {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }

        // Analytics: Record render time and frame time
        const renderEndTime = performance.now();
        if (analyticsRef.current) {
          analyticsRef.current.recordRenderTime(
            renderEndTime - renderStartTime,
          );
          analyticsRef.current.recordFrameTime(renderEndTime - frameStartTime);

          // Create snapshot with active cars
          if (spawner) {
            analyticsRef.current.createSnapshot(
              spawner.getActiveCars(),
              currentTime,
            );
          }
        }

        animationFrameRef.current = requestAnimationFrame(animate);
      }

      animate();
    }

    // Handle window resize
    function handleWindowResize() {
      if (!canvasRef.current || !cameraRef.current || !rendererRef.current)
        return;

      const width = canvasRef.current.clientWidth;
      const height = canvasRef.current.clientHeight;

      handleResize(cameraRef.current, rendererRef.current, width, height);
    }

    window.addEventListener("resize", handleWindowResize);

    // Start initialization
    initializeScene();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleWindowResize);

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      if (rendererRef.current) {
        rendererRef.current.dispose();
      }

      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      if (keyboardCleanupRef.current) {
        keyboardCleanupRef.current();
      }
    };
  }, []);

  // Sync placed buildings: speed zones, spawns, burst spawn. Re-run when map becomes ready so burst can run.
  useEffect(() => {
    const spawner = spawnerRef.current;
    const roadNetwork = roadNetworkRef.current;
    const speedZonesGroup = speedZonesGroupRef.current;

    if (!spawner || !roadNetwork) return;

    if (!placedBuildings?.length) {
      spawner.setBlockedEdges(new Set());
      spawner.setBuildingVicinitySpawning([]);
      if (speedZonesGroup) {
        while (speedZonesGroup.children.length > 0) {
          speedZonesGroup.remove(speedZonesGroup.children[0]);
        }
      }
      return;
    }

    spawner.setBlockedEdges(new Set());
    spawner.setBuildingVicinitySpawning(
      placedBuildings.map((b) => ({ id: b.id, position: [b.lng, b.lat] })),
    );

    // Construction zone: red strips on nearby roads + border ring
    if (speedZonesGroup) {
      while (speedZonesGroup.children.length > 0) {
        speedZonesGroup.remove(speedZonesGroup.children[0]);
      }
      const zoneRadiusScene = CONSTRUCTION_ZONE_RADIUS_M * MAP_SCALE;
      const stripWidth = 6 * MAP_SCALE * 2; // ~2 lanes wide

      placedBuildings.forEach((b) => {
        const buildingPos: [number, number] = [b.lng, b.lat];
        const world = CityProjection.projectToWorld(buildingPos);

        // Thin red ring border around the zone
        const border = createConstructionZoneBorder(zoneRadiusScene);
        border.position.set(world.x, world.y, world.z);
        speedZonesGroup.add(border);

        // Paint entire nearby road edges red
        const nearEdges = roadNetwork.findEdgesNearPosition(
          buildingPos,
          CONSTRUCTION_ZONE_RADIUS_M,
        );
        nearEdges.forEach((edge) => {
          if (!edge.geometry || edge.geometry.length < 2) return;
          const worldPoints = edge.geometry.map((coord) =>
            CityProjection.projectToWorld(coord as [number, number]),
          );
          const strip = createRedStripOnRoad(worldPoints, stripWidth);
          strip.name = "red-strip-road";
          speedZonesGroup.add(strip);
        });
      });
    }

    const buildingsList = placedBuildings.map((b) => ({
      id: b.id,
      position: [b.lng, b.lat] as [number, number],
    }));
    const burstCount = spawner.burstSpawnNearBuildings(buildingsList);
    if (burstCount > 0) {
      console.log(
        `🚧 Burst spawned ${burstCount} cars near placed building(s)`,
      );
    }

    // Keep spamming cars: if area is empty or below cap, burst again every 2.5s
    const interval = setInterval(() => {
      const s = spawnerRef.current;
      if (!s || !placedBuildings?.length) return;
      const active = s.getActiveCars().length;
      const maxCars = 400;
      if (active >= maxCars) return;
      const added = s.burstSpawnNearBuildings(buildingsList);
      if (added > 0) {
        console.log(
          `🚧 Top-up spawned ${added} cars (${active + added} total)`,
        );
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [placedBuildings, isReady]);

  // Click handler to find coordinates or select buildings
  useEffect(() => {
    function handleCanvasClick(event: MouseEvent) {
      if (
        !canvasRef.current ||
        !cameraRef.current ||
        !sceneRef.current ||
        !groupsRef.current
      ) {
        return;
      }

      // Calculate mouse position in normalized device coordinates (-1 to +1)
      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster with mouse position
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);

      // Check if we clicked on a car (show details panel)
      const carMeshList = Object.values(carMeshesRef.current);
      if (carMeshList.length > 0) {
        const carIntersects = raycasterRef.current.intersectObjects(
          carMeshList,
          true,
        );
        if (carIntersects.length > 0) {
          let obj: THREE.Object3D | null = carIntersects[0].object;
          while (obj && obj.userData.carId == null) obj = obj.parent;
          if (obj?.userData.carId) {
            setSelectedCarId(obj.userData.carId as string);
            if (onBuildingSelect) onBuildingSelect(null);
            setSelectedOsmBuildingId(null);
            return;
          }
        }
      }

      // Clear car selection when clicking elsewhere
      setSelectedCarId(null);

      // Check if we clicked on a custom placed building first
      const buildingObjects = Array.from(buildingModelsRef.current.values());
      const buildingIntersects = raycasterRef.current.intersectObjects(
        buildingObjects,
        true,
      );

      if (buildingIntersects.length > 0 && !isPlacementMode) {
        // Find which building was clicked
        let clickedBuilding: THREE.Object3D | null =
          buildingIntersects[0].object;
        while (clickedBuilding && !clickedBuilding.userData.buildingId) {
          clickedBuilding = clickedBuilding.parent;
        }

        if (
          clickedBuilding &&
          clickedBuilding.userData.buildingId &&
          onBuildingSelect
        ) {
          onBuildingSelect(clickedBuilding.userData.buildingId);
          setSelectedOsmBuildingId(null);
          return; // Don't process as coordinate click
        }
      }

      // Check if we clicked on an OSM building (from buildings.json)
      const osmBuildingObjects = Array.from(
        osmBuildingMeshesRef.current.values(),
      );
      const osmBuildingIntersects = raycasterRef.current.intersectObjects(
        osmBuildingObjects,
        true,
      );

      if (osmBuildingIntersects.length > 0 && !isPlacementMode) {
        // Walk up from the hit mesh to find the building group with userData
        let target: THREE.Object3D | null = osmBuildingIntersects[0].object;
        while (target && !target.userData.isOsmBuilding) {
          target = target.parent;
        }
        if (target?.userData.isOsmBuilding && target.userData.buildingId) {
          const buildingId = target.userData.buildingId;
          // Resolve clicked building → its cluster root ID (touching buildings = one entity)
          const clusterId =
            clusterIndexRef.current?.clusterIdByBuildingId.get(buildingId) ??
            buildingId;
          console.log(
            "Clicked OSM building:",
            buildingId,
            "→ cluster:",
            clusterId,
          );
          setSelectedOsmBuildingId(clusterId);
          if (onBuildingSelect) {
            onBuildingSelect(null); // Deselect custom building
          }
          return; // Don't process as coordinate click
        }
      }

      // Barricade mode: raycast against road meshes to toggle barricades
      if (isBarricadeMode && onBarricadeToggle && groupsRef.current) {
        const roadMeshes = groupsRef.current.staticGeometry.children.filter(
          (child) => child.userData.isRoad === true,
        );
        const roadIntersects = raycasterRef.current.intersectObjects(roadMeshes, true);
        if (roadIntersects.length > 0) {
          let target: THREE.Object3D | null = roadIntersects[0].object;
          while (target && !target.userData.isRoad) target = target.parent;
          if (target && target.name.startsWith("road-")) {
            const edgeId = target.name.replace("road-", "");
            // Toggle both forward and reverse edges
            const baseId = edgeId.replace(/-reverse$/, "");
            onBarricadeToggle(baseId);
            return;
          }
        }
      }

      // For placement mode, check for building collisions first
      if (isPlacementMode && buildingIntersects.length > 0) {
        // Prevent placing a building on top of another building
        console.warn("Cannot place building on top of another building");
        return;
      }

      // For placement mode, only raycast against ground and static geometry
      // For normal mode, raycast against everything
      let intersects;
      if (isPlacementMode) {
        const targetObjects = [
          ...groupsRef.current.environment.children,
          ...groupsRef.current.staticGeometry.children,
        ];
        intersects = raycasterRef.current.intersectObjects(targetObjects, true);
      } else {
        intersects = raycasterRef.current.intersectObjects(
          sceneRef.current.children,
          true,
        );
      }

      if (intersects.length > 0) {
        // Get the first intersection point
        const intersectionPoint = intersects[0].point;

        // Convert world coordinates to lat/lng
        const [lng, lat] = CityProjection.unprojectFromWorld(intersectionPoint);

        // Call the callback with the clicked coordinate
        const coordinate = {
          lat,
          lng,
          worldX: intersectionPoint.x,
          worldY: intersectionPoint.y,
          worldZ: intersectionPoint.z,
          ghostRotationY: isPlacementMode ? ghostRotationY : undefined,
        };

        if (onCoordinateClick) {
          onCoordinateClick(coordinate);
        }

        // Deselect buildings if clicking elsewhere
        if (onBuildingSelect && !isPlacementMode) {
          onBuildingSelect(null);
        }
        setSelectedOsmBuildingId(null);

        console.log("Clicked coordinate:", {
          lat,
          lng,
          worldPos: intersectionPoint,
        });
      }
    }

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("click", handleCanvasClick);
      return () => canvas.removeEventListener("click", handleCanvasClick);
    }
  }, [onCoordinateClick, onBuildingSelect, isPlacementMode, ghostRotationY]);

  // Refresh car details panel periodically when a car is selected (live speed/behavior)
  useEffect(() => {
    if (!selectedCarId) return;
    const id = setInterval(() => setCarPanelTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [selectedCarId]);

  // Keyboard controls for rotating ghost building during placement mode
  useEffect(() => {
    if (!isPlacementMode) return;

    function handleKeyDown(event: KeyboardEvent) {
      // Don't interfere with text inputs
      if ((event.target as HTMLElement).tagName === "INPUT") return;

      const rotationStep = event.shiftKey ? Math.PI / 4 : Math.PI / 12; // 45° or 15°

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setGhostRotationY((prev) => prev + rotationStep); // Counter-clockwise
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setGhostRotationY((prev) => prev - rotationStep); // Clockwise
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlacementMode]);

  // Apply rotation to ghost model when ghostRotationY changes
  useEffect(() => {
    if (ghostModelRef.current) {
      ghostModelRef.current.rotation.y = ghostRotationY;
    }
  }, [ghostRotationY]);

  // Handle OSM building deletion
  const deleteOsmBuilding = async (buildingId: string, skipApiCall = false) => {
    try {
      // Remove from scene
      const group = osmBuildingMeshesRef.current.get(buildingId);
      if (group && groupsRef.current) {
        groupsRef.current.staticGeometry.remove(group);
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        osmBuildingMeshesRef.current.delete(buildingId);
      }

      // Call API to remove from buildings.json (unless skipped for batch operations)
      if (!skipApiCall) {
        const response = await fetch(`/api/map/buildings/${buildingId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          const result = await response.json();
          console.log(`✅ Deleted building ${buildingId}:`, result);
          if (onOsmBuildingDelete) {
            onOsmBuildingDelete(buildingId);
          }
        } else {
          console.error("Failed to delete building from server");
        }
      }

      setSelectedOsmBuildingId(null);
    } catch (error) {
      console.error("Error deleting OSM building:", error);
    }
  };

  // Check for collisions between a loaded 3D model and all OSM buildings
  const checkAndDeleteCollidingBuildings = async (
    loadedModel: THREE.Object3D,
  ) => {
    if (!groupsRef.current || osmBuildingMeshesRef.current.size === 0) return;

    const collidingIds: string[] = [];

    // Get the actual bounding box of the loaded model
    const placedBox = new THREE.Box3().setFromObject(loadedModel);

    console.log(`📦 Checking collisions for placed building. Bounding box:`, {
      min: placedBox.min,
      max: placedBox.max,
      size: placedBox.getSize(new THREE.Vector3()),
    });

    // Check each OSM building for collision
    osmBuildingMeshesRef.current.forEach((mesh, buildingId) => {
      // Compute bounding box for the OSM building
      const osmBox = new THREE.Box3().setFromObject(mesh);

      // Check for intersection
      if (placedBox.intersectsBox(osmBox)) {
        collidingIds.push(buildingId);
        console.log(`  ⚠️ Collision detected with: ${buildingId}`);
      }
    });

    if (collidingIds.length > 0) {
      console.log(
        `🔄 Found ${collidingIds.length} colliding OSM buildings, removing all...`,
      );

      // Delete all colliding buildings from scene immediately
      for (const buildingId of collidingIds) {
        const group = osmBuildingMeshesRef.current.get(buildingId);
        if (group && groupsRef.current) {
          groupsRef.current.staticGeometry.remove(group);
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material instanceof THREE.Material) {
                child.material.dispose();
              }
            }
          });
          osmBuildingMeshesRef.current.delete(buildingId);
          console.log(`  🗑️ Removed from scene: ${buildingId}`);
        }
      }

      // Batch delete from server
      try {
        const response = await fetch("/api/map/buildings/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: collidingIds }),
        });

        if (response.ok) {
          const result = await response.json();
          console.log(
            `✅ Batch deleted ${result.deletedCount} buildings from server`,
          );
        }
      } catch (error) {
        console.error("Error batch deleting buildings:", error);
      }
    } else {
      console.log(`✅ No collisions detected`);
    }
  };

  // Load and display placed buildings
  useEffect(() => {
    if (!groupsRef.current || !isReady) return;

    const loader = new GLTFLoader();

    // Track which buildings currently exist
    const currentBuildingIds = new Set(placedBuildings.map((b) => b.id));

    // Remove buildings that no longer exist
    const existingIds = Array.from(buildingModelsRef.current.keys());
    existingIds.forEach((id) => {
      if (!currentBuildingIds.has(id)) {
        const model = buildingModelsRef.current.get(id);
        if (model) {
          groupsRef.current?.dynamicObjects.remove(model);
          buildingModelsRef.current.delete(id);
          console.log(`🗑️ Removed building ${id}`);
        }
        // Also remove associated trees
        const trees = buildingTreesRef.current.get(id);
        if (trees) {
          groupsRef.current?.dynamicObjects.remove(trees);
          buildingTreesRef.current.delete(id);
          console.log(`🌲 Removed trees for building ${id}`);
        }
      }
    });

    // Load new buildings (only ones that don't exist yet)
    placedBuildings.forEach((building) => {
      // Skip if this building is already loaded
      if (buildingModelsRef.current.has(building.id)) {
        return;
      }

      loader.load(
        building.modelPath,
        (gltf) => {
          const model = gltf.scene;
          model.userData.isCustomBuilding = true;
          model.userData.buildingId = building.id;
          model.userData.timeline = building.timeline;

          // Enable shadow casting/receiving on all meshes
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Position the model
          model.position.set(
            building.position.x,
            building.position.y,
            building.position.z,
          );

          // Rotation
          if (building.rotation) {
            model.rotation.set(
              building.rotation.x,
              building.rotation.y,
              building.rotation.z,
            );
          }

          // Scale - use per-building scale if available, otherwise use global buildingScale
          const scale = building.scale || buildingScale;
          model.scale.set(scale.x, scale.y, scale.z);

          let toAdd: THREE.Group = model as THREE.Group;

          if (building.timeline?.startDate && building.timeline?.durationDays) {
            const wrapper = new THREE.Group();
            wrapper.position.copy(model.position);
            wrapper.rotation.copy(model.rotation);
            wrapper.scale.copy(model.scale);
            model.position.set(0, 0, 0);
            model.rotation.set(0, 0, 0);
            model.scale.set(1, 1, 1);
            wrapper.add(model);

            const wireframe = model.clone(true);
            wireframe.traverse((child) => {
              if (child instanceof THREE.Mesh && child.material) {
                const mat = new THREE.MeshBasicMaterial({
                  color: 0x003f7c,
                  wireframe: true,
                  transparent: true,
                  opacity: 0.6,
                  depthTest: true,
                  depthWrite: false,
                });
                child.material = mat;
              }
            });
            wrapper.add(wireframe);
            wrapper.userData.solidModel = model;
            wrapper.userData.buildingId = building.id;
            wrapper.userData.timeline = building.timeline;
            toAdd = wrapper;
          }

          groupsRef.current?.dynamicObjects.add(toAdd);
          buildingModelsRef.current.set(building.id, toAdd);

          toAdd.updateMatrixWorld(true);
          checkAndDeleteCollidingBuildings(toAdd);

          console.log(
            `✅ Loaded building ${building.id} at (${building.position.x.toFixed(1)}, ${building.position.z.toFixed(1)})`,
          );

          // Always generate trees around the building
          const treeConfig =
            building.treeConfig || getDefaultTreeConfigForMap();
          const forcedTreeConfig = { ...treeConfig, enabled: true };
          if (groupsRef.current) {
            const bbox = new THREE.Box3().setFromObject(toAdd);
            const size = bbox.getSize(new THREE.Vector3());
            const buildingWidth = size.x;
            const buildingDepth = size.z;
            const buildingScaleValue = scale.x;

            const otherBuildings: THREE.Object3D[] = [];
            buildingModelsRef.current.forEach((otherModel, otherId) => {
              if (otherId !== building.id) {
                otherBuildings.push(otherModel);
              }
            });
            osmBuildingMeshesRef.current.forEach((osmMesh) => {
              otherBuildings.push(osmMesh);
            });

            const treeGroup = renderTreesAroundBuilding(
              building.position,
              buildingWidth,
              buildingDepth,
              forcedTreeConfig,
              groupsRef.current.dynamicObjects,
              buildingScaleValue,
              toAdd,
              groupsRef.current.staticGeometry,
              otherBuildings,
            );
            buildingTreesRef.current.set(building.id, treeGroup);
          }
        },
        undefined,
        (error) => {
          console.error(`❌ Error loading building model:`, error);
        },
      );
    });
  }, [placedBuildings, isReady, buildingScale]);

  // Load ghost preview model
  useEffect(() => {
    if (!isPlacementMode || !groupsRef.current) {
      // Remove ghost if placement mode is off
      if (ghostModelRef.current && groupsRef.current) {
        groupsRef.current.dynamicObjects.remove(ghostModelRef.current);
        ghostModelRef.current = null;
      }
      setGhostPosition(null);
      return;
    }

    // Use custom model path if available, otherwise use default
    const modelPath =
      customModelPath || "/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf";

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        // Remove any existing ghost first
        if (ghostModelRef.current && groupsRef.current) {
          groupsRef.current.dynamicObjects.remove(ghostModelRef.current);
        }

        const ghost = gltf.scene;
        ghost.scale.set(buildingScale.x, buildingScale.y, buildingScale.z);

        // Make it semi-transparent green
        ghost.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const material = new THREE.MeshBasicMaterial({
              color: 0x00ff00,
              transparent: true,
              opacity: 0.3,
              wireframe: false,
            });
            mesh.material = material;
          }
        });

        ghostModelRef.current = ghost;
        groupsRef.current?.dynamicObjects.add(ghost);
        ghost.visible = false; // Hide until we have a position

        console.log(`✅ Ghost preview loaded: ${modelPath}`);
      },
      undefined,
      (error) => console.error("Error loading ghost model:", error),
    );

    return () => {
      if (ghostModelRef.current && groupsRef.current) {
        groupsRef.current.dynamicObjects.remove(ghostModelRef.current);
        ghostModelRef.current = null;
      }
    };
  }, [isPlacementMode, buildingScale, customModelPath]);

  // Update ghost scale when buildingScale changes
  useEffect(() => {
    if (ghostModelRef.current) {
      ghostModelRef.current.scale.set(
        buildingScale.x,
        buildingScale.y,
        buildingScale.z,
      );
    }
  }, [buildingScale]);

  // Highlight selected building
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    // Setup composer if not exists
    if (!composerRef.current && rendererRef.current) {
      const composer = new EffectComposer(rendererRef.current);
      const renderPass = new RenderPass(sceneRef.current, cameraRef.current);
      composer.addPass(renderPass);

      const outlinePass = new OutlinePass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        sceneRef.current,
        cameraRef.current,
      );
      outlinePass.edgeStrength = 5;
      outlinePass.edgeGlow = 1;
      outlinePass.edgeThickness = 2;
      outlinePass.visibleEdgeColor.set("#FFD700");
      outlinePass.hiddenEdgeColor.set("#FFD700");

      composer.addPass(outlinePass);
      composerRef.current = composer;
      outlinePassRef.current = outlinePass;
    }

    // Update outline
    if (outlinePassRef.current) {
      const selectedObjects: THREE.Object3D[] = [];

      // Check for selected custom building
      if (selectedBuildingId) {
        const selectedModel = buildingModelsRef.current.get(selectedBuildingId);
        if (selectedModel) {
          selectedObjects.push(selectedModel);
        }
      }

      // Check for selected OSM building → outline the entire cluster
      if (selectedOsmBuildingId) {
        const cluster = clusterIndexRef.current?.clusterById.get(
          selectedOsmBuildingId,
        );
        const ids = cluster?.buildingIds ?? [selectedOsmBuildingId];
        for (const id of ids) {
          const mesh = osmBuildingMeshesRef.current.get(id);
          if (mesh) selectedObjects.push(mesh);
        }
      }

      outlinePassRef.current.selectedObjects = selectedObjects;
    }
  }, [selectedBuildingId, selectedOsmBuildingId]);

  // Update building transforms in real-time
  useEffect(() => {
    placedBuildings.forEach((building) => {
      const model = buildingModelsRef.current.get(building.id);
      if (model) {
        model.position.set(
          building.position.x,
          building.position.y,
          building.position.z,
        );
        if (building.rotation) {
          model.rotation.set(
            building.rotation.x,
            building.rotation.y,
            building.rotation.z,
          );
        }
        const scale = building.scale || buildingScale;
        model.scale.set(scale.x, scale.y, scale.z);
        model.userData.timeline = building.timeline;
      }
    });
  }, [placedBuildings, buildingScale]);

  // Cross-section clipping for buildings with timeline
  useEffect(() => {
    const dateStr = timelineDate;
    const currentTime = new Date(dateStr).getTime();

    placedBuildings.forEach((building) => {
      const obj = buildingModelsRef.current.get(building.id);
      if (
        !obj ||
        !building.timeline?.startDate ||
        !building.timeline?.durationDays
      )
        return;

      const solidModel = obj.userData.solidModel ?? (obj as THREE.Group);
      const startTime = new Date(building.timeline.startDate).getTime();
      const elapsedDays = (currentTime - startTime) / (1000 * 60 * 60 * 24);
      const progress = Math.max(
        0,
        Math.min(1, elapsedDays / building.timeline.durationDays),
      );

      solidModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(solidModel);
      const bottomY = box.min.y;
      const fullHeight = box.max.y - box.min.y;
      const visibleTop = bottomY + progress * fullHeight;
      const clipPlane = new THREE.Plane(
        new THREE.Vector3(0, -1, 0),
        visibleTop,
      );

      const applyClip = (target: THREE.Object3D) => {
        target.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => {
              const mat = m as THREE.Material & { clipShading?: number };
              mat.clippingPlanes = [clipPlane];
              mat.clipShading = THREE.DoubleSide;
            });
          }
        });
      };

      const clearClip = (target: THREE.Object3D) => {
        target.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mats = Array.isArray(child.material)
              ? child.material
              : [child.material];
            mats.forEach((m) => {
              (m as THREE.Material).clippingPlanes = [];
            });
          }
        });
      };

      if (progress >= 1) {
        clearClip(solidModel);
      } else {
        applyClip(solidModel);
      }
    });
  }, [placedBuildings, timelineDate]);

  // Construction noise ripple layer – continuous expanding ripple animation
  const RIPPLE_DURATION = 3;
  const RIPPLE_WAVES_PER_SITE = 5;

  useEffect(() => {
    if (!groupsRef.current || !isReady) return;

    if (noiseRippleGroupRef.current) {
      groupsRef.current.dynamicObjects.remove(noiseRippleGroupRef.current);
      noiseRippleGroupRef.current = null;
    }

    if (!showNoiseRipple) return;

    const activeSites = placedBuildings.filter(
      (b) =>
        b.timeline?.startDate &&
        b.timeline?.durationDays &&
        isUnderConstruction(
          b.timeline.startDate,
          b.timeline.durationDays,
          timelineDate,
        ),
    );

    const group = new THREE.Group();
    group.name = "noiseRippleLayer";

    activeSites.forEach((site) => {
      const px = site.position.x;
      const pz = site.position.z;
      const baseY = 0.5;
      const scale = site.scale || buildingScale;
      const hx = scale.x * 0.6;
      const hz = scale.z * 0.6;
      const sourceDb = getConstructionSourceDb(site, timelineDate);
      const intensity = Math.max(0.3, Math.min(1.0, (sourceDb - 70) / 30));

      const perimeterPoints: [number, number][] = [
        [px + hx, pz + hz],
        [px + hx, pz - hz],
        [px - hx, pz + hz],
        [px - hx, pz - hz],
        [px, pz + hz],
        [px, pz - hz],
        [px + hx, pz],
        [px - hx, pz],
      ];

      perimeterPoints.forEach(([rx, rz]) => {
        for (let w = 0; w < RIPPLE_WAVES_PER_SITE; w++) {
          const phaseOffset = (w / RIPPLE_WAVES_PER_SITE) * RIPPLE_DURATION;
          const ringGeom = new THREE.RingGeometry(0, 50, 48);
          const material = new THREE.MeshBasicMaterial({
            color: 0xe74c3c,
            transparent: true,
            opacity: 0.65 + 0.3 * intensity,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const ring = new THREE.Mesh(ringGeom, material);
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(rx, baseY, rz);
          ring.scale.set(0, 0, 0);
          ring.renderOrder = 1;
          ring.userData.phaseOffset = phaseOffset;
          ring.userData.intensity = intensity;
          group.add(ring);
        }
      });
    });

    noiseRippleGroupRef.current = group;
    groupsRef.current.dynamicObjects.add(group);
  }, [showNoiseRipple, placedBuildings, timelineDate, isReady, buildingScale]);

  // Toronto zoning layer (Official Plan Land Use Designation)
  useEffect(() => {
    const bbox = {
      minLat: 43.64,
      maxLat: 43.66,
      minLng: -79.395,
      maxLng: -79.365,
    };
    if (!groupsRef.current || !isReady) return;

    const removeZoningGroup = (group: THREE.Group | null) => {
      if (!group || !groupsRef.current) return;
      groupsRef.current.dynamicObjects.remove(group);
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
    };

    if (!showZoningLayer) {
      if (zoningGroupRef.current) {
        removeZoningGroup(zoningGroupRef.current);
        zoningGroupRef.current = null;
      }
      return;
    }

    let cancelled = false;
    loadAndRenderZoningLayer(bbox, CityProjection)
      .then((group) => {
        if (!group) return;
        if (cancelled) {
          removeZoningGroup(group);
          return;
        }
        zoningGroupRef.current = group;
        group.position.set(zoningOffset.x, 0, zoningOffset.z);
        group.rotation.y = (zoningRotationY * Math.PI) / 180;
        group.scale.x = zoningFlipH ? -1 : 1;
        groupsRef.current?.dynamicObjects.add(group);
      })
      .catch((err) => console.error("Zoning layer load error:", err));

    return () => {
      cancelled = true;
      if (zoningGroupRef.current) {
        removeZoningGroup(zoningGroupRef.current);
        zoningGroupRef.current = null;
      }
    };
  }, [showZoningLayer, isReady]);

  // Apply zoning offset and rotation when they change
  useEffect(() => {
    if (zoningGroupRef.current) {
      zoningGroupRef.current.position.set(zoningOffset.x, 0, zoningOffset.z);
      zoningGroupRef.current.rotation.y = (zoningRotationY * Math.PI) / 180;
      zoningGroupRef.current.scale.x = zoningFlipH ? -1 : 1;
    }
  }, [zoningOffset.x, zoningOffset.z, zoningRotationY, zoningFlipH]);

  // Shared cleanup helper for the simple toggleable data layers below
  // (parks / water / Toronto trees). Mirrors removeZoningGroup but lives at
  // outer scope so each useEffect can reuse it.
  const removeLayerGroup = (group: THREE.Group | null) => {
    if (!group || !groupsRef.current) return;
    groupsRef.current.dynamicObjects.remove(group);
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        (obj as THREE.Mesh).geometry?.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (mat instanceof THREE.Material) mat.dispose();
        else if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      }
      if (obj instanceof THREE.Line) {
        obj.geometry?.dispose();
        if (obj.material instanceof THREE.Material) obj.material.dispose();
      }
    });
  };

  // Toronto parks / green-spaces layer
  useEffect(() => {
    if (!groupsRef.current || !isReady) return;
    if (!showParksLayer) {
      if (parksGroupRef.current) {
        removeLayerGroup(parksGroupRef.current);
        parksGroupRef.current = null;
      }
      return;
    }
    let cancelled = false;
    loadAndRenderParksLayer()
      .then((group) => {
        if (!group) return;
        if (cancelled) {
          removeLayerGroup(group);
          return;
        }
        parksGroupRef.current = group;
        groupsRef.current?.dynamicObjects.add(group);
      })
      .catch((err) => console.error("Parks layer load error:", err));
    return () => {
      cancelled = true;
      if (parksGroupRef.current) {
        removeLayerGroup(parksGroupRef.current);
        parksGroupRef.current = null;
      }
    };
  }, [showParksLayer, isReady]);

  // Toronto water layer (Lake Ontario shoreline + inland waterbodies + creeks)
  useEffect(() => {
    if (!groupsRef.current || !isReady) return;
    if (!showWaterLayer) {
      if (waterGroupRef.current) {
        removeLayerGroup(waterGroupRef.current);
        waterGroupRef.current = null;
      }
      return;
    }
    let cancelled = false;
    loadAndRenderWaterLayer()
      .then((group) => {
        if (!group) return;
        if (cancelled) {
          removeLayerGroup(group);
          return;
        }
        waterGroupRef.current = group;
        groupsRef.current?.dynamicObjects.add(group);
      })
      .catch((err) => console.error("Water layer load error:", err));
    return () => {
      cancelled = true;
      if (waterGroupRef.current) {
        removeLayerGroup(waterGroupRef.current);
        waterGroupRef.current = null;
      }
    };
  }, [showWaterLayer, isReady]);

  // Toronto street trees layer (instanced trunk + foliage)
  useEffect(() => {
    if (!groupsRef.current || !isReady) return;
    if (!showTorontoTreesLayer) {
      if (torontoTreesGroupRef.current) {
        removeLayerGroup(torontoTreesGroupRef.current);
        torontoTreesGroupRef.current = null;
      }
      return;
    }
    let cancelled = false;
    loadAndRenderTorontoTreesLayer()
      .then((group) => {
        if (!group) return;
        if (cancelled) {
          removeLayerGroup(group);
          return;
        }
        torontoTreesGroupRef.current = group;
        groupsRef.current?.dynamicObjects.add(group);
      })
      .catch((err) => console.error("Trees layer load error:", err));
    return () => {
      cancelled = true;
      if (torontoTreesGroupRef.current) {
        removeLayerGroup(torontoTreesGroupRef.current);
        torontoTreesGroupRef.current = null;
      }
    };
  }, [showTorontoTreesLayer, isReady]);

  // Wind effect visualization layer
  useEffect(() => {
    if (!groupsRef.current || !isReady) return;

    const removeWind = () => {
      if (windVizRef.current) {
        groupsRef.current?.dynamicObjects.remove(windVizRef.current.group);
        windVizRef.current.dispose();
        windVizRef.current = null;
      }
      windFieldsRef.current = null;
    };

    if (!showWindLayer) {
      removeWind();
      return;
    }

    if (buildingsDataRef.current.length === 0) {
      console.warn("Wind layer: no buildings data available yet");
      return;
    }

    removeWind();

    let cancelled = false;

    if (windData && windData.hourly.length > 0) {
      // Use hour-0 data for initial display, then pre-compute all 24 fields
      const hour0 = windData.hourly[0];
      createWindVisualization(buildingsDataRef.current, CityProjection).then(async (viz) => {
        if (cancelled) { viz.dispose(); return; }
        windVizRef.current = viz;
        groupsRef.current?.dynamicObjects.add(viz.group);

        // Pre-compute all 24 wind fields
        const fields = await precomputeWindFields(buildingsDataRef.current, CityProjection, windData.hourly);
        if (cancelled) return;
        windFieldsRef.current = fields;

        // Apply current hour
        const hour = Math.floor(timeOfDayHourRef.current) % 24;
        if (fields[hour]) viz.setWindField(fields[hour]);
        console.log("✅ Wind visualization layer enabled with hourly data");
      });
    } else {
      // Fallback: no wind data, use defaults
      createWindVisualization(buildingsDataRef.current, CityProjection).then((viz) => {
        if (cancelled) { viz.dispose(); return; }
        windVizRef.current = viz;
        groupsRef.current?.dynamicObjects.add(viz.group);
        console.log("✅ Wind visualization layer enabled (default wind)");
      });
    }

    return () => {
      cancelled = true;
      removeWind();
    };
  }, [showWindLayer, isReady, windData]);

  // Update wind field when time-of-day slider changes
  useEffect(() => {
    if (!windVizRef.current || !windFieldsRef.current) return;
    const hour = Math.floor(timeOfDayHour ?? 12) % 24;
    const field = windFieldsRef.current[hour];
    if (field) {
      windVizRef.current.setWindField(field);
    }
  }, [timeOfDayHour]);

  // Barricade mode: crosshair cursor and road hover highlight
  useEffect(() => {
    if (!isBarricadeMode || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.style.cursor = "crosshair";

    let highlightedMesh: THREE.Mesh | null = null;
    let originalEmissive: THREE.Color | null = null;

    function handleMouseMove(event: MouseEvent) {
      if (!canvasRef.current || !cameraRef.current || !groupsRef.current) return;

      // Restore previous highlight
      if (highlightedMesh && originalEmissive) {
        const mat = highlightedMesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.copy(originalEmissive);
        highlightedMesh = null;
        originalEmissive = null;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);

      const roadMeshes = groupsRef.current.staticGeometry.children.filter(
        (child) => child.userData.isRoad === true,
      );
      const hits = raycasterRef.current.intersectObjects(roadMeshes, true);
      if (hits.length > 0) {
        let target: THREE.Object3D | null = hits[0].object;
        while (target && !target.userData.isRoad) target = target.parent;
        if (target && target instanceof THREE.Mesh) {
          const mat = target.material as THREE.MeshStandardMaterial;
          if (mat.emissive) {
            originalEmissive = mat.emissive.clone();
            mat.emissive.set(0xff4444);
            highlightedMesh = target;
          }
        }
      }
    }

    canvas.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.style.cursor = "";
      if (highlightedMesh && originalEmissive) {
        const mat = highlightedMesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive) mat.emissive.copy(originalEmissive);
      }
    };
  }, [isBarricadeMode]);

  // Update ghost position on mouse move
  useEffect(() => {
    if (!isPlacementMode) return;

    function handleMouseMove(event: MouseEvent) {
      if (!canvasRef.current || !cameraRef.current || !groupsRef.current)
        return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(mouse, cameraRef.current);

      // Check if hovering over an existing building
      const buildingObjects = Array.from(buildingModelsRef.current.values());
      const buildingIntersects = raycasterRef.current.intersectObjects(
        buildingObjects,
        true,
      );
      const isOverBuilding = buildingIntersects.length > 0;

      // Only raycast against the ground plane and static geometry (buildings/roads)
      // This prevents placing buildings on cars or in the air
      const targetObjects = [
        ...groupsRef.current.environment.children,
        ...groupsRef.current.staticGeometry.children,
      ];
      const intersects = raycasterRef.current.intersectObjects(
        targetObjects,
        true,
      );

      // Check if ghost exists inside the handler (it might load after this effect runs)
      if (intersects.length > 0 && ghostModelRef.current) {
        const point = intersects[0].point;
        ghostModelRef.current.position.set(point.x, point.y, point.z);
        ghostModelRef.current.visible = true;
        setGhostPosition(point);

        // Change ghost color based on validity
        ghostModelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.MeshBasicMaterial & {
              emissive?: { set: (c: number) => void };
            };
            if (isOverBuilding) {
              mat.color.set(0xff0000);
              if (mat.emissive) mat.emissive.set(0x330000);
            } else {
              mat.color.set(0x00ff00);
              if (mat.emissive) mat.emissive.set(0x003300);
            }
          }
        });
      } else if (ghostModelRef.current) {
        // Hide ghost when not hovering over valid placement surface
        ghostModelRef.current.visible = false;
      }
    }

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("mousemove", handleMouseMove);
      return () => canvas.removeEventListener("mousemove", handleMouseMove);
    }
  }, [isPlacementMode]);

  // Street view selection mode: show a pin preview that follows the mouse
  const streetViewPinRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    if (!groupsRef.current) return;

    if (!isStreetViewSelectionMode) {
      // Remove pin when leaving selection mode
      if (streetViewPinRef.current) {
        groupsRef.current.dynamicObjects.remove(streetViewPinRef.current);
        streetViewPinRef.current = null;
      }
      return;
    }

    // Build a simple pin: vertical pole + eye-shaped disc at street level
    const pin = new THREE.Group();
    const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 20, 8);
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x6366f1 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 10;
    pin.add(pole);

    const ringGeo = new THREE.TorusGeometry(6, 1.2, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    pin.add(ring);

    const discGeo = new THREE.CircleGeometry(6, 24);
    const discMat = new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.4;
    pin.add(disc);

    pin.visible = false;
    streetViewPinRef.current = pin;
    groupsRef.current.dynamicObjects.add(pin);

    function handleMouseMove(event: MouseEvent) {
      if (!canvasRef.current || !cameraRef.current || !groupsRef.current || !streetViewPinRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const targets = [
        ...groupsRef.current.environment.children,
        ...groupsRef.current.staticGeometry.children,
      ];
      const hits = raycasterRef.current.intersectObjects(targets, true);
      if (hits.length > 0) {
        const p = hits[0].point;
        streetViewPinRef.current.position.set(p.x, p.y, p.z);
        streetViewPinRef.current.visible = true;
      } else {
        streetViewPinRef.current.visible = false;
      }
    }

    const canvas = canvasRef.current;
    canvas?.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas?.removeEventListener("mousemove", handleMouseMove);
      if (streetViewPinRef.current && groupsRef.current) {
        groupsRef.current.dynamicObjects.remove(streetViewPinRef.current);
        streetViewPinRef.current = null;
      }
    };
  }, [isStreetViewSelectionMode]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ touchAction: "none", cursor: "grab" }}
      />

      {/* Loading overlay */}
      {!isReady && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center">
            <div className="mb-4">
              <div
                className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]"
                role="status"
              >
                <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">
                  Loading...
                </span>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400">{loadingStatus}</p>
          </div>
        </div>
      )}

      {/* Error notification */}
      {error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg shadow-lg z-20 max-w-md">
          <div className="flex items-center">
            <span className="mr-2">⚠️</span>
            <div>
              <p className="font-bold">Initialization Error</p>
              <p className="text-sm">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-red-700 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Panels: portal above sidebars when panelsPortalRef provided, else in-place */}
      {panelsPortalRef?.current ? (
        createPortal(
          <>
            {/* Car details - centered */}
            {selectedCarId &&
              spawnerRef.current &&
              (() => {
                const car = spawnerRef.current.getCar(selectedCarId);
                if (!car) return null;
                return (
                  <div className="absolute top-20 left-1/2 -translate-x-1/2 w-80 max-w-[calc(100vw-24rem)] pointer-events-auto rounded-xl bg-gray-900/95 text-white shadow-xl backdrop-blur-sm border border-gray-700 z-10">
                    <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
                      <h3 className="font-semibold text-sm">Car details</h3>
                      <button
                        type="button"
                        onClick={() => setSelectedCarId(null)}
                        className="text-gray-400 hover:text-white text-lg leading-none"
                        aria-label="Close"
                      >
                        ×
                      </button>
                    </div>
                    <div className="p-4 space-y-2 text-sm">
                      <p>
                        <span className="text-gray-400">ID</span> {car.id}
                      </p>
                      <p>
                        <span className="text-gray-400">Speed</span>{" "}
                        {car.speed.toFixed(1)} km/h
                      </p>
                      <p>
                        <span className="text-gray-400">Target speed</span>{" "}
                        {car.targetSpeed.toFixed(1)} km/h
                      </p>
                      <p>
                        <span className="text-gray-400">Max speed</span>{" "}
                        {car.maxSpeed.toFixed(1)} km/h
                      </p>
                      <p>
                        <span className="text-gray-400">State</span>{" "}
                        {car.currentBehavior ?? "—"}
                      </p>
                      {car.behaviorReason && (
                        <p className="pt-2 border-t border-gray-700">
                          <span className="text-gray-400 block mb-1">Why</span>
                          {car.behaviorReason}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            {/* Debug overlay - centered so not behind sidebars */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-md pointer-events-auto z-10">
              <DebugOverlay
                analytics={analyticsRef.current}
                visible={debugOverlayVisible}
                onToggle={() => setDebugOverlayVisible(!debugOverlayVisible)}
                className="pointer-events-none select-none"
                constructionZone={
                  placedBuildings?.length ? constructionZoneRef.current : null
                }
              />
            </div>
            {/* Analytics dashboard - full screen when open */}
            <AnalyticsDashboard
              analytics={analyticsRef.current}
              visible={dashboardVisible}
              onClose={() => setDashboardVisible(false)}
            />
          </>,
          panelsPortalRef.current,
        )
      ) : (
        <>
          {/* Car details panel - in-place when no portal */}
          {selectedCarId &&
            spawnerRef.current &&
            (() => {
              const car = spawnerRef.current.getCar(selectedCarId);
              if (!car) return null;
              return (
                <div className="absolute top-20 left-4 z-30 w-80 rounded-xl bg-gray-900/95 text-white shadow-xl backdrop-blur-sm border border-gray-700">
                  <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
                    <h3 className="font-semibold text-sm">Car details</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedCarId(null)}
                      className="text-gray-400 hover:text-white text-lg leading-none"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    <p>
                      <span className="text-gray-400">ID</span> {car.id}
                    </p>
                    <p>
                      <span className="text-gray-400">Speed</span>{" "}
                      {car.speed.toFixed(1)} km/h
                    </p>
                    <p>
                      <span className="text-gray-400">Target speed</span>{" "}
                      {car.targetSpeed.toFixed(1)} km/h
                    </p>
                    <p>
                      <span className="text-gray-400">Max speed</span>{" "}
                      {car.maxSpeed.toFixed(1)} km/h
                    </p>
                    <p>
                      <span className="text-gray-400">State</span>{" "}
                      {car.currentBehavior ?? "—"}
                    </p>
                    {car.behaviorReason && (
                      <p className="pt-2 border-t border-gray-700">
                        <span className="text-gray-400 block mb-1">Why</span>
                        {car.behaviorReason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          <DebugOverlay
            analytics={analyticsRef.current}
            visible={debugOverlayVisible}
            onToggle={() => setDebugOverlayVisible(!debugOverlayVisible)}
            constructionZone={
              placedBuildings?.length ? constructionZoneRef.current : null
            }
          />
          <AnalyticsDashboard
            analytics={analyticsRef.current}
            visible={dashboardVisible}
            onClose={() => setDashboardVisible(false)}
          />
        </>
      )}

      {/* Right Sidebar - only when parent does not control (e.g. buttons in sidebar) */}
      {isReady && onDebugOverlayChange == null && (
        <div className="absolute top-4 right-4 bottom-4 z-40 flex flex-col justify-between w-48">
          {/* Top section - Building Editor Link */}
          <div className="flex flex-col gap-2">
            <a
              href="/editor"
              className="px-5 py-2.5 rounded-full font-medium text-sm border-2 bg-gray-100 border-slate-400/60 text-slate-700 hover:bg-slate-500 hover:border-slate-400 hover:text-white hover:shadow-[0_8px_25px_-5px_rgba(71,85,105,0.35)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ease-out text-center"
            >
              Building Editor →
            </a>
          </div>

          {/* Bottom section - Control buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setDebugOverlayVisible(!debugOverlayVisible)}
              className="px-4 py-2 bg-gray-800/90 hover:bg-gray-700/90 text-white rounded-lg shadow-lg text-sm font-medium transition-colors backdrop-blur-sm"
              title="Toggle debug overlay (F3)"
            >
              {debugOverlayVisible ? "Hide" : "Show"} Debug
            </button>
            <button
              onClick={() => setDashboardVisible(!dashboardVisible)}
              className="px-4 py-2 bg-blue-600/90 hover:bg-blue-500/90 text-white rounded-lg shadow-lg text-sm font-medium transition-colors backdrop-blur-sm"
            >
              Analytics Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Selected OSM Building — business plan + delete */}
      {selectedOsmBuildingId && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-20 flex gap-3">
          <button
            onClick={() => openOsmBusinessPlan(selectedOsmBuildingId)}
            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-lg text-sm font-semibold transition-colors"
          >
            <Briefcase size={14} />
            <span>
              {osmPlanIdForSelected != null
                ? `Open business plan #${osmPlanIdForSelected}`
                : `Add business plan #${nextOsmPlanIdPreview}`}
            </span>
          </button>
          <button
            onClick={() => {
              const cluster = clusterIndexRef.current?.clusterById.get(
                selectedOsmBuildingId,
              );
              const ids = cluster?.buildingIds ?? [selectedOsmBuildingId];
              for (let i = 0; i < ids.length; i++) {
                // skip API call on all but the last so we hit it once if needed
                deleteOsmBuilding(ids[i], i < ids.length - 1);
              }
              setSelectedOsmBuildingId(null);
            }}
            className="px-5 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg text-sm font-semibold transition-colors"
          >
            Delete Building
            {(() => {
              const cluster = clusterIndexRef.current?.clusterById.get(
                selectedOsmBuildingId,
              );
              const count = cluster?.buildingIds.length ?? 1;
              return count > 1 ? ` (${count} parts)` : "";
            })()}
          </button>
        </div>
      )}
    </div>
  );
}
