import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================
// PARTICLE CONFIGURATION - Adjust these values!
// ============================================
export const PARTICLE_CONFIG = {
  // Global multiplier for all particle counts (1 = normal, 2 = double, 0.5 = half)
  INTENSITY_MULTIPLIER: 2.0,

  // Base particle counts for each intensity level
  PARTICLE_COUNTS: {
    low: 30,
    medium: 60,
    high: 100,
  },

  // Burst effect settings
  BURST: {
    PARTICLE_COUNT: 80,
    SPEED_MIN: 4,
    SPEED_MAX: 8,
    DURATION: 2.0,
    SIZE: 0.5,
  },

  // Sparkle effect settings
  SPARKLE: {
    PARTICLE_COUNT: 40,
    SIZE: 0.25,
    TWINKLE_SPEED: 15,
  },

  // Orbit effect settings
  ORBIT: {
    PARTICLE_COUNT: 24,
    SIZE: 0.2,
    SPEED: 2,
  },

  // Rising particles settings
  RISING: {
    SIZE: 0.35,
    SPEED_MIN: 0.8,
    SPEED_MAX: 2.5,
    DRIFT: 0.8,
  },

  // Colors
  COLORS: {
    PRIMARY: '#fbbf24',    // Gold
    SECONDARY: '#f59e0b',  // Amber
    ACCENT: '#fcd34d',     // Light gold
    BRIGHT: '#fef3c7',     // Cream/white gold
  },
};

interface GoldParticlesProps {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  intensity?: 'low' | 'medium' | 'high';
  active?: boolean;
}

// Main rising particle effect
export function GoldParticles({
  position,
  width,
  height,
  depth,
  intensity = 'medium',
  active = true
}: GoldParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const baseCount = PARTICLE_CONFIG.PARTICLE_COUNTS[intensity];
  const particleCount = Math.floor(baseCount * PARTICLE_CONFIG.INTENSITY_MULTIPLIER);

  const { positions, velocities, lifetimes, sizes } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const lifetimes = new Float32Array(particleCount);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * width * 1.2;
      positions[i * 3 + 1] = Math.random() * height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * depth * 1.2;

      velocities[i * 3] = (Math.random() - 0.5) * PARTICLE_CONFIG.RISING.DRIFT;
      velocities[i * 3 + 1] = PARTICLE_CONFIG.RISING.SPEED_MIN + Math.random() * (PARTICLE_CONFIG.RISING.SPEED_MAX - PARTICLE_CONFIG.RISING.SPEED_MIN);
      velocities[i * 3 + 2] = (Math.random() - 0.5) * PARTICLE_CONFIG.RISING.DRIFT;

      lifetimes[i] = Math.random();
      sizes[i] = 0.1 + Math.random() * 0.25;
    }

    return { positions, velocities, lifetimes, sizes };
  }, [particleCount, width, height, depth]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !active) return;

    timeRef.current += delta;
    const geometry = pointsRef.current.geometry;
    const positionAttr = geometry.attributes.position;
    const sizeAttr = geometry.attributes.size;

    for (let i = 0; i < particleCount; i++) {
      lifetimes[i] += delta * 0.5;

      if (lifetimes[i] > 1) {
        lifetimes[i] = 0;
        positionAttr.array[i * 3] = (Math.random() - 0.5) * width * 1.2;
        positionAttr.array[i * 3 + 1] = 0;
        positionAttr.array[i * 3 + 2] = (Math.random() - 0.5) * depth * 1.2;
      } else {
        positionAttr.array[i * 3] += velocities[i * 3] * delta;
        positionAttr.array[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        positionAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * delta;
      }

      const lifeFactor = 1 - Math.abs(lifetimes[i] - 0.5) * 2;
      sizeAttr.array[i] = sizes[i] * lifeFactor * (0.5 + Math.sin(timeRef.current * 10 + i) * 0.5);
    }

    positionAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={particleCount}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={PARTICLE_CONFIG.RISING.SIZE}
        sizeAttenuation
        transparent
        opacity={0.85}
        color={PARTICLE_CONFIG.COLORS.PRIMARY}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Sparkle effect - twinkling particles that stay in place
interface GoldSparklesProps {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  active?: boolean;
}

export function GoldSparkles({
  position,
  width,
  height,
  depth,
  active = true
}: GoldSparklesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const particleCount = Math.floor(PARTICLE_CONFIG.SPARKLE.PARTICLE_COUNT * PARTICLE_CONFIG.INTENSITY_MULTIPLIER);

  const { positions, phases, baseSizes } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const phases = new Float32Array(particleCount);
    const baseSizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      // Distribute on surface of building
      const face = Math.floor(Math.random() * 4);
      const u = Math.random();
      const v = Math.random();

      switch (face) {
        case 0: // Front
          positions[i * 3] = (u - 0.5) * width;
          positions[i * 3 + 1] = v * height;
          positions[i * 3 + 2] = depth / 2 + 0.1;
          break;
        case 1: // Back
          positions[i * 3] = (u - 0.5) * width;
          positions[i * 3 + 1] = v * height;
          positions[i * 3 + 2] = -depth / 2 - 0.1;
          break;
        case 2: // Left
          positions[i * 3] = -width / 2 - 0.1;
          positions[i * 3 + 1] = v * height;
          positions[i * 3 + 2] = (u - 0.5) * depth;
          break;
        case 3: // Right
          positions[i * 3] = width / 2 + 0.1;
          positions[i * 3 + 1] = v * height;
          positions[i * 3 + 2] = (u - 0.5) * depth;
          break;
      }

      phases[i] = Math.random() * Math.PI * 2;
      baseSizes[i] = 0.05 + Math.random() * 0.15;
    }

    return { positions, phases, baseSizes };
  }, [particleCount, width, height, depth]);

  const sizes = useMemo(() => new Float32Array(particleCount), [particleCount]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !active) return;

    timeRef.current += delta;
    const sizeAttr = pointsRef.current.geometry.attributes.size;

    for (let i = 0; i < particleCount; i++) {
      // Twinkle effect
      const twinkle = Math.sin(timeRef.current * PARTICLE_CONFIG.SPARKLE.TWINKLE_SPEED + phases[i]);
      const brightness = Math.max(0, twinkle);
      sizeAttr.array[i] = baseSizes[i] * brightness * brightness;
    }

    sizeAttr.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={particleCount}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={PARTICLE_CONFIG.SPARKLE.SIZE}
        sizeAttenuation
        transparent
        opacity={1}
        color={PARTICLE_CONFIG.COLORS.BRIGHT}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Orbiting particles effect
interface GoldOrbitProps {
  position: [number, number, number];
  radius: number;
  height: number;
  active?: boolean;
}

export function GoldOrbit({
  position,
  radius,
  height,
  active = true
}: GoldOrbitProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const particleCount = Math.floor(PARTICLE_CONFIG.ORBIT.PARTICLE_COUNT * PARTICLE_CONFIG.INTENSITY_MULTIPLIER);

  const { angles, heights, radii, speeds } = useMemo(() => {
    const angles = new Float32Array(particleCount);
    const heights = new Float32Array(particleCount);
    const radii = new Float32Array(particleCount);
    const speeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      angles[i] = Math.random() * Math.PI * 2;
      heights[i] = Math.random() * height;
      radii[i] = radius * (0.8 + Math.random() * 0.4);
      speeds[i] = (0.5 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);
    }

    return { angles, heights, radii, speeds };
  }, [particleCount, radius, height]);

  const positions = useMemo(() => new Float32Array(particleCount * 3), [particleCount]);

  useFrame((_, delta) => {
    if (!pointsRef.current || !active) return;

    timeRef.current += delta;
    const positionAttr = pointsRef.current.geometry.attributes.position;

    for (let i = 0; i < particleCount; i++) {
      angles[i] += speeds[i] * PARTICLE_CONFIG.ORBIT.SPEED * delta;

      positionAttr.array[i * 3] = Math.cos(angles[i]) * radii[i];
      positionAttr.array[i * 3 + 1] = heights[i] + Math.sin(timeRef.current * 2 + i) * 0.3;
      positionAttr.array[i * 3 + 2] = Math.sin(angles[i]) * radii[i];
    }

    positionAttr.needsUpdate = true;
  });

  if (!active) return null;

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={PARTICLE_CONFIG.ORBIT.SIZE}
        sizeAttenuation
        transparent
        opacity={0.9}
        color={PARTICLE_CONFIG.COLORS.ACCENT}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Burst effect for placement
interface GoldBurstProps {
  position: [number, number, number];
  onComplete?: () => void;
}

export function GoldBurst({ position, onComplete }: GoldBurstProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const startTimeRef = useRef<number | null>(null);

  const particleCount = Math.floor(PARTICLE_CONFIG.BURST.PARTICLE_COUNT * PARTICLE_CONFIG.INTENSITY_MULTIPLIER);

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = PARTICLE_CONFIG.BURST.SPEED_MIN + Math.random() * (PARTICLE_CONFIG.BURST.SPEED_MAX - PARTICLE_CONFIG.BURST.SPEED_MIN);

      velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.cos(phi) * speed * 0.5 + 3;
      velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
    }

    return { positions, velocities };
  }, [particleCount]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    if (startTimeRef.current === null) {
      startTimeRef.current = state.clock.elapsedTime;
    }

    const elapsed = state.clock.elapsedTime - startTimeRef.current;

    if (elapsed > PARTICLE_CONFIG.BURST.DURATION) {
      onComplete?.();
      return;
    }

    const geometry = pointsRef.current.geometry;
    const positionAttr = geometry.attributes.position;

    for (let i = 0; i < particleCount; i++) {
      positionAttr.array[i * 3] += velocities[i * 3] * delta;
      positionAttr.array[i * 3 + 1] += velocities[i * 3 + 1] * delta - 6 * delta * elapsed;
      positionAttr.array[i * 3 + 2] += velocities[i * 3 + 2] * delta;
    }

    positionAttr.needsUpdate = true;

    const material = pointsRef.current.material as THREE.PointsMaterial;
    material.opacity = Math.max(0, 1 - elapsed / PARTICLE_CONFIG.BURST.DURATION);
  });

  return (
    <points ref={pointsRef} position={position}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={PARTICLE_CONFIG.BURST.SIZE}
        sizeAttenuation
        transparent
        opacity={1}
        color={PARTICLE_CONFIG.COLORS.SECONDARY}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// Combined effect component for easy use
interface GoldEffectsProps {
  position: [number, number, number];
  width: number;
  height: number;
  depth: number;
  intensity?: 'low' | 'medium' | 'high';
  active?: boolean;
  showSparkles?: boolean;
  showOrbit?: boolean;
  showRising?: boolean;
}

export function GoldEffects({
  position,
  width,
  height,
  depth,
  intensity = 'medium',
  active = true,
  showSparkles = true,
  showOrbit = true,
  showRising = true,
}: GoldEffectsProps) {
  const radius = Math.max(width, depth) / 2 + 1;

  return (
    <group position={position}>
      {showRising && (
        <GoldParticles
          position={[0, 0, 0]}
          width={width}
          height={height}
          depth={depth}
          intensity={intensity}
          active={active}
        />
      )}
      {showSparkles && (
        <GoldSparkles
          position={[0, 0, 0]}
          width={width}
          height={height}
          depth={depth}
          active={active}
        />
      )}
      {showOrbit && (
        <GoldOrbit
          position={[0, 0, 0]}
          radius={radius}
          height={height}
          active={active}
        />
      )}
    </group>
  );
}
