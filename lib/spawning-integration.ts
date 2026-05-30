/**
 * Integration Guide for Spawning System with Map.tsx
 *
 * This file demonstrates how to integrate the Spawner with the existing Map component.
 * Replace the existing car initialization in Map.tsx with this approach.
 */

import { RoadNetwork } from './roadNetwork';
import { Spawner, SpawnedCar } from './spawning';
import * as THREE from 'three';

/**
 * STEP 1: Initialize the spawning system
 *
 * In your Map.tsx initializeTrafficSimulation function, replace the manual car
 * creation with the spawner:
 */
export async function initializeSpawningSystem(bounds: {
  south: number;
  west: number;
  north: number;
  east: number;
}) {
  // Create road network
  const roadNetwork = new RoadNetwork();

  // Fetch road network from OSM
  await roadNetwork.fetchFromOSM(bounds);

  // Add Queen's University destinations
  roadNetwork.addQueensDestinations();

  // Create spawner
  const spawner = new Spawner(roadNetwork, {
    maxCars: 30, // Limit to 30 cars for performance
    globalSpawnRate: 1.2, // Slightly faster spawning
    despawnRadius: 25, // 25 meters from destination
    defaultCarSpeed: 40, // 40 km/h average
  });

  // Initialize spawn points around Queen's campus
  spawner.initializeQueensSpawnPoints();

  console.log('✅ Spawning system initialized');
  console.log('Spawn points:', spawner.getSpawnPoints().length);
  console.log('Destinations:', roadNetwork.getDestinations().length);

  return { roadNetwork, spawner };
}

/**
 * STEP 2: Update animation loop
 *
 * In your animateCars function, use the spawner's update method:
 */
export function updateSpawner(
  spawner: Spawner,
  deltaTime: number,
  scene: THREE.Scene,
  carMeshes: Map<string, THREE.Mesh>,
  createCarModel: (type: string, color: string) => THREE.Mesh,
  modelTransform: any
) {
  // Update spawner (spawns/despawns cars automatically)
  spawner.update(deltaTime);

  // Get all active cars
  const activeCars = spawner.getActiveCars();

  // Track which cars we've processed
  const processedCarIds = new Set<string>();

  // Update existing cars and create meshes for new cars
  activeCars.forEach((car) => {
    processedCarIds.add(car.id);

    // Create mesh if it doesn't exist
    if (!carMeshes.has(car.id)) {
      const mesh = createCarModel(car.type, car.color);
      mesh.scale.set(
        modelTransform.scale,
        -modelTransform.scale,
        modelTransform.scale
      );
      carMeshes.set(car.id, mesh);
      scene.add(mesh);
    }

    // Update car position along route
    spawner.updateCarPosition(car.id, deltaTime);

    // Update mesh position
    const mesh = carMeshes.get(car.id);
    if (mesh) {
      const worldPos = projectToWorld(car.position);
      mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
      mesh.rotation.z = (car.bearing * Math.PI) / 180;
    }
  });

  // Remove meshes for despawned cars
  carMeshes.forEach((mesh, carId) => {
    if (!processedCarIds.has(carId)) {
      scene.remove(mesh);
      carMeshes.delete(carId);
    }
  });
}

/**
 * STEP 3: Helper functions for Map integration
 */

// Convert lng/lat to world coordinates (same as in Map.tsx)
function projectToWorld(lngLat: [number, number]): THREE.Vector3 {
  const mapboxgl = require('mapbox-gl');
  const projected = mapboxgl.MercatorCoordinate.fromLngLat(lngLat as any, 0);
  return new THREE.Vector3(projected.x, projected.y, 0);
}

/**
 * STEP 4: Traffic light interaction
 *
 * Update the traffic light checking to work with SpawnedCar:
 */
export function checkTrafficLights(
  car: SpawnedCar,
  trafficLights: any[]
): boolean {
  const turf = require('@turf/turf');

  for (const light of trafficLights) {
    const distance = turf.distance(
      turf.point(car.position),
      turf.point(light.position),
      { units: 'meters' }
    );

    if (distance < 30 && (light.state === 'red' || light.state === 'yellow')) {
      return true; // Should stop
    }
  }

  return false; // Can continue
}

/**
 * STEP 5: Speed control
 *
 * Update car speed based on traffic conditions:
 */
export function updateCarSpeed(
  spawner: Spawner,
  carId: string,
  shouldStop: boolean,
  deltaTime: number
) {
  const car = spawner.getCar(carId);
  if (!car) return;

  if (shouldStop) {
    // Brake
    car.speed = Math.max(0, car.speed - 50 * deltaTime);
    car.stoppedAtLight = true;
  } else {
    // Accelerate to max speed
    car.speed = Math.min(car.maxSpeed, car.speed + 30 * deltaTime);
    car.stoppedAtLight = false;
  }
}

/**
 * STEP 6: Visualization for debugging
 *
 * Add spawn points and destinations to the map:
 */
export function addSpawnPointsToMap(map: any, spawner: Spawner) {
  const spawnPoints = spawner.getSpawnPoints();

  map.addSource('spawn-points', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: spawnPoints.map((sp) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: sp.position,
        },
        properties: {
          id: sp.id,
          spawnRate: sp.spawnRate,
          direction: sp.direction,
          active: sp.active,
        },
      })),
    },
  });

  map.addLayer({
    id: 'spawn-points-layer',
    type: 'circle',
    source: 'spawn-points',
    paint: {
      'circle-radius': 8,
      'circle-color': '#00FF00',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#FFFFFF',
      'circle-opacity': 0.7,
    },
  });

  // Add labels
  map.addLayer({
    id: 'spawn-points-labels',
    type: 'symbol',
    source: 'spawn-points',
    layout: {
      'text-field': ['get', 'id'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 10,
      'text-offset': [0, -1.5],
    },
    paint: {
      'text-color': '#00FF00',
      'text-halo-color': '#000000',
      'text-halo-width': 1,
    },
  });
}

export function addDestinationsToMap(map: any, roadNetwork: RoadNetwork) {
  const destinations = roadNetwork.getDestinations();

  map.addSource('destinations', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: destinations.map((dest) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: dest.position,
        },
        properties: {
          id: dest.id,
          name: dest.name,
          type: dest.type,
          weight: dest.weight,
        },
      })),
    },
  });

  map.addLayer({
    id: 'destinations-layer',
    type: 'circle',
    source: 'destinations',
    paint: {
      'circle-radius': 10,
      'circle-color': '#FF00FF',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#FFFFFF',
      'circle-opacity': 0.7,
    },
  });

  // Add labels
  map.addLayer({
    id: 'destinations-labels',
    type: 'symbol',
    source: 'destinations',
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-offset': [0, -1.5],
    },
    paint: {
      'text-color': '#FF00FF',
      'text-halo-color': '#000000',
      'text-halo-width': 1,
    },
  });
}

/**
 * STEP 7: UI Controls
 *
 * Example React component for spawner controls:
 */
export const SpawnerControls = {
  /**
   * Get spawner statistics for UI display
   */
  getStats(spawner: Spawner) {
    return spawner.getStats();
  },

  /**
   * Adjust global spawn rate
   */
  setSpawnRate(spawner: Spawner, rate: number) {
    spawner.updateConfig({ globalSpawnRate: rate });
  },

  /**
   * Adjust max cars
   */
  setMaxCars(spawner: Spawner, max: number) {
    spawner.updateConfig({ maxCars: max });
  },

  /**
   * Toggle a spawn point
   */
  toggleSpawnPoint(spawner: Spawner, spawnPointId: string, active: boolean) {
    spawner.toggleSpawnPoint(spawnPointId, active);
  },

  /**
   * Reset simulation
   */
  reset(spawner: Spawner) {
    spawner.reset();
  },

  /**
   * Clear all cars
   */
  clearAll(spawner: Spawner) {
    spawner.clearAllCars();
  },
};

/**
 * COMPLETE INTEGRATION EXAMPLE
 *
 * Here's how your initializeTrafficSimulation function should look:
 */
export async function completeIntegrationExample(map: any, center: [number, number]) {
  // Define bounds around Queen's University
  const bounds = {
    south: 44.220,
    west: -76.510,
    north: 44.240,
    east: -76.480,
  };

  // Initialize spawning system
  const { roadNetwork, spawner } = await initializeSpawningSystem(bounds);

  // Add visualization layers
  addSpawnPointsToMap(map, spawner);
  addDestinationsToMap(map, roadNetwork);

  // Set up Three.js scene (existing code)
  const carMeshes = new Map<string, THREE.Mesh>();
  const scene = new THREE.Scene();
  const modelTransform = {
    scale: 5.41843220338983e-8,
    // ... other properties
  };

  // Animation loop
  let lastTime = Date.now();

  function animate() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Update spawner (spawns/despawns cars)
    spawner.update(deltaTime);

    // Get active cars
    const activeCars = spawner.getActiveCars();

    // Update each car
    activeCars.forEach((car) => {
      // Create mesh if needed
      if (!carMeshes.has(car.id)) {
        // Create car mesh (use existing createCarModel function)
        const mesh = createCarModel(car.type, car.color);
        carMeshes.set(car.id, mesh);
        scene.add(mesh);
      }

      // Check traffic lights
      const shouldStop = checkTrafficLights(car, trafficLights);
      updateCarSpeed(spawner, car.id, shouldStop, deltaTime);

      // Update position
      spawner.updateCarPosition(car.id, deltaTime);

      // Update mesh
      const mesh = carMeshes.get(car.id);
      if (mesh) {
        const worldPos = projectToWorld(car.position);
        mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
        mesh.rotation.z = (car.bearing * Math.PI) / 180;
      }
    });

    // Remove despawned car meshes
    carMeshes.forEach((mesh, carId) => {
      if (!spawner.getCar(carId)) {
        scene.remove(mesh);
        carMeshes.delete(carId);
      }
    });

    requestAnimationFrame(animate);
  }

  animate();

  // Log stats periodically
  setInterval(() => {
    const stats = spawner.getStats();
    console.log(`🚗 Cars: ${stats.activeCars}/${stats.maxCars} | Spawn points: ${stats.activeSpawnPoints}/${stats.spawnPoints}`);
  }, 5000);
}

// Placeholder for createCarModel (use existing function from Map.tsx)
function createCarModel(type: string, color: string): THREE.Mesh {
  return new THREE.Mesh(); // Replace with actual implementation
}

// Placeholder for traffic lights array
const trafficLights: any[] = [];
