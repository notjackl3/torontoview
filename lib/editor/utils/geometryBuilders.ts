import * as THREE from 'three';
import type { BuildingSpecification } from '@/lib/editor/types/buildingSpec';
import { getTexturePath, loadTexture, loadTextureFromDataURL } from '@/lib/editor/utils/textureLoader';

export function createBuildingBody(spec: BuildingSpecification): THREE.Mesh {
  const totalHeight = spec.floorHeight * spec.numberOfFloors;

  const geometry = new THREE.BoxGeometry(spec.width, totalHeight, spec.depth);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,  // White base so texture shows correctly
    roughness: 0.8,   // High roughness for diffuse appearance
    metalness: 0.0,   // Non-metallic for proper texture colors
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = totalHeight / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

export function createFloorSeparators(spec: BuildingSpecification): THREE.Group {
  const group = new THREE.Group();
  const slabHeight = 0.15;
  const slabOverhang = 0.2;

  for (let i = 1; i < spec.numberOfFloors; i++) {
    const y = i * spec.floorHeight;

    const geometry = new THREE.BoxGeometry(
      spec.width + slabOverhang,
      slabHeight,
      spec.depth + slabOverhang
    );

    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
    });

    const slab = new THREE.Mesh(geometry, material);
    slab.position.y = y;
    slab.castShadow = true;
    slab.receiveShadow = true;

    group.add(slab);
  }

  return group;
}

export function createRoof(spec: BuildingSpecification): THREE.Mesh {
  const baseY = spec.floorHeight * spec.numberOfFloors;

  let geometry: THREE.BufferGeometry;

  switch (spec.roofType) {
    case 'flat':
      geometry = new THREE.BoxGeometry(spec.width, 0.3, spec.depth);
      break;

    case 'gabled':
      geometry = createGabledRoof(spec.width, spec.depth, spec.roofHeight);
      break;

    case 'hipped':
      geometry = createHippedRoof(spec.width, spec.depth, spec.roofHeight);
      break;

    case 'pyramid':
      geometry = new THREE.ConeGeometry(
        Math.max(spec.width, spec.depth) * 0.7,
        spec.roofHeight,
        4
      );
      geometry.rotateY(Math.PI / 4);
      break;

    default:
      geometry = new THREE.BoxGeometry(spec.width, 0.3, spec.depth);
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,  // White base so texture shows correctly
    roughness: 0.8,   // High roughness for diffuse appearance
    metalness: 0.0,   // Non-metallic for proper texture colors
  });

  const mesh = new THREE.Mesh(geometry, material);

  if (spec.roofType === 'flat') {
    mesh.position.y = baseY + 0.15;
  } else {
    mesh.position.y = baseY + spec.roofHeight / 2;
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

function createGabledRoof(width: number, depth: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(0, height);
  shape.lineTo(width / 2, 0);
  shape.lineTo(-width / 2, 0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth,
    bevelEnabled: false,
  });

  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, -depth / 2);

  return geometry;
}

function createHippedRoof(width: number, depth: number, height: number): THREE.BufferGeometry {
  const vertices = new Float32Array([
    // Base rectangle
    -width/2, 0, -depth/2,
    width/2, 0, -depth/2,
    width/2, 0, depth/2,
    -width/2, 0, depth/2,
    // Ridge line
    -width/4, height, 0,
    width/4, height, 0,
  ]);

  const uvs = new Float32Array([
    // UV coordinates for each vertex
    0, 0,
    1, 0,
    1, 1,
    0, 1,
    0.25, 0.5,
    0.75, 0.5,
  ]);

  const indices = [
    // Front face
    0, 1, 5,
    0, 5, 4,
    // Right face
    1, 2, 5,
    // Back face
    2, 3, 4,
    2, 4, 5,
    // Left face
    3, 0, 4,
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function createWindowGeometry(
  shape: string,
  width: number,
  height: number,
  depth: number
): { glass: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  switch (shape) {
    case 'circular': {
      const radius = Math.min(width, height) / 2;
      const glassGeometry = new THREE.CylinderGeometry(radius, radius, depth, 32);
      glassGeometry.rotateX(Math.PI / 2);
      const frameGeometry = new THREE.CylinderGeometry(radius + 0.025, radius + 0.025, depth + 0.01, 32);
      frameGeometry.rotateX(Math.PI / 2);
      return { glass: glassGeometry, frame: frameGeometry };
    }

    case 'arched': {
      // Create arched window shape
      const archShape = new THREE.Shape();
      const halfWidth = width / 2;
      const archHeight = height * 0.3; // Top 30% is the arch

      archShape.moveTo(-halfWidth, 0);
      archShape.lineTo(-halfWidth, height - archHeight);
      archShape.quadraticCurveTo(-halfWidth, height, 0, height);
      archShape.quadraticCurveTo(halfWidth, height, halfWidth, height - archHeight);
      archShape.lineTo(halfWidth, 0);
      archShape.lineTo(-halfWidth, 0);

      const glassGeometry = new THREE.ExtrudeGeometry(archShape, {
        depth: depth,
        bevelEnabled: false,
      });
      glassGeometry.translate(0, -height / 2, -depth / 2);

      // Frame shape (slightly larger)
      const frameShape = new THREE.Shape();
      const framePad = 0.025;
      frameShape.moveTo(-halfWidth - framePad, -framePad);
      frameShape.lineTo(-halfWidth - framePad, height - archHeight);
      frameShape.quadraticCurveTo(-halfWidth - framePad, height + framePad, 0, height + framePad);
      frameShape.quadraticCurveTo(halfWidth + framePad, height + framePad, halfWidth + framePad, height - archHeight);
      frameShape.lineTo(halfWidth + framePad, -framePad);
      frameShape.lineTo(-halfWidth - framePad, -framePad);

      const frameGeometry = new THREE.ExtrudeGeometry(frameShape, {
        depth: depth + 0.01,
        bevelEnabled: false,
      });
      frameGeometry.translate(0, -height / 2, -(depth + 0.01) / 2);

      return { glass: glassGeometry, frame: frameGeometry };
    }

    case 'triangular': {
      const triangleShape = new THREE.Shape();
      triangleShape.moveTo(0, height / 2);
      triangleShape.lineTo(width / 2, -height / 2);
      triangleShape.lineTo(-width / 2, -height / 2);
      triangleShape.lineTo(0, height / 2);

      const glassGeometry = new THREE.ExtrudeGeometry(triangleShape, {
        depth: depth,
        bevelEnabled: false,
      });
      glassGeometry.translate(0, 0, -depth / 2);

      const framePad = 0.025;
      const frameShape = new THREE.Shape();
      frameShape.moveTo(0, height / 2 + framePad);
      frameShape.lineTo(width / 2 + framePad, -height / 2 - framePad);
      frameShape.lineTo(-width / 2 - framePad, -height / 2 - framePad);
      frameShape.lineTo(0, height / 2 + framePad);

      const frameGeometry = new THREE.ExtrudeGeometry(frameShape, {
        depth: depth + 0.01,
        bevelEnabled: false,
      });
      frameGeometry.translate(0, 0, -(depth + 0.01) / 2);

      return { glass: glassGeometry, frame: frameGeometry };
    }

    case 'rectangular':
    default: {
      const glassGeometry = new THREE.BoxGeometry(width, height, depth);
      const frameGeometry = new THREE.BoxGeometry(width + 0.05, height + 0.05, depth + 0.01);
      return { glass: glassGeometry, frame: frameGeometry };
    }
  }
}

export function createWindows(spec: BuildingSpecification): THREE.Group {
  const group = new THREE.Group();

  if (spec.windowPattern === 'none') {
    return group;
  }

  const windowWidth = spec.windowWidth || 1.2;
  const windowHeight = spec.windowHeight || 1.8;
  const windowDepth = 0.02;  // Reduced depth for flatter windows
  const windowShape = spec.windowShape || 'rectangular';

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,  // White glass
    transparent: true,
    opacity: 0.6,
    roughness: 0.1,
    metalness: 0.1,
  });

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,  // White frame
  });

  // Calculate window spacing
  const horizontalSpacing = (spec.width - windowWidth) / (spec.windowRows + 1);
  const verticalSpacing = spec.floorHeight;

  // Create window geometries based on shape
  const { glass: glassGeometry, frame: frameGeometry } = createWindowGeometry(
    windowShape,
    windowWidth,
    windowHeight,
    windowDepth
  );

  for (let floor = 0; floor < spec.numberOfFloors; floor++) {
    for (let col = 0; col < spec.windowRows; col++) {
      const windowGroup = new THREE.Group();

      // Glass pane
      const glass = new THREE.Mesh(glassGeometry.clone(), glassMaterial);

      // Frame
      const frame = new THREE.Mesh(frameGeometry.clone(), frameMaterial);

      windowGroup.add(frame);
      windowGroup.add(glass);

      // Position window on front face
      const x = -spec.width / 2 + horizontalSpacing * (col + 1) + windowWidth / 2;
      const y = floor * verticalSpacing + verticalSpacing / 2;
      const z = spec.depth / 2 + windowDepth / 2;

      windowGroup.position.set(x, y, z);

      group.add(windowGroup);

      // Add windows to other sides (simplified for MVP)
      if (spec.windowPattern === 'grid') {
        // Back face
        const backWindow = windowGroup.clone();
        backWindow.position.z = -spec.depth / 2 - windowDepth / 2;
        backWindow.rotation.y = Math.PI;
        group.add(backWindow);
      }
    }
  }

  return group;
}

export function createGround(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(200, 200);
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a5f3a,
    roughness: 0.8,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;

  return mesh;
}
