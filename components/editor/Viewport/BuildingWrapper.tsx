import { useRef } from 'react';
import * as THREE from 'three';
import { Building } from './Building';
import { SelectionIndicator } from './SelectionIndicator';
import { BuildingTransformGizmo } from './BuildingTransformGizmo';
import { BuildingTrees } from './Trees';
import type { BuildingInstance } from '@/lib/editor/types/buildingSpec';
import { DEFAULT_TREE_CONFIG } from '@/lib/editor/types/buildingSpec';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';
interface BuildingWrapperProps {
  building: BuildingInstance;
  isSelected: boolean;
  onSelect: () => void;
  onGizmoDragStart: () => void;
  onGizmoDragEnd: () => void;
}

export function BuildingWrapper({ building, isSelected, onSelect, onGizmoDragStart, onGizmoDragEnd }: BuildingWrapperProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { placementMode, addBuilding, mergeMode, toggleBuildingSelection, selectedBuildingIds } = useBuildings();
  // Check if this building is selected in merge mode
  const isMergeSelected = mergeMode && selectedBuildingIds.includes(building.id);

  const handleClick = (e: any) => {
    e.stopPropagation();

    if (placementMode) {
      // In placement mode, stack a new building on top of this one
      const buildingHeight = building.spec.floorHeight * building.spec.numberOfFloors;
      const newY = building.position.y + buildingHeight;
      addBuilding({
        x: building.position.x,
        y: newY,
        z: building.position.z
      });
    } else if (mergeMode) {
      // In merge mode, toggle selection
      toggleBuildingSelection(building.id);
    } else {
      onSelect();
    }
  };

  const treeConfig = building.spec.treeConfig || DEFAULT_TREE_CONFIG;

  return (
    <>
      <group
        ref={groupRef}
        name={`building-${building.id}`}
        userData={{ isBuilding: true, buildingId: building.id }}
        position={[building.position.x, building.position.y, building.position.z]}
        rotation={[0, building.rotation, 0]}
        onClick={handleClick}
      >
        <Building spec={building.spec} />
        {(isSelected || isMergeSelected) && <SelectionIndicator spec={building.spec} isMergeMode={isMergeSelected} />}
      </group>
      {/* Trees rendered outside rotation group so they stay upright */}
      {treeConfig.enabled && (
        <BuildingTrees
          buildingPosition={building.position}
          buildingWidth={building.spec.width}
          buildingDepth={building.spec.depth}
          config={treeConfig}
        />
      )}
      {isSelected && !placementMode && !mergeMode && (
        <BuildingTransformGizmo
          building={building}
          onDragStart={onGizmoDragStart}
          onDragEnd={onGizmoDragEnd}
        />
      )}
    </>
  );
}
