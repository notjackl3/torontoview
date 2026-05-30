import { useMemo } from 'react';
import * as THREE from 'three';
import { BuildingSpecification } from '@/lib/editor/types/buildingSpec';
import {
  createBuildingBody,
  createWindows,
} from '@/lib/editor/utils/geometryBuilders';
import { getTexturePath, loadTexture, loadTextureFromDataURL } from '@/lib/editor/utils/textureLoader';

interface BuildingProps {
  spec: BuildingSpecification;
}

export function Building({ spec }: BuildingProps) {
  const buildingGroup = useMemo(() => {
    const group = new THREE.Group();

    // Create building body
    const body = createBuildingBody(spec);

    // Apply wall texture - clone to avoid affecting other buildings
    let baseTexture: THREE.Texture | null;
    if (spec.customWallTexture) {
      baseTexture = loadTextureFromDataURL(spec.customWallTexture);
    } else {
      const wallTexturePath = getTexturePath(spec.wallTexture, 'wall');
      baseTexture = loadTexture(wallTexturePath);
    }

    // Clone the texture so each building has its own repeat settings
    if (baseTexture && body.material instanceof THREE.Material) {
      const wallTexture = baseTexture.clone();
      wallTexture.needsUpdate = true;
      const totalHeight = spec.floorHeight * spec.numberOfFloors;
      wallTexture.repeat.set(spec.width / 3, totalHeight / 3);
      (body.material as THREE.MeshStandardMaterial).map = wallTexture;
      (body.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }

    // Apply wallColor override if specified
    if (spec.wallColor && body.material instanceof THREE.Material) {
      (body.material as THREE.MeshStandardMaterial).color.set(spec.wallColor);
      (body.material as THREE.MeshStandardMaterial).needsUpdate = true;
    }

    group.add(body);

    // Create windows
    const windows = createWindows(spec);
    group.add(windows);

    return group;
  }, [spec]);

  return <primitive object={buildingGroup} />;
}
