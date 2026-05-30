import { useMemo } from 'react';
import * as THREE from 'three';

export function Ground() {
  const groundMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x3a5f3a,
      roughness: 0.8,
    });
  }, []);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[200, 200]} />
      <primitive object={groundMaterial} attach="material" />
    </mesh>
  );
}
