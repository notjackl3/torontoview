/**
 * Vehicle Rendering System with Visual Enhancements
 * Phase 3: Visual improvements including turn signals, brake lights, and enhanced car models
 */

import * as THREE from 'three';
import { CarType } from './spawning';

export interface VehicleLights {
  turnSignalLeft?: THREE.PointLight;
  turnSignalRight?: THREE.PointLight;
  brakeLights?: THREE.PointLight[];
  headlights?: THREE.PointLight[];
}

export interface EnhancedVehicleMesh extends THREE.Mesh {
  lights?: VehicleLights;
  turnSignalState?: 'left' | 'right' | 'none';
  brakeState?: boolean;
  lastTurnSignalToggle?: number;
  previousBearing?: number;
}

const TURN_SIGNAL_BLINK_INTERVAL = 500; // ms
const BRAKE_LIGHT_COLOR = 0xff0000; // Red
const TURN_SIGNAL_COLOR = 0xffa500; // Orange
const HEADLIGHT_COLOR = 0xffffee; // Warm white

/**
 * Create an enhanced 3D car model with visual improvements
 * Includes turn signals, brake lights, and better geometry
 */
export function createEnhancedCarModel(type: CarType, color: string): EnhancedVehicleMesh {
  const group = new THREE.Group();
  const material = new THREE.MeshPhongMaterial({
    color,
    shininess: 50,
    specular: 0x444444,
  });

  // Real-world dimensions in meters, scaled by map SCALE_FACTOR (10/1.4)
  const S = 10 / 1.4;
  let bodyLength: number, bodyWidth: number, bodyHeight: number;
  let cabinLength: number, cabinWidth: number, cabinHeight: number;

  switch (type) {
    case 'sedan': {
      bodyLength = 4.2 * S;
      bodyWidth = 1.8 * S;
      bodyHeight = 0.8 * S;
      cabinLength = 2.2 * S;
      cabinWidth = 1.6 * S;
      cabinHeight = 0.6 * S;
      break;
    }
    case 'suv': {
      bodyLength = 4.5 * S;
      bodyWidth = 2.0 * S;
      bodyHeight = 1.0 * S;
      cabinLength = 2.5 * S;
      cabinWidth = 1.9 * S;
      cabinHeight = 0.8 * S;
      break;
    }
    case 'truck': {
      bodyLength = 5.0 * S;
      bodyWidth = 2.0 * S;
      bodyHeight = 0.8 * S;
      cabinLength = 2.0 * S;
      cabinWidth = 2.0 * S;
      cabinHeight = 1.2 * S;
      break;
    }
    case 'compact': {
      bodyLength = 3.5 * S;
      bodyWidth = 1.6 * S;
      bodyHeight = 0.7 * S;
      cabinLength = 2.0 * S;
      cabinWidth = 1.5 * S;
      cabinHeight = 0.5 * S;
      break;
    }
  }

  // Main body with rounded edges
  const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyLength);
  const body = new THREE.Mesh(bodyGeometry, material);
  body.position.y = bodyHeight / 2;
  group.add(body);

  // Cabin (top part)
  const cabinGeometry = new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinLength);
  const cabin = new THREE.Mesh(cabinGeometry, material);
  cabin.position.y = bodyHeight + cabinHeight / 2;
  cabin.position.z = type === 'truck' ? bodyLength * 0.15 : -bodyLength * 0.07;
  group.add(cabin);

  // Add glass windows (darker, semi-transparent)
  const glassMaterial = new THREE.MeshPhongMaterial({
    color: 0x111111,
    transparent: true,
    opacity: 0.3,
    shininess: 100,
  });

  // Front windshield
  const windshieldGeometry = new THREE.BoxGeometry(cabinWidth * 0.95, cabinHeight * 0.9, 0.1);
  const frontWindshield = new THREE.Mesh(windshieldGeometry, glassMaterial);
  frontWindshield.position.y = bodyHeight + cabinHeight / 2;
  frontWindshield.position.z = cabin.position.z + cabinLength / 2;
  group.add(frontWindshield);

  // Rear windshield
  const rearWindshield = new THREE.Mesh(windshieldGeometry, glassMaterial);
  rearWindshield.position.y = bodyHeight + cabinHeight / 2;
  rearWindshield.position.z = cabin.position.z - cabinLength / 2;
  group.add(rearWindshield);

  // Wheels with better detail
  const wheelRadius = 0.3 * S;
  const wheelWidth = 0.2 * S;
  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 16);
  const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
  const rimMaterial = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 });

  const wheelPositions = [
    [bodyWidth * 0.45, wheelRadius, bodyLength * 0.28],
    [-bodyWidth * 0.45, wheelRadius, bodyLength * 0.28],
    [bodyWidth * 0.45, wheelRadius, -bodyLength * 0.28],
    [-bodyWidth * 0.45, wheelRadius, -bodyLength * 0.28],
  ];

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);

    // Add rim
    const rimGeometry = new THREE.CylinderGeometry(0.15 * S, 0.15 * S, 0.25 * S, 16);
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, y, z);
    group.add(rim);
  });

  // Headlights (white point lights at front)
  const headlightGeometry = new THREE.SphereGeometry(0.12 * S, 16, 16);
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffee,
    emissive: 0xffffaa,
    emissiveIntensity: 0.5,
  });

  const headlightPositions = [
    [bodyWidth * 0.35, bodyHeight * 0.4, bodyLength * 0.5],
    [-bodyWidth * 0.35, bodyHeight * 0.4, bodyLength * 0.5],
  ];

  const headlights: THREE.PointLight[] = [];
  headlightPositions.forEach(([x, y, z]) => {
    const headlightMesh = new THREE.Mesh(headlightGeometry, headlightMaterial);
    headlightMesh.position.set(x, y, z);
    group.add(headlightMesh);

    // Add point light
    const headlight = new THREE.PointLight(HEADLIGHT_COLOR, 0.3, 15 * S);
    headlight.position.set(x, y, z);
    group.add(headlight);
    headlights.push(headlight);
  });

  // Turn signals (orange lights on front corners)
  const turnSignalGeometry = new THREE.SphereGeometry(0.1 * S, 16, 16);
  const turnSignalMaterial = new THREE.MeshStandardMaterial({
    color: TURN_SIGNAL_COLOR,
    emissive: 0x000000, // Start off
    emissiveIntensity: 0,
  });

  const turnSignalLeft = new THREE.PointLight(TURN_SIGNAL_COLOR, 0, 8 * S);
  turnSignalLeft.position.set(-bodyWidth * 0.45, bodyHeight * 0.4, bodyLength * 0.45);
  group.add(turnSignalLeft);

  const turnSignalLeftMesh = new THREE.Mesh(turnSignalGeometry, turnSignalMaterial.clone());
  turnSignalLeftMesh.position.copy(turnSignalLeft.position);
  group.add(turnSignalLeftMesh);

  const turnSignalRight = new THREE.PointLight(TURN_SIGNAL_COLOR, 0, 8 * S);
  turnSignalRight.position.set(bodyWidth * 0.45, bodyHeight * 0.4, bodyLength * 0.45);
  group.add(turnSignalRight);

  const turnSignalRightMesh = new THREE.Mesh(turnSignalGeometry, turnSignalMaterial.clone());
  turnSignalRightMesh.position.copy(turnSignalRight.position);
  group.add(turnSignalRightMesh);

  // Brake lights (red lights at rear)
  const brakeLightGeometry = new THREE.SphereGeometry(0.1 * S, 16, 16);
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: BRAKE_LIGHT_COLOR,
    emissive: 0x330000, // Dim red when off
    emissiveIntensity: 0.2,
  });

  const brakeLightPositions = [
    [bodyWidth * 0.35, bodyHeight * 0.4, -bodyLength * 0.5],
    [-bodyWidth * 0.35, bodyHeight * 0.4, -bodyLength * 0.5],
  ];

  const brakeLights: THREE.PointLight[] = [];
  brakeLightPositions.forEach(([x, y, z]) => {
    const brakeLightMesh = new THREE.Mesh(brakeLightGeometry, brakeLightMaterial.clone());
    brakeLightMesh.position.set(x, y, z);
    brakeLightMesh.name = 'brakeLight';
    group.add(brakeLightMesh);

    // Add point light
    const brakeLight = new THREE.PointLight(BRAKE_LIGHT_COLOR, 0.5, 10 * S);
    brakeLight.position.set(x, y, z);
    group.add(brakeLight);
    brakeLights.push(brakeLight);
  });

  // Wrap in parent mesh for consistent handling
  const finalGeometry = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const finalMesh = new THREE.Mesh(finalGeometry, material) as EnhancedVehicleMesh;
  finalMesh.add(group);
  finalMesh.visible = true;

  // Store light references
  finalMesh.lights = {
    turnSignalLeft,
    turnSignalRight,
    brakeLights,
    headlights,
  };

  finalMesh.turnSignalState = 'none';
  finalMesh.brakeState = false;
  finalMesh.lastTurnSignalToggle = Date.now();
  finalMesh.previousBearing = undefined;

  return finalMesh;
}

/**
 * Update vehicle turn signals based on bearing change
 * Automatically detects turns and activates appropriate signal
 */
export function updateTurnSignals(
  mesh: EnhancedVehicleMesh,
  currentBearing: number,
  deltaTime: number
): void {
  if (!mesh.lights) return;

  const now = Date.now();

  // Detect turn based on bearing change
  if (mesh.previousBearing !== undefined) {
    let bearingDelta = currentBearing - mesh.previousBearing;

    // Normalize bearing delta to -180 to 180
    while (bearingDelta > 180) bearingDelta -= 360;
    while (bearingDelta < -180) bearingDelta += 360;

    const turnThreshold = 15; // degrees per second to trigger signal

    if (Math.abs(bearingDelta) > turnThreshold * deltaTime) {
      if (bearingDelta > 0) {
        mesh.turnSignalState = 'right';
      } else {
        mesh.turnSignalState = 'left';
      }
    } else if (Math.abs(bearingDelta) < 5 * deltaTime) {
      // Straight driving, turn off signals
      mesh.turnSignalState = 'none';
    }
  }

  mesh.previousBearing = currentBearing;

  // Blink turn signals
  const shouldBlink = Math.floor(now / TURN_SIGNAL_BLINK_INTERVAL) % 2 === 0;

  if (mesh.turnSignalState === 'left' && mesh.lights.turnSignalLeft) {
    mesh.lights.turnSignalLeft.intensity = shouldBlink ? 1.5 : 0;
    // Update emissive material
    const leftMesh = mesh.children[0]?.children.find(
      (child) => child instanceof THREE.Mesh && child.position.x < 0 && child.position.z > 0
    );
    if (leftMesh && leftMesh instanceof THREE.Mesh) {
      const mat = leftMesh.material as THREE.MeshStandardMaterial;
      if (mat.emissive) {
        mat.emissive.setHex(shouldBlink ? TURN_SIGNAL_COLOR : 0x000000);
        mat.emissiveIntensity = shouldBlink ? 1 : 0;
      }
    }
  } else if (mesh.lights.turnSignalLeft) {
    mesh.lights.turnSignalLeft.intensity = 0;
  }

  if (mesh.turnSignalState === 'right' && mesh.lights.turnSignalRight) {
    mesh.lights.turnSignalRight.intensity = shouldBlink ? 1.5 : 0;
    // Update emissive material
    const rightMesh = mesh.children[0]?.children.find(
      (child) => child instanceof THREE.Mesh && child.position.x > 0 && child.position.z > 0
    );
    if (rightMesh && rightMesh instanceof THREE.Mesh) {
      const mat = rightMesh.material as THREE.MeshStandardMaterial;
      if (mat.emissive) {
        mat.emissive.setHex(shouldBlink ? TURN_SIGNAL_COLOR : 0x000000);
        mat.emissiveIntensity = shouldBlink ? 1 : 0;
      }
    }
  } else if (mesh.lights.turnSignalRight) {
    mesh.lights.turnSignalRight.intensity = 0;
  }

  if (mesh.turnSignalState === 'none') {
    if (mesh.lights.turnSignalLeft) mesh.lights.turnSignalLeft.intensity = 0;
    if (mesh.lights.turnSignalRight) mesh.lights.turnSignalRight.intensity = 0;
  }
}

/**
 * Update vehicle brake lights based on speed/deceleration
 */
export function updateBrakeLights(
  mesh: EnhancedVehicleMesh,
  isBreaking: boolean
): void {
  if (!mesh.lights?.brakeLights) return;

  mesh.brakeState = isBreaking;

  mesh.lights.brakeLights.forEach((light) => {
    light.intensity = isBreaking ? 2.0 : 0.5;
  });

  // Update brake light meshes
  mesh.children[0]?.children.forEach((child) => {
    if (child.name === 'brakeLight' && child instanceof THREE.Mesh) {
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat.emissive) {
        mat.emissive.setHex(isBreaking ? BRAKE_LIGHT_COLOR : 0x330000);
        mat.emissiveIntensity = isBreaking ? 1 : 0.2;
      }
    }
  });
}

/**
 * Set headlight state (for day/night cycles if implemented)
 */
export function setHeadlights(mesh: EnhancedVehicleMesh, enabled: boolean): void {
  if (!mesh.lights?.headlights) return;

  mesh.lights.headlights.forEach((light) => {
    light.intensity = enabled ? 0.5 : 0.2;
  });
}
