/**
 * @deprecated This component uses Mapbox GL and is being replaced by ThreeMap.tsx
 * which uses Three.js for better 3D rendering. This file is archived and should
 * not be used for new features.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
import * as THREE from "three";
import { RoadNetwork, Destination } from "@/lib/roadNetwork";
import { Pathfinder, Route } from "@/lib/pathfinding";
import { Spawner, SpawnedCar } from "@/lib/spawning";

interface MapProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  style?: string;
  className?: string;
}

type CarType = "sedan" | "suv" | "truck" | "compact";

interface Car {
  id: string;
  position: [number, number];
  routeGeometry: GeoJSON.Feature<GeoJSON.LineString>;
  distance: number; // Distance traveled along route in kilometers
  bearing: number;
  speed: number; // Speed in km/h
  maxSpeed: number; // Maximum speed in km/h
  color: string;
  type: CarType;
  mesh?: THREE.Mesh;
  stoppedAtLight: boolean;
  // Autonomous navigation fields
  destination: Destination;
  route: Route;
  currentEdgeId: string;
  currentNodeId: string;
  distanceOnEdge: number; // Distance traveled on current edge (meters)
}

interface TrafficLight {
  id: string;
  position: [number, number];
  state: "red" | "yellow" | "green";
  timer: number;
  mesh?: THREE.Mesh;
  intersectionId: string; // Group lights by intersection
  direction: "ns" | "ew"; // North-South or East-West
}

const TRAFFIC_LIGHT_TIMINGS = {
  green: 8000,  // 8 seconds
  yellow: 2000, // 2 seconds
  red: 8000,    // 8 seconds
};

// Create 3D car models
function createCarModel(type: CarType, color: string): THREE.Mesh {
  const group = new THREE.Group();
  const material = new THREE.MeshPhongMaterial({ color });

  switch (type) {
    case "sedan": {
      // Car body (lower part)
      const bodyGeometry = new THREE.BoxGeometry(1.8, 0.8, 4.2);
      const body = new THREE.Mesh(bodyGeometry, material);
      body.position.y = 0.4;
      group.add(body);

      // Cabin (upper part)
      const cabinGeometry = new THREE.BoxGeometry(1.6, 0.6, 2.2);
      const cabin = new THREE.Mesh(cabinGeometry, material);
      cabin.position.y = 1.1;
      cabin.position.z = -0.3;
      group.add(cabin);
      break;
    }
    case "suv": {
      // Larger, taller body
      const bodyGeometry = new THREE.BoxGeometry(2.0, 1.0, 4.5);
      const body = new THREE.Mesh(bodyGeometry, material);
      body.position.y = 0.5;
      group.add(body);

      const cabinGeometry = new THREE.BoxGeometry(1.9, 0.8, 2.5);
      const cabin = new THREE.Mesh(cabinGeometry, material);
      cabin.position.y = 1.3;
      cabin.position.z = -0.2;
      group.add(cabin);
      break;
    }
    case "truck": {
      // Truck cab
      const cabGeometry = new THREE.BoxGeometry(2.0, 1.2, 2.0);
      const cab = new THREE.Mesh(cabGeometry, material);
      cab.position.y = 1.0;
      cab.position.z = 1.5;
      group.add(cab);

      // Truck bed
      const bedGeometry = new THREE.BoxGeometry(2.0, 0.8, 3.0);
      const bed = new THREE.Mesh(bedGeometry, material);
      bed.position.y = 0.4;
      bed.position.z = -1.0;
      group.add(bed);
      break;
    }
    case "compact": {
      // Smaller car
      const bodyGeometry = new THREE.BoxGeometry(1.6, 0.7, 3.5);
      const body = new THREE.Mesh(bodyGeometry, material);
      body.position.y = 0.35;
      group.add(body);

      const cabinGeometry = new THREE.BoxGeometry(1.5, 0.5, 2.0);
      const cabin = new THREE.Mesh(cabinGeometry, material);
      cabin.position.y = 0.95;
      cabin.position.z = -0.2;
      group.add(cabin);
      break;
    }
  }

  // Add wheels to all car types
  const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
  const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });

  const wheelPositions = [
    [0.7, 0.3, 1.2],   // front left
    [-0.7, 0.3, 1.2],  // front right
    [0.7, 0.3, -1.2],  // back left
    [-0.7, 0.3, -1.2], // back right
  ];

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  });

  // Convert group to mesh for easier handling
  const finalGeometry = new THREE.BoxGeometry(1, 1, 1);
  const finalMesh = new THREE.Mesh(finalGeometry, material);
  finalMesh.add(group);
  finalMesh.visible = true;

  return finalMesh;
}

// Create traffic light 3D model
function createTrafficLightModel(): THREE.Group {
  const group = new THREE.Group();

  // Pole
  const poleGeometry = new THREE.CylinderGeometry(0.1, 0.1, 5, 8);
  const poleMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
  const pole = new THREE.Mesh(poleGeometry, poleMaterial);
  pole.position.y = 2.5;
  group.add(pole);

  // Light housing
  const housingGeometry = new THREE.BoxGeometry(0.4, 1.2, 0.3);
  const housingMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
  const housing = new THREE.Mesh(housingGeometry, housingMaterial);
  housing.position.y = 5;
  group.add(housing);

  // Lights (red, yellow, green) - use MeshStandardMaterial with emissive
  const lightGeometry = new THREE.SphereGeometry(0.15, 16, 16);

  const redLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0x330000,
      emissiveIntensity: 1,
    })
  );
  redLight.position.set(0, 5.4, 0.2);
  redLight.name = "red";
  group.add(redLight);

  const yellowLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshStandardMaterial({
      color: 0xffff00,
      emissive: 0x333300,
      emissiveIntensity: 1,
    })
  );
  yellowLight.position.set(0, 5.0, 0.2);
  yellowLight.name = "yellow";
  group.add(yellowLight);

  const greenLight = new THREE.Mesh(
    lightGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x003300,
      emissiveIntensity: 1,
    })
  );
  greenLight.position.set(0, 4.6, 0.2);
  greenLight.name = "green";
  group.add(greenLight);

  return group;
}

// Fetch ALL traffic signals from OpenStreetMap Overpass API
async function fetchAllTrafficSignals(): Promise<Array<{
  lat: number;
  lon: number;
  type: string;
  id: number;
}>> {
  try {
    // Bounding box for Queen's University area
    // Format: (south, west, north, east)
    const query = `
      [out:json][timeout:25];
      (
        node["highway"="traffic_signals"](43.640,-79.395,43.660,-79.365);
        node["highway"="stop"](43.640,-79.395,43.660,-79.365);
      );
      out body;
    `;

    console.log("Fetching traffic signals from OpenStreetMap...");
    const response = await fetch(
      `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("⚠️ OSM Overpass API rate limit (429). Using fallback traffic lights.");
      } else {
        console.warn(`⚠️ OSM Overpass API error: ${response.status}. Using fallback.`);
      }
      return []; // Return empty, will trigger fallback
    }

    const data = await response.json();
    console.log(`✅ Found ${data.elements?.length || 0} traffic controls from OSM`);

    return data.elements.map((el: any) => ({
      lat: el.lat,
      lon: el.lon,
      type: el.tags.highway, // "traffic_signals" or "stop"
      id: el.id,
    }));
  } catch (error) {
    console.warn("⚠️ Error fetching from Overpass API. Using fallback traffic lights:", error);
    return [];
  }
}

// Fetch route from Mapbox Directions API (simplified - no intersection data)
async function fetchRoute(
  start: [number, number],
  end: [number, number],
  accessToken: string
): Promise<GeoJSON.Feature<GeoJSON.LineString> | null> {
  try {
    // Use overview=full for maximum detail in road geometry
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start[0]},${start[1]};${end[0]},${end[1]}?geometries=geojson&overview=full&steps=true&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      console.log(`Route has ${route.geometry.coordinates.length} coordinate points`);
      return {
        type: "Feature",
        properties: {},
        geometry: route.geometry,
      };
    }
  } catch (error) {
    console.error("Error fetching route:", error);
  }
  return null;
}

// Define route start/end points around Queen's University
function getRouteEndpoints(): Array<{
  start: [number, number];
  end: [number, number];
  color: string;
  type: CarType;
}> {
  return [
    {
      start: [-79.3820, 43.6460],
      end: [-79.3700, 43.6520],
      color: "#FF0000",
      type: "sedan",
    },
    {
      start: [-79.3700, 43.6520],
      end: [-79.3820, 43.6460],
      color: "#0000FF",
      type: "suv",
    },
    {
      start: [-79.3850, 43.6500],
      end: [-79.3650, 43.6480],
      color: "#00FF00",
      type: "compact",
    },
    {
      start: [-79.3650, 43.6550],
      end: [-79.3800, 43.6450],
      color: "#FFA500",
      type: "truck",
    },
  ];
}

// Define real intersections around Queen's University campus
function getRealIntersections(): Array<{
  id: string;
  name: string;
  center: [number, number];
}> {
  return [
    {
      id: "front-bay",
      name: "Front St & Bay St",
      center: [-79.3800, 43.6485],
    },
    {
      id: "king-yonge",
      name: "King St & Yonge St",
      center: [-79.3780, 43.6488],
    },
    {
      id: "queen-spadina",
      name: "Queen St W & Spadina Ave",
      center: [-79.3940, 43.6488],
    },
  ];
}

// Find which routes pass near this intersection and place lights
function placeTrafficLightsForIntersection(
  intersection: { id: string; center: [number, number] },
  routes: Array<{ route: GeoJSON.Feature<GeoJSON.LineString>; routeId: number }>
): TrafficLight[] {
  const lights: TrafficLight[] = [];
  const INTERSECTION_RADIUS = 50; // meters

  routes.forEach(({ route, routeId }) => {
    try {
      // Check if route passes near this intersection
      const nearestPoint = turf.nearestPointOnLine(route, turf.point(intersection.center));
      const distance = turf.distance(
        turf.point(intersection.center),
        nearestPoint,
        { units: 'meters' }
      );

      if (distance < INTERSECTION_RADIUS) {
        // This route passes through the intersection
        const approachDistance = Math.max(0, nearestPoint.properties.location! - 0.015); // 15m before
        const lightPosition = turf.along(route, approachDistance, { units: 'kilometers' });

        // Calculate bearing to determine direction
        const nextPoint = turf.along(route, approachDistance + 0.005, { units: 'kilometers' });
        const bearing = turf.bearing(
          turf.point(lightPosition.geometry.coordinates),
          turf.point(nextPoint.geometry.coordinates)
        );

        const normalizedBearing = ((bearing + 360) % 360);
        const direction: "ns" | "ew" =
          (normalizedBearing > 45 && normalizedBearing < 135) ||
          (normalizedBearing > 225 && normalizedBearing < 315)
            ? "ew"
            : "ns";

        lights.push({
          id: `${intersection.id}-route-${routeId}`,
          position: lightPosition.geometry.coordinates as [number, number],
          state: "red",
          timer: Date.now(),
          intersectionId: intersection.id,
          direction,
        });

        console.log(`Placed light at ${intersection.id} for route ${routeId} (${direction})`);
      }
    } catch (e) {
      console.error("Error placing light:", e);
    }
  });

  return lights;
}

// Place traffic lights on approach to intersection
function placeTrafficLightsAtIntersection(
  intersection: [number, number],
  route: GeoJSON.Feature<GeoJSON.LineString>,
  routeIndex: number
): { position: [number, number]; direction: "ns" | "ew"; bearing: number } | null {
  try {
    // Find the point on the route closest to the intersection
    const nearestPoint = turf.nearestPointOnLine(route, turf.point(intersection));
    const distanceToIntersection = nearestPoint.properties.location || 0;

    // Place light 15 meters before the intersection
    const approachDistance = Math.max(0, distanceToIntersection - 0.015); // 15m in km
    const lightPosition = turf.along(route, approachDistance, { units: 'kilometers' });

    // Calculate bearing at this point to determine direction
    const nextPoint = turf.along(route, approachDistance + 0.005, { units: 'kilometers' });
    const bearing = turf.bearing(
      turf.point(lightPosition.geometry.coordinates),
      turf.point(nextPoint.geometry.coordinates)
    );

    // Determine if this is primarily N-S or E-W based on bearing
    // 0° = North, 90° = East, 180° = South, 270° = West
    const normalizedBearing = ((bearing + 360) % 360);
    const direction: "ns" | "ew" =
      (normalizedBearing > 45 && normalizedBearing < 135) ||
      (normalizedBearing > 225 && normalizedBearing < 315)
        ? "ew"
        : "ns";

    return {
      position: lightPosition.geometry.coordinates as [number, number],
      direction,
      bearing: normalizedBearing,
    };
  } catch (e) {
    console.error("Error placing traffic light:", e);
    return null;
  }
}

// Add debug visualization of road network
function addRoadNetworkDebugVisualization(map: mapboxgl.Map, network: RoadNetwork) {
  console.log('🎨 Adding road network debug visualization...');

  // Visualize road edges
  const edgeFeatures = network.getEdges().map(edge => ({
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: edge.geometry,
    },
    properties: {
      name: edge.name || 'Unnamed',
      speedLimit: edge.speedLimit,
      oneway: edge.oneway,
    },
  }));

  map.addSource('road-network-edges', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: edgeFeatures,
    },
  });

  map.addLayer({
    id: 'road-network-edges-layer',
    type: 'line',
    source: 'road-network-edges',
    paint: {
      'line-color': '#4CAF50',
      'line-width': 2,
      'line-opacity': 0.6,
    },
  });

  // Visualize intersections (nodes with 3+ connections)
  const intersectionFeatures = network.getNodes()
    .filter(node => node.type === 'intersection')
    .map(node => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: node.position,
      },
      properties: {
        connections: node.connectedEdges.length,
      },
    }));

  map.addSource('road-network-intersections', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: intersectionFeatures,
    },
  });

  map.addLayer({
    id: 'road-network-intersections-layer',
    type: 'circle',
    source: 'road-network-intersections',
    paint: {
      'circle-radius': 6,
      'circle-color': '#FF9800',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.8,
    },
  });

  // Visualize destinations
  const destinationFeatures = network.getDestinations().map(dest => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: dest.position,
    },
    properties: {
      name: dest.name,
      type: dest.type,
    },
  }));

  map.addSource('road-network-destinations', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: destinationFeatures,
    },
  });

  map.addLayer({
    id: 'road-network-destinations-layer',
    type: 'circle',
    source: 'road-network-destinations',
    paint: {
      'circle-radius': 8,
      'circle-color': '#2196F3',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
      'circle-opacity': 0.9,
    },
  });

  console.log(`✅ Debug visualization added: ${edgeFeatures.length} edges, ${intersectionFeatures.length} intersections, ${destinationFeatures.length} destinations`);
}

// Initialize traffic simulation with 3D models
async function initializeTrafficSimulation(
  map: mapboxgl.Map,
  center: [number, number],
  onProgress?: (status: string) => void,
  debugVisualization: boolean = false
) {
  console.log('🚗 Initializing traffic simulation...');
  onProgress?.('Initializing road network...');

  const accessToken = mapboxgl.accessToken;
  const trafficLights: TrafficLight[] = [];
  const routeEndpoints = getRouteEndpoints(); // Used for fallback traffic light placement

  // Initialize road network and pathfinding
  const roadNetwork = new RoadNetwork();
  let pathfinder: Pathfinder;

  try {
    onProgress?.('Fetching road network from OpenStreetMap...');
    await roadNetwork.fetchFromOSM({
      south: 43.640,
      west: -79.395,
      north: 43.660,
      east: -79.365,
    });

    onProgress?.('Adding Queen\'s University destinations...');
    roadNetwork.addQueensDestinations();

    pathfinder = new Pathfinder(roadNetwork);

    console.log('✅ Road network loaded successfully');
    console.log(`   Nodes: ${roadNetwork.getNodes().length}`);
    console.log(`   Edges: ${roadNetwork.getEdges().length}`);
    console.log(`   Destinations: ${roadNetwork.getDestinations().length}`);

    // Add debug visualization if enabled
    if (debugVisualization) {
      addRoadNetworkDebugVisualization(map, roadNetwork);
    }
  } catch (error) {
    console.error('❌ Failed to load road network:', error);
    onProgress?.('Error loading road network. Using fallback mode.');
    throw error; // Re-throw to be handled by caller
  }

  onProgress?.('Setting up simulation...');

  // Mapbox GL JS to Mercator projection utilities
  const modelTransform = {
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    rotateX: Math.PI / 2,
    rotateY: 0,
    rotateZ: 0,
    scale: 5.41843220338983e-8,
  };

  // Fetch ALL traffic signals from OpenStreetMap (one-time)
  const osmTrafficSignals = await fetchAllTrafficSignals();

  // Initialize dynamic spawning system
  console.log("🚗 Initializing dynamic car spawning system...");

  const spawner = new Spawner(roadNetwork, {
    maxCars: 30, // Maximum 30 concurrent cars
    globalSpawnRate: 1.2, // 20% faster spawning
    despawnRadius: 25, // Despawn within 25m of destination
    defaultCarSpeed: 40, // 40 km/h average speed
    carTypeDistribution: {
      sedan: 0.4,   // 40%
      suv: 0.25,    // 25%
      truck: 0.15,  // 15%
      compact: 0.2, // 20%
    },
  });

  // Initialize spawn points around Queen's campus
  spawner.initializeQueensSpawnPoints();

  console.log(`✅ Spawner initialized with ${spawner.getSpawnPoints().length} spawn points`);
  console.log(`   Max cars: ${spawner.getConfig().maxCars}`);
  console.log(`   Spawn rate: ${spawner.getConfig().globalSpawnRate}x`);

  // Track car meshes separately (meshes persist, cars are managed by spawner)
  // Use object instead of Map to avoid naming conflict with component
  const carMeshes: Record<string, THREE.Mesh> = {};

  // Convert OSM signals to our format
  const uniqueSignals: Array<{
    id: string;
    location: [number, number];
    type: string;
  }> = osmTrafficSignals.map((signal, idx) => ({
    id: `osm-${signal.id}`,
    location: [signal.lon, signal.lat], // Note: OSM is [lat, lon], we need [lon, lat]
    type: signal.type,
  }));

  console.log(`Using ${uniqueSignals.length} traffic signals from OpenStreetMap`);

  // Fallback: if OSM returns no signals, use manual intersections
  if (uniqueSignals.length === 0) {
    console.warn("⚠️ No signals from OSM, using manual fallback intersections");
    const manualIntersections = getRealIntersections();
    manualIntersections.forEach((intersection) => {
      uniqueSignals.push({
        id: intersection.id,
        location: intersection.center,
        type: 'traffic_signals',
      });
    });
  }

  // Create traffic lights at each OSM signal location
  uniqueSignals.forEach((signal, idx) => {
    const lightsAtSignal: TrafficLight[] = [];

    // Check each car/route to see if it passes near this signal
    cars.forEach((car, carIdx) => {
      const routeIdx = Math.floor(carIdx / 2); // Each route has 2 cars

      try {
        // Check if route actually passes near this signal (within 40m)
        const nearestOnRoute = turf.nearestPointOnLine(car.routeGeometry, turf.point(signal.location));
        const distanceToRoute = turf.distance(
          turf.point(signal.location),
          nearestOnRoute,
          { units: 'meters' }
        );

        if (distanceToRoute > 40) {
          // Route doesn't pass near this signal
          return;
        }

        // Find position 15m before the signal on this route
        const distanceToSignal = nearestOnRoute.properties.location || 0;
        const approachDistance = Math.max(0, distanceToSignal - 0.015); // 15m before

        const lightPosition = turf.along(car.routeGeometry, approachDistance, { units: 'kilometers' });

        // Calculate bearing to determine direction
        const nextPoint = turf.along(car.routeGeometry, approachDistance + 0.005, { units: 'kilometers' });
        const bearing = turf.bearing(
          turf.point(lightPosition.geometry.coordinates),
          turf.point(nextPoint.geometry.coordinates)
        );

        const normalizedBearing = ((bearing + 360) % 360);
        const direction: "ns" | "ew" =
          (normalizedBearing > 45 && normalizedBearing < 135) ||
          (normalizedBearing > 225 && normalizedBearing < 315)
            ? "ew"
            : "ns";

        // Check if we already have a light for this route at this signal
        const alreadyExists = lightsAtSignal.some(l => l.id.includes(`route-${routeIdx}`));
        if (!alreadyExists) {
          lightsAtSignal.push({
            id: `${signal.id}-route-${routeIdx}`,
            position: lightPosition.geometry.coordinates as [number, number],
            state: "red",
            timer: Date.now(),
            intersectionId: signal.id,
            direction,
          });

          console.log(`✅ Placed light at OSM signal ${signal.id} for route ${routeIdx} (${direction}, ${normalizedBearing.toFixed(0)}°, ${distanceToRoute.toFixed(1)}m from signal)`);
        }
      } catch (e) {
        console.error(`Error placing light at signal ${signal.id}:`, e);
      }
    });

    // Set initial states - alternate NS and EW
    const nsLights = lightsAtSignal.filter(l => l.direction === "ns");
    const ewLights = lightsAtSignal.filter(l => l.direction === "ew");

    nsLights.forEach(light => {
      light.state = "green";
      trafficLights.push(light);
    });

    ewLights.forEach(light => {
      light.state = "red";
      trafficLights.push(light);
    });

    console.log(`Signal ${idx} at [${signal.location}]: ${nsLights.length} NS lights (green), ${ewLights.length} EW lights (red)`);
  });

  console.log(`✅ Created ${cars.length} cars and ${trafficLights.length} traffic lights`);

  if (trafficLights.length === 0) {
    console.error("⚠️ WARNING: No traffic lights were created! Check the console logs above.");
  } else {
    console.log("Traffic light positions:", trafficLights.map(l => ({
      id: l.id,
      pos: l.position,
      state: l.state,
      dir: l.direction
    })));
  }

  // Add route visualization (for debugging)
  // Routes will be updated dynamically as cars spawn
  map.addSource('car-routes', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [], // Start empty, will be populated by spawner
    },
  });

  map.addLayer({
    id: 'car-routes-layer',
    type: 'line',
    source: 'car-routes',
    paint: {
      'line-color': '#888',
      'line-width': 3,
      'line-opacity': 0.5,
    },
  });

  // Add 2D car markers (for debugging/fallback)
  map.addSource('cars', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [],
    },
  });

  map.addLayer({
    id: 'cars-2d-layer',
    type: 'circle',
    source: 'cars',
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  });

  // Add traffic light markers (2D for debugging)
  map.addSource('traffic-lights', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: trafficLights.map(light => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: light.position,
        },
        properties: {
          state: light.state,
        },
      })),
    },
  });

  map.addLayer({
    id: 'traffic-lights-layer',
    type: 'circle',
    source: 'traffic-lights',
    paint: {
      'circle-radius': 10,
      'circle-color': [
        'match',
        ['get', 'state'],
        'red', '#ff0000',
        'yellow', '#ffff00',
        'green', '#00ff00',
        '#888888'
      ],
      'circle-stroke-width': 3,
      'circle-stroke-color': '#000',
    },
  });

  // Custom Three.js layer
  let threeScene: THREE.Scene | null = null;
  const customLayer: mapboxgl.CustomLayerInterface = {
    id: '3d-model',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (map: mapboxgl.Map, gl: WebGLRenderingContext) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      threeScene = this.scene;

      // Lighting
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 70, 100).normalize();
      this.scene.add(directionalLight);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambientLight);

      // Car meshes are created dynamically by spawner in animation loop
      // No need to pre-create them here

      // Create traffic light meshes
      trafficLights.forEach(light => {
        const mesh = createTrafficLightModel();
        mesh.scale.set(
          modelTransform.scale,
          -modelTransform.scale,
          modelTransform.scale
        );
        light.mesh = mesh as any;
        this.scene.add(mesh);
      });

      this.map = map;

      // Create WebGL renderer without sharing context
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        antialias: true,
        alpha: true,
      });

      this.renderer.autoClear = false;
    },

    render: function (gl: WebGLRenderingContext, matrix: number[]) {
      const rotationX = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(1, 0, 0),
        modelTransform.rotateX
      );
      const rotationY = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 1, 0),
        modelTransform.rotateY
      );
      const rotationZ = new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(0, 0, 1),
        modelTransform.rotateZ
      );

      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(
          modelTransform.translateX,
          modelTransform.translateY,
          modelTransform.translateZ
        )
        .scale(
          new THREE.Vector3(
            modelTransform.scale,
            -modelTransform.scale,
            modelTransform.scale
          )
        )
        .multiply(rotationX)
        .multiply(rotationY)
        .multiply(rotationZ);

      this.camera.projectionMatrix = m.multiply(l);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  } as any;

  map.addLayer(customLayer);

  // Helper: Convert lng/lat to world coordinates
  function projectToWorld(lngLat: [number, number]): THREE.Vector3 {
    const projected = mapboxgl.MercatorCoordinate.fromLngLat(lngLat as any, 0);
    return new THREE.Vector3(projected.x, projected.y, 0);
  }

  // Helper: Check if car is near traffic light
  function isNearTrafficLight(car: Car, light: TrafficLight): boolean {
    const distance = turf.distance(
      turf.point(car.position),
      turf.point(light.position),
      { units: 'meters' }
    );
    return distance < 30; // Within 30 meters
  }

  // Update traffic lights with coordinated timing
  function updateTrafficLights() {
    const now = Date.now();

    // Group lights by intersection (using object instead of Map to avoid naming conflict)
    const intersectionGroups: Record<string, TrafficLight[]> = {};
    trafficLights.forEach(light => {
      if (!intersectionGroups[light.intersectionId]) {
        intersectionGroups[light.intersectionId] = [];
      }
      intersectionGroups[light.intersectionId].push(light);
    });

    // Update each intersection's lights together
    Object.entries(intersectionGroups).forEach(([intersectionId, lights]) => {
      // Use the first light's timer to coordinate the whole intersection
      const primaryLight = lights[0];
      const elapsed = now - primaryLight.timer;
      const duration = TRAFFIC_LIGHT_TIMINGS[primaryLight.state];

      if (elapsed >= duration) {
        // Cycle all lights at this intersection
        lights.forEach(light => {
          if (light.state === "green") {
            light.state = "yellow";
          } else if (light.state === "yellow") {
            light.state = "red";
          } else {
            // When changing from red to green, only change the opposite direction
            // NS and EW should alternate
            const nsLights = lights.filter(l => l.direction === "ns");
            const ewLights = lights.filter(l => l.direction === "ew");

            const nsAreRed = nsLights.every(l => l.state === "red");
            const ewAreRed = ewLights.every(l => l.state === "red");

            if (nsAreRed && light.direction === "ns") {
              light.state = "green";
            } else if (ewAreRed && light.direction === "ew") {
              light.state = "green";
            }
          }
          light.timer = now;

          // Update light visualization
          if (light.mesh) {
            const redLight = light.mesh.getObjectByName("red") as THREE.Mesh;
            const yellowLight = light.mesh.getObjectByName("yellow") as THREE.Mesh;
            const greenLight = light.mesh.getObjectByName("green") as THREE.Mesh;

            if (redLight && yellowLight && greenLight) {
              const redMaterial = redLight.material as THREE.MeshStandardMaterial;
              const yellowMaterial = yellowLight.material as THREE.MeshStandardMaterial;
              const greenMaterial = greenLight.material as THREE.MeshStandardMaterial;

              if (redMaterial.emissive) {
                redMaterial.emissive.setHex(light.state === "red" ? 0xff0000 : 0x330000);
              }
              if (yellowMaterial.emissive) {
                yellowMaterial.emissive.setHex(light.state === "yellow" ? 0xffff00 : 0x333300);
              }
              if (greenMaterial.emissive) {
                greenMaterial.emissive.setHex(light.state === "green" ? 0x00ff00 : 0x003300);
              }
            }
          }
        });
      }
    });
  }

  // Animation loop
  let lastTime = Date.now();

  function animateCars() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Update traffic lights
    updateTrafficLights();

    // Update spawner (handles spawning/despawning automatically)
    spawner.update(deltaTime);

    // Get all active cars from spawner
    const activeCars = spawner.getActiveCars();

    // Track which cars we've processed
    const processedCarIds = new Set<string>();

    // Update each active car
    activeCars.forEach((spawnedCar) => {
      processedCarIds.add(spawnedCar.id);

      // Create mesh if it doesn't exist
      if (!carMeshes[spawnedCar.id]) {
        const mesh = createCarModel(spawnedCar.type, spawnedCar.color);
        mesh.scale.set(
          modelTransform.scale,
          -modelTransform.scale,
          modelTransform.scale
        );
        carMeshes[spawnedCar.id] = mesh;
        if (threeScene) {
          threeScene.add(mesh);
        }
      }

      // Check traffic lights
      let shouldStop = false;
      for (const light of trafficLights) {
        const distance = turf.distance(
          turf.point(spawnedCar.position),
          turf.point(light.position),
          { units: 'meters' }
        );

        if (distance < 30 && (light.state === "red" || light.state === "yellow")) {
          shouldStop = true;
          spawnedCar.stoppedAtLight = true;
          break;
        }
      }

      if (!shouldStop) {
        spawnedCar.stoppedAtLight = false;
      }

      // Update speed based on traffic lights
      if (spawnedCar.stoppedAtLight) {
        spawnedCar.speed = Math.max(0, spawnedCar.speed - 50 * deltaTime); // Brake
      } else {
        spawnedCar.speed = Math.min(spawnedCar.maxSpeed, spawnedCar.speed + 30 * deltaTime); // Accelerate
      }

      // Update car position along route (handled by spawner)
      spawner.updateCarPosition(spawnedCar.id, deltaTime);

      // Update 3D mesh position
      const mesh = carMeshes[spawnedCar.id];
      if (mesh) {
        const worldPos = projectToWorld(spawnedCar.position);
        mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
        mesh.rotation.z = (spawnedCar.bearing * Math.PI) / 180;
      }
    });

    // Remove meshes for despawned cars
    Object.entries(carMeshes).forEach(([carId, mesh]) => {
      if (!processedCarIds.has(carId)) {
        if (threeScene) {
          threeScene.remove(mesh);
        }
        delete carMeshes[carId];
      }
    });

    // Update traffic light positions
    trafficLights.forEach(light => {
      if (light.mesh) {
        const worldPos = projectToWorld(light.position);
        light.mesh.position.set(worldPos.x, worldPos.y, worldPos.z);
      }
    });

    // Update 2D car markers (check if source exists first)
    if (map && map.getSource && map.getSource('cars')) {
      const carsSource = map.getSource('cars') as mapboxgl.GeoJSONSource;
      if (carsSource && carsSource.setData) {
        carsSource.setData({
          type: 'FeatureCollection',
          features: activeCars.map(car => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: car.position,
            },
            properties: {
              id: car.id,
              color: car.color,
              speed: car.speed.toFixed(1),
            },
          })),
        });
      }
    }

    // Update route visualization (check if source exists first)
    if (map && map.getSource && map.getSource('car-routes')) {
      const routesSource = map.getSource('car-routes') as mapboxgl.GeoJSONSource;
      if (routesSource && routesSource.setData) {
        routesSource.setData({
          type: 'FeatureCollection',
          features: activeCars.map(car => ({
            type: 'Feature',
            properties: { carId: car.id },
            geometry: {
              type: 'LineString',
              coordinates: car.route.waypoints,
            },
          })),
        });
      }
    }

    // Update traffic light markers (check if source exists first)
    if (map && map.getSource && map.getSource('traffic-lights')) {
      const lightsSource = map.getSource('traffic-lights') as mapboxgl.GeoJSONSource;
      if (lightsSource && lightsSource.setData) {
        lightsSource.setData({
          type: 'FeatureCollection',
          features: trafficLights.map(light => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: light.position,
            },
            properties: {
              state: light.state,
            },
          })),
        });
      }
    }

    requestAnimationFrame(animateCars);
  }

  console.log("Starting 3D animation with dynamic spawning...");
  animateCars();

  // Log spawner stats periodically
  setInterval(() => {
    const stats = spawner.getStats();
    console.log(`🚗 Traffic Stats: ${stats.activeCars}/${stats.maxCars} cars | ${stats.activeSpawnPoints}/${stats.spawnPoints} spawn points active`);
  }, 10000); // Every 10 seconds
}

export default function Map({
  initialCenter = [-79.3800, 43.6500], // Downtown Toronto - Union Station area
  initialZoom = 18.5,
  style = "mapbox://styles/mapbox/standard", // Standard style with enhanced 3D buildings
  className = "w-full h-full",
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const initialized = useRef(false); // Prevent multiple initializations
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isSatellite, setIsSatellite] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string>('Initializing map...');
  const [networkError, setNetworkError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (initialized.current) return; // Already initialized, skip
    initialized.current = true; // Mark as initialized

    // Set Mapbox access token
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || "";

    // Starting position - initial animation point
    const startCenter: [number, number] = [-79.3800, 43.6500];
    const startZoom = 13;

    // Initialize map with starting position
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: style,
      center: startCenter,
      zoom: startZoom,
      pitch: 30, // Tilt for 3D effect
      bearing: 180,
      // Configure Standard style for monochrome/gray theme
      config: {
        basemap: {
          lightPreset: "day",
          showPointOfInterestLabels: false,
          showPlaceLabels: false,
          showRoadLabels: true,
        },
      },
    });

    // Add navigation controls
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Add geolocate control for user's current location
    const geolocateControl = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserHeading: true,
      showUserLocation: true,
    });
    map.current.addControl(geolocateControl, "top-right");

    // Set map loaded state and start zoom animation
    map.current.on("load", async () => {
      setMapLoaded(true);

      if (!map.current) return;

      const mapInstance = map.current;

      try {
        // Initialize traffic simulation with progress updates
        await initializeTrafficSimulation(
          mapInstance,
          initialCenter,
          (status) => setLoadingStatus(status),
          false // Set to true to enable debug visualization
        );

        setLoadingStatus('Simulation ready');
        setNetworkError(null);
      } catch (error) {
        console.error('Failed to initialize simulation:', error);
        setNetworkError(error instanceof Error ? error.message : 'Failed to load road network');
        setLoadingStatus('Error - Running in limited mode');
      }

      // Fly to Queen's University after a short delay
      setTimeout(() => {
        map.current?.flyTo({
          center: initialCenter,
          zoom: initialZoom,
          pitch: 60,
          bearing: 220,
          duration: 3000, // 3 seconds animation
          essential: true,
        });
      }, 500);
    });

    // Cleanup on unmount
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // Empty dependency array - only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle satellite view
  const toggleSatellite = () => {
    if (map.current) {
      const newStyle = isSatellite
        ? "mapbox://styles/mapbox/standard"
        : "mapbox://styles/mapbox/satellite-streets-v12";

      // When style loads, re-add our custom layers
      map.current.once('style.load', () => {
        if (!map.current) return;

        // Re-add car routes layer
        if (!map.current.getSource('car-routes')) {
          map.current.addSource('car-routes', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          });
        }

        if (!map.current.getLayer('car-routes-layer')) {
          map.current.addLayer({
            id: 'car-routes-layer',
            type: 'line',
            source: 'car-routes',
            paint: {
              'line-color': '#888',
              'line-width': 3,
              'line-opacity': 0.5,
            },
          });
        }

        // Re-add cars layer
        if (!map.current.getSource('cars')) {
          map.current.addSource('cars', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          });
        }

        if (!map.current.getLayer('cars-2d-layer')) {
          map.current.addLayer({
            id: 'cars-2d-layer',
            type: 'circle',
            source: 'cars',
            paint: {
              'circle-radius': 8,
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#fff',
            },
          });
        }

        // Re-add traffic lights layer
        if (!map.current.getSource('traffic-lights')) {
          map.current.addSource('traffic-lights', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: [],
            },
          });
        }

        if (!map.current.getLayer('traffic-lights-layer')) {
          map.current.addLayer({
            id: 'traffic-lights-layer',
            type: 'circle',
            source: 'traffic-lights',
            paint: {
              'circle-radius': 10,
              'circle-color': [
                'match',
                ['get', 'state'],
                'red', '#ff0000',
                'yellow', '#ffff00',
                'green', '#00ff00',
                '#888888'
              ],
              'circle-stroke-width': 3,
              'circle-stroke-color': '#000',
            },
          });
        }
      });

      map.current.setStyle(newStyle);
      setIsSatellite(!isSatellite);
    }
  };

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className={className} />

      {/* Loading overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center">
            <div className="mb-4">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" role="status">
                <span className="!absolute !-m-px !h-px !w-px !overflow-hidden !whitespace-nowrap !border-0 !p-0 ![clip:rect(0,0,0,0)]">Loading...</span>
              </div>
            </div>
            <p className="text-gray-600 dark:text-gray-400">{loadingStatus}</p>
          </div>
        </div>
      )}

      {/* Error notification */}
      {networkError && mapLoaded && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 px-4 py-3 rounded-lg shadow-lg z-20 max-w-md">
          <div className="flex items-center">
            <span className="mr-2">⚠️</span>
            <div>
              <p className="font-bold">Road Network Error</p>
              <p className="text-sm">{networkError}</p>
            </div>
            <button
              onClick={() => setNetworkError(null)}
              className="ml-4 text-red-700 dark:text-red-200 hover:text-red-900 dark:hover:text-red-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Status indicator when loaded */}
      {mapLoaded && !networkError && loadingStatus !== 'Simulation ready' && (
        <div className="absolute top-20 left-4 bg-blue-100 dark:bg-blue-900 border border-blue-400 dark:border-blue-600 text-blue-700 dark:text-blue-200 px-3 py-2 rounded-lg shadow-md z-10 text-sm">
          {loadingStatus}
        </div>
      )}

      {/* Satellite toggle button */}
      <button
        onClick={toggleSatellite}
        className="absolute top-4 left-4 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors z-10 font-medium text-sm"
      >
        {isSatellite ? "🗺️ Standard" : "🛰️ Satellite"}
      </button>
    </div>
  );
}
