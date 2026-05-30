/**
 * Traffic-Based Car Spawning System
 * Manages the lifecycle of cars in the autonomous traffic simulation
 */

import * as turf from "@turf/turf";
import * as THREE from "three";
import { RoadNetwork, RoadNode, Destination } from "./roadNetwork";
import { Pathfinder, Route } from "./pathfinding";
import { VehiclePhysicsConfig } from "./vehiclePhysics";

export type CarType = "sedan" | "suv" | "truck" | "compact";

export interface SpawnPoint {
  id: string;
  position: [number, number]; // [lon, lat]
  roadNodeId: string; // Associated road network node
  spawnRate: number; // Cars per minute
  lastSpawnTime: number; // Timestamp of last spawn
  direction?: string; // Optional direction (e.g., "northbound", "eastbound")
  active: boolean; // Can be toggled on/off
}

export interface SpawnedCar {
  id: string;
  type: CarType;
  color: string;
  spawnPointId: string;
  spawnTime: number;
  position: [number, number];
  destination: Destination;
  route: Route;
  currentEdgeId: string | null;
  distanceOnEdge: number; // Distance traveled on current edge (meters)
  speed: number; // Current speed (km/h)
  maxSpeed: number; // Maximum speed for this car (km/h)
  bearing: number; // Current direction (degrees)
  stoppedAtLight: boolean;

  // Physics integration fields
  physicsProfile: VehiclePhysicsConfig;
  targetSpeed: number; // Target speed from behavior controller (km/h)
  acceleration: number; // Current acceleration (m/s²)

  // Behavior fields
  currentBehavior?: string; // Current behavior state (for debugging)
  behaviorReason?: string; // Why current speed/state (e.g. "Following lead vehicle", "In red zone")
  behaviorTimer: number; // Timer for behavior state changes

  // Rendering fields
  meshRef?: THREE.Object3D; // Reference to 3D mesh for light updates
}

export interface SpawnerConfig {
  maxCars: number; // Maximum number of active cars
  globalSpawnRate: number; // Base spawn rate modifier (0.0 - 2.0)
  despawnRadius: number; // Distance from destination to despawn (meters)
  defaultCarSpeed: number; // Default max speed (km/h)
  carTypeDistribution: {
    sedan: number;
    suv: number;
    truck: number;
    compact: number;
  };
}

const DEFAULT_CONFIG: SpawnerConfig = {
  maxCars: 400, // Allow lots of cars near construction
  globalSpawnRate: 1.5,
  despawnRadius: 20,
  defaultCarSpeed: 72, // Fast normal driving; slow zones (red 5, yellow 22) unchanged
  carTypeDistribution: {
    sedan: 0.4, // 40%
    suv: 0.25, // 25%
    truck: 0.15, // 15%
    compact: 0.2, // 20%
  },
};

const CAR_COLORS = [
  "#FF0000", // Red
  "#0000FF", // Blue
  "#00FF00", // Green
  "#FFA500", // Orange
  "#800080", // Purple
  "#FFFF00", // Yellow
  "#00FFFF", // Cyan
  "#FF00FF", // Magenta
  "#C0C0C0", // Silver
  "#000000", // Black
  "#FFFFFF", // White
  "#808080", // Gray
];

export class Spawner {
  private spawnPoints: Map<string, SpawnPoint> = new Map();
  private activeCars: Map<string, SpawnedCar> = new Map();
  private config: SpawnerConfig;
  private nextCarId: number = 0;
  private pathfinder: Pathfinder;
  /** Edge IDs to avoid when pathfinding (lane/road blocks near placed buildings) */
  private blockedEdgeIds: Set<string> = new Set();

  constructor(
    private roadNetwork: RoadNetwork,
    config?: Partial<SpawnerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pathfinder = new Pathfinder(roadNetwork);
  }

  /**
   * Define spawn points around Queen's campus (road entry points)
   */
  initializeQueensSpawnPoints(): void {
    const spawnPoints: Omit<SpawnPoint, "lastSpawnTime" | "active">[] = [
      {
        id: "union-st-west",
        position: [-76.5, 44.2285],
        roadNodeId: "entry-union-west",
        spawnRate: 2.0, // 2 cars per minute
        direction: "eastbound",
      },
      {
        id: "union-st-east",
        position: [-76.485, 44.2285],
        roadNodeId: "entry-union-east",
        spawnRate: 1.5,
        direction: "westbound",
      },
      {
        id: "university-ave-north",
        position: [-76.495, 44.235],
        roadNodeId: "entry-university-north",
        spawnRate: 1.8,
        direction: "southbound",
      },
      {
        id: "university-ave-south",
        position: [-76.495, 44.225],
        roadNodeId: "entry-university-south",
        spawnRate: 1.5,
        direction: "northbound",
      },
      {
        id: "division-st-north",
        position: [-76.487, 44.234],
        roadNodeId: "entry-division-north",
        spawnRate: 2.2,
        direction: "southbound",
      },
      {
        id: "division-st-south",
        position: [-76.487, 44.227],
        roadNodeId: "entry-division-south",
        spawnRate: 1.3,
        direction: "northbound",
      },
      {
        id: "princess-st-west",
        position: [-76.492, 44.231],
        roadNodeId: "entry-princess-west",
        spawnRate: 1.7,
        direction: "eastbound",
      },
      {
        id: "princess-st-east",
        position: [-76.48, 44.231],
        roadNodeId: "entry-princess-east",
        spawnRate: 1.4,
        direction: "westbound",
      },
    ];

    spawnPoints.forEach((sp) => {
      this.addSpawnPoint({
        ...sp,
        lastSpawnTime: Date.now(),
        active: true,
      });
    });

    console.log(
      `✅ Initialized ${this.spawnPoints.size} spawn points around Queen's campus`,
    );
  }

  /**
   * Add spawn points across the road network so cars appear on many streets.
   * Picks random edges and uses their start as a spawn point.
   * @param maxPoints - Max number of network spawn points to add (default 40)
   */
  initializeFromRoadNetwork(maxPoints: number = 40): void {
    const edges = this.roadNetwork.getEdges();
    if (edges.length === 0) return;

    // Filter to edges with valid geometry (at least 2 points)
    const validEdges = edges.filter((e) => e.geometry && e.geometry.length >= 2);
    if (validEdges.length === 0) return;

    // Shuffle and take up to maxPoints to get good spatial distribution
    const shuffled = [...validEdges].sort(() => Math.random() - 0.5);
    const toAdd = shuffled.slice(0, Math.min(maxPoints, shuffled.length));
    const now = Date.now();

    toAdd.forEach((edge, i) => {
      const pos = edge.geometry[0] as [number, number];
      const id = `network-${edge.id}`;
      if (this.spawnPoints.has(id)) return;
      this.addSpawnPoint({
        id,
        position: pos,
        roadNodeId: edge.from,
        spawnRate: 1.8,
        lastSpawnTime: now,
        active: true,
      });
    });

    console.log(
      `✅ Added ${toAdd.length} network spawn points (total: ${this.spawnPoints.size})`,
    );
  }

  /**
   * Add a spawn point
   */
  addSpawnPoint(spawnPoint: SpawnPoint): void {
    this.spawnPoints.set(spawnPoint.id, spawnPoint);
  }

  /**
   * Remove a spawn point
   */
  removeSpawnPoint(spawnPointId: string): void {
    this.spawnPoints.delete(spawnPointId);
  }

  /**
   * Set edges that are blocked (e.g. one lane closed near a placed building).
   * Pathfinding will avoid these edges and vehicles will reroute around them.
   */
  setBlockedEdges(edgeIds: Set<string>): void {
    this.blockedEdgeIds = new Set(edgeIds);
  }

  /**
   * Get currently blocked edge IDs (for debugging or UI).
   */
  getBlockedEdgeIds(): Set<string> {
    return new Set(this.blockedEdgeIds);
  }

  /**
   * Add high-frequency spawn points near placed buildings to simulate
   * extra traffic in the construction area. Removes any existing
   * building-vicinity spawn points first.
   * @param buildings - Array of { id, position: [lng, lat] }
   */
  setBuildingVicinitySpawning(
    buildings: { id: string; position: [number, number] }[],
  ): void {
    // Remove existing building-vicinity spawn points
    const toRemove: string[] = [];
    this.spawnPoints.forEach((_, id) => {
      if (id.startsWith("building-vicinity-")) toRemove.push(id);
    });
    toRemove.forEach((id) => this.spawnPoints.delete(id));

    const now = Date.now();
    const VICINITY_RADIUS_M = 100;
    const VICINITY_SPAWN_RATE = 90; // tons of cars for demo

    buildings.forEach((building) => {
      const nearEdges = this.roadNetwork.findEdgesNearPosition(
        building.position,
        VICINITY_RADIUS_M,
      );
      // Add up to 8 spawn points per building
      const seenEdgeIds = new Set<string>();
      let added = 0;
      for (const edge of nearEdges) {
        if (seenEdgeIds.has(edge.id) || added >= 8) continue;
        seenEdgeIds.add(edge.id);
        const pos = edge.geometry[0] as [number, number];
        const id = `building-vicinity-${building.id}-${edge.id}`;
        this.addSpawnPoint({
          id,
          position: pos,
          roadNodeId: edge.from,
          spawnRate: VICINITY_SPAWN_RATE,
          lastSpawnTime: now,
          active: true,
        });
        added++;
      }
    });
  }

  /**
   * Burst-spawn cars directly beside placed buildings.
   * Uses the closest point on each nearby edge to the building so cars appear right beside it.
   * Falls back to larger radii if no roads are very close.
   */
  burstSpawnNearBuildings(
    buildings: { id: string; position: [number, number] }[],
  ): number {
    const MIN_SPACING_M = 6;
    const BURST_MIN = 60;
    const BURST_MAX = 140;
    let spawned = 0;

    for (const building of buildings) {
      // Prefer edges right beside the building (40m), then 120m, then 250m
      let nearEdges = this.roadNetwork.findEdgesNearPosition(
        building.position,
        40,
      );
      if (nearEdges.length === 0) {
        nearEdges = this.roadNetwork.findEdgesNearPosition(
          building.position,
          120,
        );
      }
      if (nearEdges.length === 0) {
        nearEdges = this.roadNetwork.findEdgesNearPosition(
          building.position,
          250,
        );
      }

      const slots: { position: [number, number]; distanceOnEdge: number; edgeId: string }[] = [];
      const APPROACH_DISTANCES_M = [40, 80, 120, 160]; // spawn this far before building so they drive past it

      for (const edge of nearEdges) {
        if (this.blockedEdgeIds.has(edge.id)) continue;
        const line = turf.lineString(edge.geometry);
        // Point on edge nearest to the building (they will drive past this)
        const distanceAlong = this.roadNetwork.getDistanceAlongEdge(
          edge.id,
          building.position,
        );

        // Pass-through slots: spawn along the road BEFORE the building so their path goes past it
        for (const approachM of APPROACH_DISTANCES_M) {
          const d = Math.max(0, distanceAlong - approachM);
          if (d < edge.length - 0.5) {
            const along = turf.along(line, d / 1000, { units: "kilometers" });
            slots.push({
              position: along.geometry.coordinates as [number, number],
              distanceOnEdge: d,
              edgeId: edge.id,
            });
          }
        }

        // Some slots right beside the building (for density)
        const alongAt = turf.along(line, distanceAlong / 1000, { units: "kilometers" });
        slots.push({
          position: alongAt.geometry.coordinates as [number, number],
          distanceOnEdge: distanceAlong,
          edgeId: edge.id,
        });
        for (const offset of [-1, 1, 2].map((k) => k * MIN_SPACING_M)) {
          const d = Math.max(0, Math.min(edge.length - 0.5, distanceAlong + offset));
          const a = turf.along(line, d / 1000, { units: "kilometers" });
          slots.push({
            position: a.geometry.coordinates as [number, number],
            distanceOnEdge: d,
            edgeId: edge.id,
          });
        }
      }

      const want = BURST_MIN + Math.floor(Math.random() * (BURST_MAX - BURST_MIN + 1));
      const toSpawn = Math.min(
        want,
        slots.length,
        this.config.maxCars - this.activeCars.size,
      );
      for (let i = 0; i < toSpawn && this.activeCars.size < this.config.maxCars; i++) {
        const idx = Math.floor(Math.random() * slots.length);
        const slot = slots[idx];
        slots.splice(idx, 1);
        const car = this.spawnCarAtPosition(slot.position, slot.edgeId, slot.distanceOnEdge);
        if (car) spawned++;
      }
    }
    return spawned;
  }

  /**
   * Spawn a single car at a specific position on the road (for burst spawn).
   * Builds route from this edge to destination so the car stays on the correct edge.
   */
  private spawnCarAtPosition(
    position: [number, number],
    edgeId: string,
    distanceOnEdge: number,
  ): SpawnedCar | null {
    const edge = this.roadNetwork.getEdge(edgeId);
    if (!edge) return null;
    const toNode = this.roadNetwork.getNode(edge.to);
    if (!toNode) return null;

    const opts =
      this.blockedEdgeIds.size > 0
        ? { blockedEdgeIds: this.blockedEdgeIds }
        : undefined;
    let routeFromEnd: Route | null = null;
    let destination: Destination | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      destination = this.selectDestination();
      if (!destination) break;
      routeFromEnd = this.pathfinder.findRoute(
        toNode.position,
        destination.position,
        opts,
      );
      if (routeFromEnd?.edges.length) break;
    }
    if (!destination || !routeFromEnd || routeFromEnd.edges.length === 0)
      return null;

    const line = turf.lineString(edge.geometry);
    const along = turf.along(line, distanceOnEdge / 1000, {
      units: "kilometers",
    });
    const exactPos = along.geometry.coordinates as [number, number];

    const route: Route = {
      nodes: [edge.from, edge.to, ...routeFromEnd.nodes.slice(1)],
      edges: [edgeId, ...routeFromEnd.edges],
      totalDistance: (edge.length - distanceOnEdge) + routeFromEnd.totalDistance,
      estimatedTime:
        (edge.length - distanceOnEdge) / 10 + routeFromEnd.estimatedTime,
      waypoints: [exactPos, ...edge.geometry.slice(1), ...routeFromEnd.waypoints],
    };

    const carType = this.selectCarType();
    const color = this.selectCarColor();
    const physicsProfile = this.getPhysicsProfileForType(carType);

    const car: SpawnedCar = {
      id: `car-${this.nextCarId++}`,
      type: carType,
      color,
      spawnPointId: "burst",
      spawnTime: Date.now(),
      position: exactPos,
      destination,
      route,
      currentEdgeId: edgeId,
      distanceOnEdge,
      speed: 0,
      maxSpeed: this.config.defaultCarSpeed + (Math.random() * 12 - 6),
      bearing: 0,
      stoppedAtLight: false,
      physicsProfile,
      targetSpeed: this.config.defaultCarSpeed * 0.35,
      acceleration: 0,
      currentBehavior: "following",
      behaviorTimer: 0,
      meshRef: undefined,
    };

    if (edge.geometry.length >= 2) {
      const lookIdx = Math.min(
        Math.floor((distanceOnEdge / edge.length) * (edge.geometry.length - 1)) + 1,
        edge.geometry.length - 1,
      );
      const from = edge.geometry[Math.max(0, lookIdx - 1)];
      const to = edge.geometry[lookIdx];
      car.bearing = turf.bearing(turf.point(from), turf.point(to));
    }

    this.activeCars.set(car.id, car);
    return car;
  }

  /**
   * Toggle spawn point active state
   */
  toggleSpawnPoint(spawnPointId: string, active: boolean): void {
    const spawnPoint = this.spawnPoints.get(spawnPointId);
    if (spawnPoint) {
      spawnPoint.active = active;
    }
  }

  /**
   * Update spawner (call this in animation loop)
   */
  update(deltaTime: number): void {
    const now = Date.now();

    // Try to spawn cars at each spawn point
    this.spawnPoints.forEach((spawnPoint) => {
      if (!spawnPoint.active) return;
      if (this.activeCars.size >= this.config.maxCars) return;

      const timeSinceLastSpawn = now - spawnPoint.lastSpawnTime;
      const spawnInterval =
        60000 / (spawnPoint.spawnRate * this.config.globalSpawnRate); // ms

      if (timeSinceLastSpawn >= spawnInterval) {
        this.spawnCar(spawnPoint);
        spawnPoint.lastSpawnTime = now;
      }
    });

    // Check for cars that reached their destination
    this.checkForDespawns();
  }

  /**
   * Spawn a car at a spawn point with a random destination
   */
  private spawnCar(spawnPoint: SpawnPoint): SpawnedCar | null {
    // Select random destination (weighted)
    const destination = this.selectDestination();
    if (!destination) {
      console.warn("⚠️ No destinations available");
      return null;
    }

    // Find route from spawn point to destination (avoid blocked edges)
    let route = this.pathfinder.findRoute(
      spawnPoint.position,
      destination.position,
      this.blockedEdgeIds.size > 0
        ? { blockedEdgeIds: this.blockedEdgeIds }
        : undefined,
    );

    // FALLBACK: If pathfinding fails, create a simple route on a random edge
    if (!route) {
      const edges = this.roadNetwork.getEdges();
      if (edges.length > 0) {
        const randomEdge = edges[Math.floor(Math.random() * edges.length)];
        route = {
          nodes: [],
          edges: [randomEdge.id],
          totalDistance: randomEdge.length,
          estimatedTime: randomEdge.length / 10, // ~10 m/s
          waypoints: randomEdge.geometry,
        };
      } else {
        return null;
      }
    }

    // Select car type based on distribution
    const carType = this.selectCarType();
    const color = this.selectCarColor();

    // Get physics profile for this car type
    const physicsProfile = this.getPhysicsProfileForType(carType);

    // Use first waypoint of route as actual spawn position (on the road)
    const actualSpawnPos =
      route.waypoints.length > 0
        ? (route.waypoints[0] as [number, number])
        : spawnPoint.position;

    const car: SpawnedCar = {
      id: `car-${this.nextCarId++}`,
      type: carType,
      color,
      spawnPointId: spawnPoint.id,
      spawnTime: Date.now(),
      position: actualSpawnPos, // Use route waypoint, not spawn point
      destination,
      route,
      currentEdgeId: route.edges[0] || null,
      distanceOnEdge: 0,
      speed: 0, // Start from stopped
      maxSpeed: this.config.defaultCarSpeed + (Math.random() * 20 - 10), // ±10 km/h variance
      bearing: 0,
      stoppedAtLight: false,

      // Physics integration
      physicsProfile,
      targetSpeed: this.config.defaultCarSpeed,
      acceleration: 0,

      // Behavior fields
      currentBehavior: "cruising",
      behaviorTimer: 0,

      // Mesh reference (set later in ThreeMap)
      meshRef: undefined,
    };

    // Calculate initial bearing
    if (route.waypoints.length >= 2) {
      car.bearing = turf.bearing(
        turf.point(route.waypoints[0]),
        turf.point(route.waypoints[1]),
      );
    }

    this.activeCars.set(car.id, car);
    return car;
  }

  /**
   * Select destination using weighted random selection
   */
  private selectDestination(): Destination | null {
    const dest = this.roadNetwork.getRandomDestination();
    if (!dest) {
      console.error("❌ No destinations available in road network!");
    }
    return dest;
  }

  /**
   * Select car type based on distribution
   */
  private selectCarType(): CarType {
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, probability] of Object.entries(
      this.config.carTypeDistribution,
    )) {
      cumulative += probability;
      if (rand <= cumulative) {
        return type as CarType;
      }
    }

    return "sedan"; // Fallback
  }

  /**
   * Select random car color
   */
  private selectCarColor(): string {
    return CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  }

  /**
   * Get physics profile for car type
   */
  private getPhysicsProfileForType(type: CarType): VehiclePhysicsConfig {
    const profiles: Record<CarType, VehiclePhysicsConfig> = {
      sedan: {
        maxAcceleration: 3.0,
        maxDeceleration: 8.0,
        comfortDeceleration: 3.5,
        reactionTime: 1.0,
        minFollowDistance: 2.0,
        timeHeadway: 1.5,
        speedVariance: 0.1,
      },
      suv: {
        maxAcceleration: 2.5,
        maxDeceleration: 7.0,
        comfortDeceleration: 3.0,
        reactionTime: 1.1,
        minFollowDistance: 2.5,
        timeHeadway: 1.8,
        speedVariance: 0.12,
      },
      truck: {
        maxAcceleration: 1.8,
        maxDeceleration: 6.0,
        comfortDeceleration: 2.5,
        reactionTime: 1.3,
        minFollowDistance: 3.5,
        timeHeadway: 2.2,
        speedVariance: 0.08,
      },
      compact: {
        maxAcceleration: 3.2,
        maxDeceleration: 8.5,
        comfortDeceleration: 4.0,
        reactionTime: 0.9,
        minFollowDistance: 1.8,
        timeHeadway: 1.3,
        speedVariance: 0.15,
      },
    };

    return profiles[type];
  }

  /**
   * Check for cars that reached their destination or end of route and despawn them
   */
  private checkForDespawns(): void {
    const toDespawn: string[] = [];

    this.activeCars.forEach((car) => {
      // Despawn when close to destination
      const distanceToDestination = turf.distance(
        turf.point(car.position),
        turf.point(car.destination.position),
        { units: "meters" },
      );
      if (distanceToDestination < this.config.despawnRadius) {
        toDespawn.push(car.id);
        return;
      }

      // Despawn when at end of route (no next edge) — e.g. end of road, dead end
      if (car.route?.edges?.length && car.currentEdgeId) {
        const currentIndex = car.route.edges.indexOf(car.currentEdgeId);
        const isLastEdge =
          currentIndex === car.route.edges.length - 1 && currentIndex >= 0;
        if (isLastEdge) {
          const edge = this.roadNetwork.getEdge(car.currentEdgeId);
          if (edge && car.distanceOnEdge >= edge.length - 0.5) {
            toDespawn.push(car.id);
          }
        }
      }
    });

    toDespawn.forEach((carId) => this.despawnCar(carId));
  }

  /**
   * Manually despawn a car
   */
  despawnCar(carId: string): void {
    this.activeCars.delete(carId);
  }

  /**
   * Get all active cars
   */
  getActiveCars(): SpawnedCar[] {
    return Array.from(this.activeCars.values());
  }

  /**
   * Get car by ID
   */
  getCar(carId: string): SpawnedCar | undefined {
    return this.activeCars.get(carId);
  }

  /**
   * Get spawn points
   */
  getSpawnPoints(): SpawnPoint[] {
    return Array.from(this.spawnPoints.values());
  }

  /**
   * Update car position along its route. If the current or next edge is
   * blocked, recompute route from current position so the vehicle diverts.
   */
  updateCarPosition(carId: string, deltaTime: number): void {
    const car = this.activeCars.get(carId);
    if (!car || !car.route || !car.currentEdgeId) return;

    // If current or next edge is blocked, reroute from current position
    if (this.blockedEdgeIds.size > 0) {
      const idx = car.route.edges.indexOf(car.currentEdgeId);
      const currentBlocked = this.blockedEdgeIds.has(car.currentEdgeId);
      const nextEdgeId =
        idx >= 0 && idx < car.route.edges.length - 1
          ? car.route.edges[idx + 1]
          : null;
      const nextBlocked =
        nextEdgeId !== null && this.blockedEdgeIds.has(nextEdgeId);
      if (currentBlocked || nextBlocked) {
        const newRoute = this.pathfinder.findRoute(
          car.position,
          car.destination.position,
          { blockedEdgeIds: this.blockedEdgeIds },
        );
        if (newRoute && newRoute.edges.length > 0) {
          car.route = newRoute;
          const sameFirstEdge = newRoute.edges[0] === car.currentEdgeId;
          car.currentEdgeId = newRoute.edges[0];
          if (!sameFirstEdge) car.distanceOnEdge = 0;
        }
      }
    }

    // Get current edge (re-fetch after possible reroute)
    let edge = this.roadNetwork.getEdge(car.currentEdgeId);
    if (!edge) {
      const newRoute = this.pathfinder.findRoute(
        car.position,
        car.destination.position,
        this.blockedEdgeIds.size > 0
          ? { blockedEdgeIds: this.blockedEdgeIds }
          : undefined,
      );
      if (newRoute?.edges.length) {
        car.route = newRoute;
        car.currentEdgeId = newRoute.edges[0];
        car.distanceOnEdge = 0;
        edge = this.roadNetwork.getEdge(car.currentEdgeId);
      }
      if (!edge) return;
    }

    // Calculate distance traveled this frame
    const distanceTraveled = (car.speed / 3.6) * deltaTime; // Convert km/h to m/s, multiply by deltaTime
    car.distanceOnEdge += distanceTraveled;

    // Check if we've completed this edge
    if (car.distanceOnEdge >= edge.length) {
      const nextEdgeId = this.pathfinder.getNextEdge(
        car.currentEdgeId,
        car.route,
      );
      if (nextEdgeId) {
        car.currentEdgeId = nextEdgeId;
        car.distanceOnEdge = 0;
        edge = this.roadNetwork.getEdge(nextEdgeId) ?? edge;
      } else {
        this.despawnCar(car.id);
        return;
      }
    }

    // Update position along edge
    const line = turf.lineString(edge.geometry);
    const distKm = Math.min(car.distanceOnEdge, edge.length - 0.01) / 1000;
    const along = turf.along(line, distKm, { units: "kilometers" });
    car.position = along.geometry.coordinates as [number, number];

    // Update bearing
    const lookaheadDistance = Math.min(car.distanceOnEdge + 10, edge.length); // Look 10m ahead
    const lookahead = turf.along(line, lookaheadDistance / 1000, {
      units: "kilometers",
    });
    car.bearing = turf.bearing(
      turf.point(car.position),
      turf.point(lookahead.geometry.coordinates),
    );
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SpawnerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SpawnerConfig {
    return { ...this.config };
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      activeCars: this.activeCars.size,
      maxCars: this.config.maxCars,
      spawnPoints: this.spawnPoints.size,
      activeSpawnPoints: Array.from(this.spawnPoints.values()).filter(
        (sp) => sp.active,
      ).length,
    };
  }

  /**
   * Clear all cars (useful for reset)
   */
  clearAllCars(): void {
    this.activeCars.clear();
    console.log("🧹 Cleared all spawned cars");
  }

  /**
   * Reset spawner (clear cars and reset spawn timers)
   */
  reset(): void {
    this.clearAllCars();
    this.nextCarId = 0;
    const now = Date.now();
    this.spawnPoints.forEach((sp) => {
      sp.lastSpawnTime = now;
    });
    console.log("🔄 Spawner reset");
  }
}
