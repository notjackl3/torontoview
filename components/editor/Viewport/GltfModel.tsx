import { useGLTF } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const MODEL_PATH = '/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf';

export function GltfModel() {
  const { scene } = useGLTF(MODEL_PATH);
  const groupRef = useRef<THREE.Group>(null);

  // Center and scale the model to fit the scene
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Scale so the tallest dimension is ~20 units
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 20 / maxDim;

    if (groupRef.current) {
      groupRef.current.scale.setScalar(scale);
      // Center horizontally, sit on the ground plane (y=0)
      groupRef.current.position.set(
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale,
      );
    }
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// Pre-load the model
useGLTF.preload(MODEL_PATH);
