import { useState, useCallback } from 'react';
import type { BuildingSpecification } from '@/lib/editor/types/buildingSpec';
import { DEFAULT_BUILDING_SPEC } from '@/lib/editor/types/buildingSpec';

export function useBuildingSpec() {
  const [spec, setSpec] = useState<BuildingSpecification>(DEFAULT_BUILDING_SPEC);

  const updateSpec = useCallback((updates: Partial<BuildingSpecification>) => {
    setSpec(prev => {
      const newSpec = { ...prev, ...updates };

      // Auto-calculate windowColumns from numberOfFloors if not explicitly set
      if (updates.numberOfFloors !== undefined && updates.windowColumns === undefined) {
        newSpec.windowColumns = newSpec.numberOfFloors;
      }

      return newSpec;
    });
  }, []);

  const resetSpec = useCallback(() => {
    setSpec(DEFAULT_BUILDING_SPEC);
  }, []);

  const loadSpec = useCallback((newSpec: BuildingSpecification) => {
    setSpec(newSpec);
  }, []);

  return {
    spec,
    updateSpec,
    resetSpec,
    loadSpec,
  };
}
