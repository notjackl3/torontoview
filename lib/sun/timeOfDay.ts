import * as THREE from "three";

// Toronto, Ontario
const LATITUDE = 44.2253;

export type TimePreset = "sunrise" | "morning" | "noon" | "afternoon" | "sunset" | "night";

export interface TimeOfDayConfig {
  hour: number; // 0-24 decimal (e.g. 14.5 = 2:30pm)
  sunAltitude: number; // radians
  sunAzimuth: number; // radians
  isAboveHorizon: boolean;
  // Lighting
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientColor: THREE.Color;
  ambientIntensity: number;
  // Sky
  skyTopColor: THREE.Color;
  skyBottomColor: THREE.Color;
  backgroundColor: THREE.Color;
  // Fog
  fogColor: THREE.Color;
  fogDensity: number;
  // Ground tint (multiplied onto satellite imagery)
  groundTint: THREE.Color;
}

const PRESETS: Record<TimePreset, number> = {
  sunrise: 6.5,
  morning: 9,
  noon: 12,
  afternoon: 15,
  sunset: 19,
  night: 22,
};

export function getPresetHour(preset: TimePreset): number {
  return PRESETS[preset];
}

/**
 * Calculate sun position for Toronto's latitude at a given hour.
 * Uses simplified solar position equations (accurate to ~1°).
 */
function getSunPosition(hour: number, dayOfYear: number = 80) {
  const latRad = (LATITUDE * Math.PI) / 180;

  // Solar declination (simplified)
  const declination = (23.45 * Math.PI / 180) * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81));

  // Hour angle (15° per hour from solar noon)
  const hourAngle = ((hour - 12) * 15 * Math.PI) / 180;

  // Solar altitude
  const sinAlt =
    Math.sin(latRad) * Math.sin(declination) +
    Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // Solar azimuth
  const cosAz =
    (Math.sin(declination) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(altitude + 0.001));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

  return { altitude, azimuth, isAboveHorizon: altitude > -0.05 };
}

/**
 * Convert sun position to a directional light position vector.
 */
function sunToLightPosition(altitude: number, azimuth: number, distance: number = 2000): THREE.Vector3 {
  const y = distance * Math.sin(Math.max(altitude, 0.05));
  const horizontal = distance * Math.cos(Math.max(altitude, 0.05));
  const x = horizontal * Math.sin(azimuth);
  const z = horizontal * Math.cos(azimuth);
  return new THREE.Vector3(x, y, z);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: THREE.Color, b: THREE.Color, t: number): THREE.Color {
  return new THREE.Color(
    lerp(a.r, b.r, t),
    lerp(a.g, b.g, t),
    lerp(a.b, b.b, t),
  );
}

/**
 * Compute the full time-of-day configuration for a given hour.
 */
export function computeTimeOfDay(hour: number, dayOfYear: number = 80): TimeOfDayConfig {
  const sun = getSunPosition(hour, dayOfYear);

  // Normalize hour into a transition factor for smooth color blending
  // Key transition points and their lighting configs:
  //   Night (0-5):     dark blue, no sun
  //   Sunrise (5-7):   warm orange-pink horizon
  //   Morning (7-10):  brightening, warm white
  //   Noon (10-14):    full bright, neutral white
  //   Afternoon (14-17): slightly warm
  //   Sunset (17-20):  deep orange-red
  //   Night (20-24):   dark blue

  let sunColor: THREE.Color;
  let sunIntensity: number;
  let ambientColor: THREE.Color;
  let ambientIntensity: number;
  let skyTop: THREE.Color;
  let skyBottom: THREE.Color;
  let bgColor: THREE.Color;
  let fogColor: THREE.Color;
  let fogDensity: number;
  let groundTint: THREE.Color;

  // Atmospheric fog hides the void where map data ends. Tuned so close-up detail
  // stays crisp and only the far horizon (near maxDistance 12000u) hazes out.
  if (hour >= 8 && hour < 17) {
    fogDensity = 0.00008; // day — barely perceptible up close
  } else if ((hour >= 5 && hour < 8) || (hour >= 17 && hour < 21)) {
    fogDensity = 0.00014; // dawn / dusk
  } else {
    fogDensity = 0.00025; // night — still hides the void in shadow
  }

  if (hour < 5) {
    // Night — bright moonlight, blue-white wash, fully visible
    sunColor = new THREE.Color(0x8899cc);
    sunIntensity = 0.8;
    ambientColor = new THREE.Color(0x8899dd);
    ambientIntensity = 1.3;
    skyTop = new THREE.Color(0x1a2855);
    skyBottom = new THREE.Color(0x3a4a77);
    bgColor = new THREE.Color(0x1a2855);
    fogColor = new THREE.Color(0x1a2855);
    groundTint = new THREE.Color(0x99aadd);
  } else if (hour < 6.5) {
    // Pre-dawn → sunrise
    const t = (hour - 5) / 1.5;
    sunColor = lerpColor(new THREE.Color(0x8899cc), new THREE.Color(0xffaa55), t);
    sunIntensity = lerp(0.8, 1.3, t);
    ambientColor = lerpColor(new THREE.Color(0x8899dd), new THREE.Color(0xddaa77), t);
    ambientIntensity = lerp(1.3, 1.1, t);
    skyTop = lerpColor(new THREE.Color(0x1a2855), new THREE.Color(0x5588cc), t);
    skyBottom = lerpColor(new THREE.Color(0x3a4a77), new THREE.Color(0xffbb77), t);
    bgColor = lerpColor(new THREE.Color(0x1a2855), new THREE.Color(0xaa9988), t);
    fogColor = bgColor;
    groundTint = lerpColor(new THREE.Color(0x99aadd), new THREE.Color(0xeeccaa), t);
  } else if (hour < 8) {
    // Sunrise golden hour
    const t = (hour - 6.5) / 1.5;
    sunColor = lerpColor(new THREE.Color(0xffaa55), new THREE.Color(0xffdd99), t);
    sunIntensity = lerp(1.3, 1.5, t);
    ambientColor = lerpColor(new THREE.Color(0xddaa77), new THREE.Color(0xbbccdd), t);
    ambientIntensity = lerp(1.1, 0.9, t);
    skyTop = lerpColor(new THREE.Color(0x5588cc), new THREE.Color(0x4488cc), t);
    skyBottom = lerpColor(new THREE.Color(0xffbb77), new THREE.Color(0xddeeff), t);
    bgColor = lerpColor(new THREE.Color(0xaa9988), new THREE.Color(0xbbccdd), t);
    fogColor = bgColor;
    groundTint = lerpColor(new THREE.Color(0xeeccaa), new THREE.Color(0xffeedd), t);
  } else if (hour < 11) {
    // Morning → midday
    const t = (hour - 8) / 3;
    sunColor = lerpColor(new THREE.Color(0xffdd99), new THREE.Color(0xfff8f0), t);
    sunIntensity = lerp(1.5, 1.6, t);
    ambientColor = lerpColor(new THREE.Color(0xbbccdd), new THREE.Color(0xc0d0e8), t);
    ambientIntensity = lerp(0.9, 0.9, t);
    skyTop = lerpColor(new THREE.Color(0x4488cc), new THREE.Color(0x3377cc), t);
    skyBottom = lerpColor(new THREE.Color(0xddeeff), new THREE.Color(0xeef4ff), t);
    bgColor = lerpColor(new THREE.Color(0xbbccdd), new THREE.Color(0xc8ddf0), t);
    fogColor = bgColor;
    groundTint = lerpColor(new THREE.Color(0xffeedd), new THREE.Color(0xffffff), t);
  } else if (hour < 15) {
    // Midday — neutral, bright
    sunColor = new THREE.Color(0xfff8f0);
    sunIntensity = 1.6;
    ambientColor = new THREE.Color(0xc0d0e8);
    ambientIntensity = 0.9;
    skyTop = new THREE.Color(0x3377cc);
    skyBottom = new THREE.Color(0xeef4ff);
    bgColor = new THREE.Color(0xc8ddf0);
    fogColor = bgColor;
    groundTint = new THREE.Color(0xffffff);
  } else if (hour < 17.5) {
    // Afternoon → pre-sunset
    const t = (hour - 15) / 2.5;
    sunColor = lerpColor(new THREE.Color(0xfff8f0), new THREE.Color(0xffbb66), t);
    sunIntensity = lerp(1.6, 1.3, t);
    ambientColor = lerpColor(new THREE.Color(0xc0d0e8), new THREE.Color(0xddbb88), t);
    ambientIntensity = lerp(0.9, 1.0, t);
    skyTop = lerpColor(new THREE.Color(0x3377cc), new THREE.Color(0x4477bb), t);
    skyBottom = lerpColor(new THREE.Color(0xeef4ff), new THREE.Color(0xffcc88), t);
    bgColor = lerpColor(new THREE.Color(0xc8ddf0), new THREE.Color(0xccbb99), t);
    fogColor = bgColor;
    groundTint = lerpColor(new THREE.Color(0xffffff), new THREE.Color(0xffddbb), t);
  } else if (hour < 19.5) {
    // Sunset — warm orange, stays bright
    const t = (hour - 17.5) / 2;
    sunColor = lerpColor(new THREE.Color(0xffbb66), new THREE.Color(0xff8844), t);
    sunIntensity = lerp(1.3, 1.0, t);
    ambientColor = lerpColor(new THREE.Color(0xddbb88), new THREE.Color(0xbb99bb), t);
    ambientIntensity = lerp(1.0, 1.1, t);
    skyTop = lerpColor(new THREE.Color(0x4477bb), new THREE.Color(0x334488), t);
    skyBottom = lerpColor(new THREE.Color(0xffcc88), new THREE.Color(0xff9955), t);
    bgColor = lerpColor(new THREE.Color(0xccbb99), new THREE.Color(0x776688), t);
    fogColor = bgColor;
    groundTint = lerpColor(new THREE.Color(0xffddbb), new THREE.Color(0xddbb99), t);
  } else if (hour < 21) {
    // Dusk → night
    const t = (hour - 19.5) / 1.5;
    sunColor = lerpColor(new THREE.Color(0xff8844), new THREE.Color(0x8899cc), t);
    sunIntensity = lerp(1.0, 0.8, t);
    ambientColor = lerpColor(new THREE.Color(0xbb99bb), new THREE.Color(0x8899dd), t);
    ambientIntensity = lerp(1.1, 1.3, t);
    skyTop = lerpColor(new THREE.Color(0x334488), new THREE.Color(0x1a2855), t);
    skyBottom = lerpColor(new THREE.Color(0xff9955), new THREE.Color(0x3a4a77), t);
    bgColor = lerpColor(new THREE.Color(0x776688), new THREE.Color(0x1a2855), t);
    fogColor = bgColor;
    groundTint = lerpColor(new THREE.Color(0xddbb99), new THREE.Color(0x99aadd), t);
  } else {
    // Night — bright moonlight, blue-white wash, fully visible
    sunColor = new THREE.Color(0x8899cc);
    sunIntensity = 0.8;
    ambientColor = new THREE.Color(0x8899dd);
    ambientIntensity = 1.3;
    skyTop = new THREE.Color(0x1a2855);
    skyBottom = new THREE.Color(0x3a4a77);
    bgColor = new THREE.Color(0x1a2855);
    fogColor = new THREE.Color(0x1a2855);
    groundTint = new THREE.Color(0x99aadd);
  }

  return {
    hour,
    sunAltitude: sun.altitude,
    sunAzimuth: sun.azimuth,
    isAboveHorizon: sun.isAboveHorizon,
    sunColor,
    sunIntensity,
    ambientColor,
    ambientIntensity,
    skyTopColor: skyTop,
    skyBottomColor: skyBottom,
    backgroundColor: bgColor,
    fogColor,
    fogDensity,
    groundTint,
  };
}

/**
 * Apply a time-of-day configuration to the scene.
 */
export function applyTimeOfDay(
  config: TimeOfDayConfig,
  scene: THREE.Scene,
  directionalLight: THREE.DirectionalLight,
  ambientLight: THREE.AmbientLight,
  skyMesh: THREE.Mesh | null,
  groundGroup: THREE.Group | null,
  sunMesh?: THREE.Mesh | null,
  moonMesh?: THREE.Mesh | null,
  camera?: THREE.Camera | null,
) {
  // Update directional light (sun)
  const lightPos = sunToLightPosition(config.sunAltitude, config.sunAzimuth);
  directionalLight.position.copy(lightPos);
  directionalLight.color.copy(config.sunColor);
  directionalLight.intensity = config.sunIntensity;
  directionalLight.castShadow = config.isAboveHorizon;

  // Update ambient light
  ambientLight.color.copy(config.ambientColor);
  ambientLight.intensity = config.ambientIntensity;

  // Update scene background
  scene.background = config.backgroundColor;

  // Update fog
  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.copy(config.fogColor);
    scene.fog.density = config.fogDensity;
  }

  // Update sky dome if present
  if (skyMesh) {
    const mat = skyMesh.material as THREE.ShaderMaterial;
    if (mat.uniforms) {
      mat.uniforms.topColor.value.copy(config.skyTopColor);
      mat.uniforms.bottomColor.value.copy(config.skyBottomColor);
    }
  }

  // Position sun and moon on the sky dome
  const SKY_DIST = 40000;
  if (sunMesh) {
    const sunPos = sunToLightPosition(config.sunAltitude, config.sunAzimuth, SKY_DIST);
    sunMesh.position.copy(sunPos);
    // Billboard: face the camera
    if (camera) sunMesh.lookAt(camera.position);
    // Fade out when below horizon
    const sunMat = sunMesh.material as THREE.MeshBasicMaterial;
    const sunVis = Math.max(0, Math.min(1, config.sunAltitude / 0.15));
    sunMat.opacity = sunVis;
    sunMesh.visible = sunVis > 0.01;
    // Tint sun color based on altitude — orange near horizon, yellow-white high
    const horizonT = Math.min(1, Math.max(0, config.sunAltitude / 0.5));
    sunMat.color.lerpColors(new THREE.Color(0xff6622), new THREE.Color(0xffee88), horizonT);
    // Also tint glow
    if (sunMesh.children[0]) {
      const glowMat = (sunMesh.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
      glowMat.opacity = sunVis * 0.15;
      glowMat.color.copy(sunMat.color);
    }
  }

  if (moonMesh) {
    // Moon is roughly opposite the sun
    const moonAlt = Math.max(-config.sunAltitude, 0.1);
    const moonAz = config.sunAzimuth + Math.PI;
    const moonPos = sunToLightPosition(moonAlt, moonAz, SKY_DIST);
    moonMesh.position.copy(moonPos);
    if (camera) moonMesh.lookAt(camera.position);
    // Visible when sun is low/below horizon
    const moonVis = Math.max(0, Math.min(1, 1 - config.sunAltitude / 0.3));
    const moonMat = moonMesh.material as THREE.MeshBasicMaterial;
    moonMat.opacity = moonVis * 0.9;
    moonMesh.visible = moonVis > 0.01;
  }

  // Tint ground tiles
  if (groundGroup) {
    groundGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.name.startsWith("ground-tile-")) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.color.copy(config.groundTint);
      }
    });
  }
}

/**
 * Format hour as readable time string.
 */
export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${suffix}`;
}
