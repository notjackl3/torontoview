import { useRef, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import type { BuildingInstance } from '@/lib/editor/types/buildingSpec';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';

type HandleType =
  | 'move-xp' | 'move-xn' | 'move-zp' | 'move-zn'
  | 'resize-xp' | 'resize-xn' | 'resize-zp' | 'resize-zn'
  | 'floors';

interface Props {
  building: BuildingInstance;
  onDragStart: () => void;
  onDragEnd: () => void;
}

const SHAFT_H = 2.5;
const CONE_H = 1.8;
const SHAFT_R = 0.28;
const CONE_R = 0.75;
const BOX_S = 1.4;
const GAP = 4; // gap from building surface to arrow base

export function BuildingTransformGizmo({ building, onDragStart, onDragEnd }: Props) {
  const { updateBuildingPosition, updateBuilding } = useBuildings();
  const { camera, gl } = useThree();

  // Stable refs so the window event listeners don't need re-subscribing
  const activeRef = useRef<HandleType | null>(null);
  const dragStartRef = useRef<{ x: number; z: number; clientY: number } | null>(null);
  const startStateRef = useRef<{
    x: number; z: number; rotation: number; width: number; depth: number; floors: number;
  } | null>(null);
  const buildingRef = useRef(building);
  const onDragEndRef = useRef(onDragEnd);
  useEffect(() => { buildingRef.current = building; }, [building]);
  useEffect(() => { onDragEndRef.current = onDragEnd; }, [onDragEnd]);

  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const totalHeight = building.spec.floorHeight * building.spec.numberOfFloors + building.spec.roofHeight;
  const midY = totalHeight / 2;
  const hw = building.spec.width / 2;
  const hd = building.spec.depth / 2;
  const { x, y, z } = building.position;
  const rot = building.rotation;

  // Conservative move offset — always keeps arrows outside the building even when rotated
  const moveOffsetX = Math.abs(hw * Math.cos(rot)) + Math.abs(hd * Math.sin(rot)) + GAP;
  const moveOffsetZ = Math.abs(hw * Math.sin(rot)) + Math.abs(hd * Math.cos(rot)) + GAP;

  const getWorld = useCallback((clientX: number, clientY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(mouse, camera);
    const pt = new THREE.Vector3();
    return raycaster.ray.intersectPlane(dragPlane, pt) ? pt : null;
  }, [camera, gl, raycaster, dragPlane]);

  const handlePointerDown = useCallback((handle: HandleType) => (e: any) => {
    e.stopPropagation();
    const pt = getWorld(e.clientX, e.clientY);
    if (!pt) return;
    activeRef.current = handle;
    dragStartRef.current = { x: pt.x, z: pt.z, clientY: e.clientY };
    startStateRef.current = {
      x: building.position.x,
      z: building.position.z,
      rotation: building.rotation,
      width: building.spec.width,
      depth: building.spec.depth,
      floors: building.spec.numberOfFloors,
    };
    onDragStart();
  }, [building, getWorld, onDragStart]);

  // Global pointer listeners — installed once, read stable refs
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const handle = activeRef.current;
      const ds = dragStartRef.current;
      const ss = startStateRef.current;
      if (!handle || !ds || !ss) return;

      const id = buildingRef.current.id;

      if (handle === 'floors') {
        // Screen-space Y delta: drag up = more floors, drag down = fewer
        const dy = e.clientY - ds.clientY;
        const newFloors = Math.max(1, Math.round(ss.floors - dy / 25));
        updateBuilding(id, { numberOfFloors: newFloors });
        return;
      }

      const pt = getWorld(e.clientX, e.clientY);
      if (!pt) return;

      const wdx = pt.x - ds.x;
      const wdz = pt.z - ds.z;

      if (handle === 'move-xp' || handle === 'move-xn') {
        // Constrain to world X axis
        updateBuildingPosition(id, { x: ss.x + wdx });
      } else if (handle === 'move-zp' || handle === 'move-zn') {
        // Constrain to world Z axis
        updateBuildingPosition(id, { z: ss.z + wdz });
      } else if (handle.startsWith('resize')) {
        // Project world delta onto building's local axes
        const cos = Math.cos(ss.rotation);
        const sin = Math.sin(ss.rotation);
        const localX = wdx * cos + wdz * sin;
        const localZ = -wdx * sin + wdz * cos;

        if (handle === 'resize-xp') {
          updateBuilding(id, { width: Math.max(3, ss.width + localX * 2) });
        } else if (handle === 'resize-xn') {
          updateBuilding(id, { width: Math.max(3, ss.width - localX * 2) });
        } else if (handle === 'resize-zp') {
          updateBuilding(id, { depth: Math.max(3, ss.depth + localZ * 2) });
        } else if (handle === 'resize-zn') {
          updateBuilding(id, { depth: Math.max(3, ss.depth - localZ * 2) });
        }
      }
    };

    const onUp = () => {
      if (activeRef.current) {
        activeRef.current = null;
        dragStartRef.current = null;
        startStateRef.current = null;
        onDragEndRef.current();
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [getWorld, updateBuildingPosition, updateBuilding]);

  // Restore cursor on unmount
  useEffect(() => () => { gl.domElement.style.cursor = 'auto'; }, [gl]);

  const hover = (cursor: string) => () => { gl.domElement.style.cursor = cursor; };
  const unhover = () => { gl.domElement.style.cursor = 'auto'; };

  return (
    <>
      {/* ── Move arrows (world-aligned, no building rotation) ── */}
      <group position={[x, y, z]}>
        {/* +X (red) */}
        <group
          position={[moveOffsetX, midY, 0]}
          rotation={[0, 0, -Math.PI / 2]}
          onPointerDown={handlePointerDown('move-xp')}
          onPointerOver={hover('grab')}
          onPointerOut={unhover}
        >
          <mesh position={[0, SHAFT_H / 2, 0]}>
            <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_H, 8]} />
            <meshStandardMaterial color="#ef4444" roughness={0.3} emissive="#ef4444" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, SHAFT_H + CONE_H / 2, 0]}>
            <coneGeometry args={[CONE_R, CONE_H, 8]} />
            <meshStandardMaterial color="#ef4444" roughness={0.3} emissive="#ef4444" emissiveIntensity={0.15} />
          </mesh>
        </group>

        {/* -X (red) */}
        <group
          position={[-moveOffsetX, midY, 0]}
          rotation={[0, 0, Math.PI / 2]}
          onPointerDown={handlePointerDown('move-xn')}
          onPointerOver={hover('grab')}
          onPointerOut={unhover}
        >
          <mesh position={[0, SHAFT_H / 2, 0]}>
            <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_H, 8]} />
            <meshStandardMaterial color="#ef4444" roughness={0.3} emissive="#ef4444" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, SHAFT_H + CONE_H / 2, 0]}>
            <coneGeometry args={[CONE_R, CONE_H, 8]} />
            <meshStandardMaterial color="#ef4444" roughness={0.3} emissive="#ef4444" emissiveIntensity={0.15} />
          </mesh>
        </group>

        {/* +Z (blue) */}
        <group
          position={[0, midY, moveOffsetZ]}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown('move-zp')}
          onPointerOver={hover('grab')}
          onPointerOut={unhover}
        >
          <mesh position={[0, SHAFT_H / 2, 0]}>
            <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_H, 8]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.3} emissive="#60a5fa" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, SHAFT_H + CONE_H / 2, 0]}>
            <coneGeometry args={[CONE_R, CONE_H, 8]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.3} emissive="#60a5fa" emissiveIntensity={0.15} />
          </mesh>
        </group>

        {/* -Z (blue) */}
        <group
          position={[0, midY, -moveOffsetZ]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown('move-zn')}
          onPointerOver={hover('grab')}
          onPointerOut={unhover}
        >
          <mesh position={[0, SHAFT_H / 2, 0]}>
            <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_H, 8]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.3} emissive="#60a5fa" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[0, SHAFT_H + CONE_H / 2, 0]}>
            <coneGeometry args={[CONE_R, CONE_H, 8]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.3} emissive="#60a5fa" emissiveIntensity={0.15} />
          </mesh>
        </group>

        {/* ── Floors handle (white arrow pointing up, at top center) ── */}
        <group
          position={[0, totalHeight, 0]}
          onPointerDown={handlePointerDown('floors')}
          onPointerOver={hover('n-resize')}
          onPointerOut={unhover}
        >
          <mesh position={[0, SHAFT_H / 2, 0]}>
            <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_H, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} emissive="#ffffff" emissiveIntensity={0.2} />
          </mesh>
          <mesh position={[0, SHAFT_H + CONE_H / 2, 0]}>
            <coneGeometry args={[CONE_R, CONE_H, 8]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} emissive="#ffffff" emissiveIntensity={0.2} />
          </mesh>
        </group>
      </group>

      {/* ── Resize boxes (building-local axes, follow building rotation) ── */}
      <group position={[x, y, z]} rotation={[0, rot, 0]}>
        {/* +X edge (green) */}
        <mesh
          position={[hw + BOX_S / 2, midY, 0]}
          onPointerDown={handlePointerDown('resize-xp')}
          onPointerOver={hover('ew-resize')}
          onPointerOut={unhover}
        >
          <boxGeometry args={[BOX_S, BOX_S, BOX_S]} />
          <meshStandardMaterial color="#22c55e" roughness={0.3} emissive="#22c55e" emissiveIntensity={0.15} />
        </mesh>

        {/* -X edge (green) */}
        <mesh
          position={[-(hw + BOX_S / 2), midY, 0]}
          onPointerDown={handlePointerDown('resize-xn')}
          onPointerOver={hover('ew-resize')}
          onPointerOut={unhover}
        >
          <boxGeometry args={[BOX_S, BOX_S, BOX_S]} />
          <meshStandardMaterial color="#22c55e" roughness={0.3} emissive="#22c55e" emissiveIntensity={0.15} />
        </mesh>

        {/* +Z edge (green) */}
        <mesh
          position={[0, midY, hd + BOX_S / 2]}
          onPointerDown={handlePointerDown('resize-zp')}
          onPointerOver={hover('ns-resize')}
          onPointerOut={unhover}
        >
          <boxGeometry args={[BOX_S, BOX_S, BOX_S]} />
          <meshStandardMaterial color="#22c55e" roughness={0.3} emissive="#22c55e" emissiveIntensity={0.15} />
        </mesh>

        {/* -Z edge (green) */}
        <mesh
          position={[0, midY, -(hd + BOX_S / 2)]}
          onPointerDown={handlePointerDown('resize-zn')}
          onPointerOver={hover('ns-resize')}
          onPointerOut={unhover}
        >
          <boxGeometry args={[BOX_S, BOX_S, BOX_S]} />
          <meshStandardMaterial color="#22c55e" roughness={0.3} emissive="#22c55e" emissiveIntensity={0.15} />
        </mesh>
      </group>
    </>
  );
}
