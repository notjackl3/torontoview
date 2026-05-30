import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { BuildingInstance, BuildingSpecification, BuildingId, GroupId } from '@/lib/editor/types/buildingSpec';
import { DEFAULT_BUILDING_SPEC, GROUP_SYNCED_PROPERTIES } from '@/lib/editor/types/buildingSpec';

interface BuildingsContextType {
  buildings: BuildingInstance[];
  selectedBuildingId: BuildingId | null;
  selectedBuildingIds: BuildingId[];  // For multi-select (merge feature)
  placementMode: boolean;
  mergeMode: boolean;

  // Building management
  addBuilding: (position: { x: number; y: number; z: number }, spec?: Partial<BuildingSpecification>) => BuildingId;
  removeBuilding: (id: BuildingId) => void;
  updateBuilding: (id: BuildingId, updates: Partial<BuildingSpecification>) => void;
  updateBuildingRotation: (id: BuildingId, rotation: number) => void;
  updateBuildingPosition: (id: BuildingId, position: { x?: number; y?: number; z?: number }) => void;
  selectBuilding: (id: BuildingId | null) => void;
  toggleBuildingSelection: (id: BuildingId) => void;  // For multi-select
  clearSelection: () => void;

  // Group functionality (formerly merge)
  setMergeMode: (enabled: boolean) => void;
  mergeBuildings: () => void;  // Groups selected buildings (keeps rotations, syncs textures/windows)
  ungroupBuilding: (id: BuildingId) => void;  // Remove building from its group
  getGroupMembers: (groupId: GroupId) => BuildingInstance[];

  // Placement mode
  setPlacementMode: (enabled: boolean) => void;

  // Get selected building
  getSelectedBuilding: () => BuildingInstance | null;
}

const BuildingsContext = createContext<BuildingsContextType | undefined>(undefined);

interface BuildingsProviderProps {
  children: ReactNode;
}

export function BuildingsProvider({ children }: BuildingsProviderProps) {
  const [buildings, setBuildings] = useState<BuildingInstance[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<BuildingId | null>(null);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<BuildingId[]>([]);
  const [placementMode, setPlacementMode] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);

  const addBuilding = useCallback((position: { x: number; y: number; z: number }, spec?: Partial<BuildingSpecification>) => {
    const newId = `building-${Date.now()}`;
    const buildingNumber = buildings.length + 1;

    const newBuilding: BuildingInstance = {
      id: newId,
      name: `Building ${buildingNumber}`,
      position,
      rotation: 0,
      spec: { ...DEFAULT_BUILDING_SPEC, ...spec },
    };

    setBuildings(prev => [...prev, newBuilding]);
    setSelectedBuildingId(newId);
    setPlacementMode(false);

    return newId;
  }, [buildings.length]);

  const removeBuilding = useCallback((id: BuildingId) => {
    setBuildings(prev => prev.filter(b => b.id !== id));
    setSelectedBuildingId(prev => {
      if (prev === id) {
        const remaining = buildings.filter(b => b.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      }
      return prev;
    });
  }, [buildings]);

  const updateBuilding = useCallback((id: BuildingId, updates: Partial<BuildingSpecification>) => {
    setBuildings(prev => {
      const targetBuilding = prev.find(b => b.id === id);
      if (!targetBuilding) return prev;

      // Extract synced properties from updates
      const syncedUpdates: Partial<BuildingSpecification> = {};
      for (const key of GROUP_SYNCED_PROPERTIES) {
        if (key in updates) {
          syncedUpdates[key] = updates[key as keyof BuildingSpecification] as never;
        }
      }
      const hasSyncedUpdates = Object.keys(syncedUpdates).length > 0;
      const groupId = targetBuilding.groupId;

      return prev.map(building => {
        const isTarget = building.id === id;
        const isGroupMember = groupId && building.groupId === groupId;

        if (isTarget) {
          // Apply all updates to target building
          const newSpec = { ...building.spec, ...updates };
          if (updates.numberOfFloors !== undefined && updates.windowColumns === undefined) {
            newSpec.windowColumns = newSpec.numberOfFloors;
          }
          return { ...building, spec: newSpec };
        } else if (isGroupMember && hasSyncedUpdates) {
          // Apply only synced properties to group members
          const newSpec = { ...building.spec, ...syncedUpdates };
          return { ...building, spec: newSpec };
        }
        return building;
      });
    });
  }, []);

  const updateBuildingRotation = useCallback((id: BuildingId, rotation: number) => {
    setBuildings(prev => prev.map(building => {
      if (building.id === id) {
        return { ...building, rotation };
      }
      return building;
    }));
  }, []);

  const updateBuildingPosition = useCallback((id: BuildingId, position: { x?: number; y?: number; z?: number }) => {
    setBuildings(prev => prev.map(building => {
      if (building.id === id) {
        return {
          ...building,
          position: {
            x: position.x ?? building.position.x,
            y: position.y ?? building.position.y,
            z: position.z ?? building.position.z,
          },
        };
      }
      return building;
    }));
  }, []);

  const selectBuilding = useCallback((id: BuildingId | null) => {
    setSelectedBuildingId(id);
    setSelectedBuildingIds(id ? [id] : []);
    setPlacementMode(false);
    setMergeMode(false);
  }, []);

  const toggleBuildingSelection = useCallback((id: BuildingId) => {
    setSelectedBuildingIds(prev => {
      if (prev.includes(id)) {
        const newSelection = prev.filter(bid => bid !== id);
        // Update primary selection if needed
        if (selectedBuildingId === id) {
          setSelectedBuildingId(newSelection.length > 0 ? newSelection[0] : null);
        }
        return newSelection;
      } else {
        // Add to selection
        if (prev.length === 0) {
          setSelectedBuildingId(id);
        }
        return [...prev, id];
      }
    });
  }, [selectedBuildingId]);

  const clearSelection = useCallback(() => {
    setSelectedBuildingId(null);
    setSelectedBuildingIds([]);
    setMergeMode(false);
  }, []);

  const mergeBuildings = useCallback(() => {
    if (selectedBuildingIds.length < 2) return;

    // Get the first selected building (primary) - its textures/windows will be inherited
    const primaryBuilding = buildings.find(b => b.id === selectedBuildingIds[0]);
    if (!primaryBuilding) return;

    // Create a new group ID
    const newGroupId: GroupId = `group-${Date.now()}`;

    // Extract synced properties from primary building
    const syncedProperties: Partial<BuildingSpecification> = {};
    for (const key of GROUP_SYNCED_PROPERTIES) {
      if (primaryBuilding.spec[key] !== undefined) {
        syncedProperties[key] = primaryBuilding.spec[key] as never;
      }
    }

    // Group all selected buildings - keep their positions/rotations, sync textures/windows
    setBuildings(prev => prev.map(building => {
      if (selectedBuildingIds.includes(building.id)) {
        return {
          ...building,
          groupId: newGroupId,
          spec: {
            ...building.spec,
            ...syncedProperties,  // Apply primary's textures/windows to all
          },
        };
      }
      return building;
    }));

    // Select the primary building
    setSelectedBuildingId(primaryBuilding.id);
    setSelectedBuildingIds([primaryBuilding.id]);
    setMergeMode(false);
  }, [buildings, selectedBuildingIds]);

  const ungroupBuilding = useCallback((id: BuildingId) => {
    setBuildings(prev => prev.map(building => {
      if (building.id === id) {
        const { groupId, ...rest } = building;
        return rest as BuildingInstance;
      }
      return building;
    }));
  }, []);

  const getGroupMembers = useCallback((groupId: GroupId) => {
    return buildings.filter(b => b.groupId === groupId);
  }, [buildings]);

  const getSelectedBuilding = useCallback(() => {
    if (!selectedBuildingId) return null;
    return buildings.find(b => b.id === selectedBuildingId) || null;
  }, [buildings, selectedBuildingId]);

  const value: BuildingsContextType = {
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
    placementMode,
    mergeMode,
    addBuilding,
    removeBuilding,
    updateBuilding,
    updateBuildingRotation,
    updateBuildingPosition,
    selectBuilding,
    toggleBuildingSelection,
    clearSelection,
    setMergeMode,
    mergeBuildings,
    ungroupBuilding,
    getGroupMembers,
    setPlacementMode,
    getSelectedBuilding,
  };

  return (
    <BuildingsContext.Provider value={value}>
      {children}
    </BuildingsContext.Provider>
  );
}

export function useBuildings() {
  const context = useContext(BuildingsContext);
  if (!context) {
    throw new Error('useBuildings must be used within a BuildingsProvider');
  }
  return context;
}
