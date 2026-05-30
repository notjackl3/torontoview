import { useMemo } from 'react';
import { TreeType, TreeConfig } from '@/lib/editor/types/buildingSpec';

export interface TreeInstance {
  position: [number, number, number];
  type: TreeType;
  scale: number;
  rotation: number;
}

interface TreeProps {
  position: [number, number, number];
  type: TreeType;
  scale?: number;
  rotation?: number;
}

// Autumn Blaze Maple - Tall deciduous with brilliant red fall color
function AutumnBlazeMaple({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.25, 0.35, 3, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <sphereGeometry args={[2, 16, 12]} />
        <meshStandardMaterial color="#C62828" />
      </mesh>
      <mesh position={[0.8, 3.5, 0.5]}>
        <sphereGeometry args={[1.2, 12, 10]} />
        <meshStandardMaterial color="#D32F2F" />
      </mesh>
      <mesh position={[-0.6, 4.2, -0.4]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#E53935" />
      </mesh>
    </group>
  );
}

// Canadian Serviceberry - Small ornamental with white flowers
function CanadianServiceberry({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 1.6, 8]} />
        <meshStandardMaterial color="#6D4C41" />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#558B2F" />
      </mesh>
      <mesh position={[0.3, 2.2, 0.2]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[-0.2, 1.9, -0.3]}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
    </group>
  );
}

// Colorado Blue Spruce - Conical conifer with blue-silver needles
function ColoradoBlueSpruce({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.2, 0.25, 1.2, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <coneGeometry args={[1.2, 2, 8]} />
        <meshStandardMaterial color="#546E7A" />
      </mesh>
      <mesh position={[0, 3, 0]}>
        <coneGeometry args={[0.9, 1.8, 8]} />
        <meshStandardMaterial color="#607D8B" />
      </mesh>
      <mesh position={[0, 4, 0]}>
        <coneGeometry args={[0.6, 1.5, 8]} />
        <meshStandardMaterial color="#78909C" />
      </mesh>
    </group>
  );
}

// Cortland Apple - Small fruit tree with umbrella shape
function CortlandApple({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 1.2, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.9, 12, 10]} />
        <meshStandardMaterial color="#558B2F" />
      </mesh>
      <mesh position={[0.3, 1.3, 0.2]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#C62828" />
      </mesh>
      <mesh position={[-0.2, 1.6, -0.15]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#D32F2F" />
      </mesh>
    </group>
  );
}

// Eastern Redbud - Heart-shaped leaves with pink blossoms
function EasternRedbud({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 2, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 2.8, 0]}>
        <sphereGeometry args={[1.5, 12, 10]} />
        <meshStandardMaterial color="#E91E63" />
      </mesh>
      <mesh position={[0.6, 2.5, 0.4]}>
        <sphereGeometry args={[0.8, 10, 8]} />
        <meshStandardMaterial color="#F06292" />
      </mesh>
      <mesh position={[-0.5, 3, -0.3]}>
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color="#EC407A" />
      </mesh>
    </group>
  );
}

// Eastern White Pine - Tall iconic Canadian pine
function EasternWhitePine({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 3, 8]} />
        <meshStandardMaterial color="#4E342E" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <coneGeometry args={[1.5, 2.5, 8]} />
        <meshStandardMaterial color="#1B5E20" />
      </mesh>
      <mesh position={[0, 5, 0]}>
        <coneGeometry args={[1.1, 2, 8]} />
        <meshStandardMaterial color="#2E7D32" />
      </mesh>
      <mesh position={[0, 6.2, 0]}>
        <coneGeometry args={[0.7, 1.5, 8]} />
        <meshStandardMaterial color="#388E3C" />
      </mesh>
    </group>
  );
}

// McIntosh Apple - Canada's national apple tree
function McIntoshApple({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.4, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#689F38" />
      </mesh>
      <mesh position={[0.25, 1.5, 0.15]}>
        <sphereGeometry args={[0.09, 8, 8]} />
        <meshStandardMaterial color="#7CB342" />
      </mesh>
      <mesh position={[-0.15, 1.9, -0.2]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#8BC34A" />
      </mesh>
    </group>
  );
}

// Northern Red Oak - Large majestic oak
function NorthernRedOak({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.35, 0.45, 3, 8]} />
        <meshStandardMaterial color="#4E342E" />
      </mesh>
      <mesh position={[0, 4.5, 0]}>
        <sphereGeometry args={[2.5, 16, 12]} />
        <meshStandardMaterial color="#33691E" />
      </mesh>
      <mesh position={[1, 4, 0.6]}>
        <sphereGeometry args={[1.5, 12, 10]} />
        <meshStandardMaterial color="#558B2F" />
      </mesh>
      <mesh position={[-0.8, 4.8, -0.5]}>
        <sphereGeometry args={[1.3, 12, 10]} />
        <meshStandardMaterial color="#689F38" />
      </mesh>
    </group>
  );
}

// Paper Birch - White peeling bark
function PaperBirch({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 2.4, 8]} />
        <meshStandardMaterial color="#ECEFF1" />
      </mesh>
      <mesh position={[0, 2.8, 0]}>
        <sphereGeometry args={[1.2, 12, 10]} />
        <meshStandardMaterial color="#C0CA33" />
      </mesh>
      <mesh position={[0.4, 2.5, 0.3]}>
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color="#CDDC39" />
      </mesh>
      <mesh position={[-0.3, 3, -0.2]}>
        <sphereGeometry args={[0.6, 10, 8]} />
        <meshStandardMaterial color="#D4E157" />
      </mesh>
    </group>
  );
}

// Sugar Maple - Iconic Canadian maple
function SugarMaple({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 4, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 5.5, 0]}>
        <sphereGeometry args={[2.8, 16, 12]} />
        <meshStandardMaterial color="#E65100" />
      </mesh>
      <mesh position={[1.2, 5, 0.8]}>
        <sphereGeometry args={[1.6, 12, 10]} />
        <meshStandardMaterial color="#EF6C00" />
      </mesh>
      <mesh position={[-1, 5.8, -0.6]}>
        <sphereGeometry args={[1.4, 12, 10]} />
        <meshStandardMaterial color="#F57C00" />
      </mesh>
    </group>
  );
}

// White Spruce - Hardy Canadian conifer
function WhiteSpruce({ position, scale = 1, rotation = 0 }: Omit<TreeProps, 'type'>) {
  return (
    <group position={position} scale={scale} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.15, 0.2, 1, 8]} />
        <meshStandardMaterial color="#5D4037" />
      </mesh>
      <mesh position={[0, 1.5, 0]}>
        <coneGeometry args={[1, 1.8, 8]} />
        <meshStandardMaterial color="#2E7D32" />
      </mesh>
      <mesh position={[0, 2.6, 0]}>
        <coneGeometry args={[0.8, 1.5, 8]} />
        <meshStandardMaterial color="#388E3C" />
      </mesh>
      <mesh position={[0, 3.5, 0]}>
        <coneGeometry args={[0.5, 1.2, 8]} />
        <meshStandardMaterial color="#43A047" />
      </mesh>
    </group>
  );
}

// Main Tree component that renders the appropriate type
export function Tree({ position, type, scale = 1, rotation = 0 }: TreeProps) {
  switch (type) {
    case 'autumn-blaze-maple':
      return <AutumnBlazeMaple position={position} scale={scale} rotation={rotation} />;
    case 'canadian-serviceberry':
      return <CanadianServiceberry position={position} scale={scale} rotation={rotation} />;
    case 'colorado-blue-spruce':
      return <ColoradoBlueSpruce position={position} scale={scale} rotation={rotation} />;
    case 'cortland-apple':
      return <CortlandApple position={position} scale={scale} rotation={rotation} />;
    case 'eastern-redbud':
      return <EasternRedbud position={position} scale={scale} rotation={rotation} />;
    case 'eastern-white-pine':
      return <EasternWhitePine position={position} scale={scale} rotation={rotation} />;
    case 'mcintosh-apple':
      return <McIntoshApple position={position} scale={scale} rotation={rotation} />;
    case 'northern-red-oak':
      return <NorthernRedOak position={position} scale={scale} rotation={rotation} />;
    case 'paper-birch':
      return <PaperBirch position={position} scale={scale} rotation={rotation} />;
    case 'sugar-maple':
      return <SugarMaple position={position} scale={scale} rotation={rotation} />;
    case 'white-spruce':
      return <WhiteSpruce position={position} scale={scale} rotation={rotation} />;
    default:
      return <SugarMaple position={position} scale={scale} rotation={rotation} />;
  }
}

// Seeded random number generator
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generateTreesAroundBuilding(
  buildingPosition: { x: number; y: number; z: number },
  buildingWidth: number,
  buildingDepth: number,
  config: TreeConfig
): TreeInstance[] {
  if (!config.enabled || config.types.length === 0) return [];

  const trees: TreeInstance[] = [];
  const count = config.density * 3;

  for (let i = 0; i < count; i++) {
    const seed1 = config.seed + i * 17;
    const seed2 = config.seed + i * 31;
    const seed3 = config.seed + i * 47;
    const seed5 = config.seed + i * 79;

    const angle = seededRandom(seed1) * Math.PI * 2;
    const minDist = Math.max(buildingWidth, buildingDepth) / 2 + 1;
    const maxDist = minDist + config.radius;
    const distance = minDist + seededRandom(seed2) * (maxDist - minDist);

    const x = buildingPosition.x + Math.cos(angle) * distance;
    const z = buildingPosition.z + Math.sin(angle) * distance;

    const typeIndex = Math.floor(seededRandom(seed3) * config.types.length);
    const type = config.types[typeIndex];

    const scale = 1.0;
    const rotation = seededRandom(seed5) * Math.PI * 2;

    trees.push({
      position: [x, buildingPosition.y, z],
      type,
      scale,
      rotation,
    });
  }

  return trees;
}

interface BuildingTreesProps {
  buildingPosition: { x: number; y: number; z: number };
  buildingWidth: number;
  buildingDepth: number;
  config: TreeConfig;
}

export function BuildingTrees({ buildingPosition, buildingWidth, buildingDepth, config }: BuildingTreesProps) {
  const trees = useMemo(
    () => generateTreesAroundBuilding(buildingPosition, buildingWidth, buildingDepth, config),
    [buildingPosition, buildingWidth, buildingDepth, config]
  );

  if (!config.enabled) return null;

  return (
    <group>
      {trees.map((tree, index) => (
        <Tree
          key={`tree-${index}-${tree.type}`}
          position={tree.position}
          type={tree.type}
          scale={tree.scale}
          rotation={tree.rotation}
        />
      ))}
    </group>
  );
}
