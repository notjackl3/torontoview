import { BuildingSpecification, BuildingId } from '@/lib/editor/types/buildingSpec';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';
import { useCallback } from 'react';
interface DimensionsFormProps {
  spec: BuildingSpecification;
  onUpdate: (updates: Partial<BuildingSpecification>) => void;
  buildingId: BuildingId;
}

export function DimensionsForm({ spec, onUpdate, buildingId }: DimensionsFormProps) {
  const { buildings } = useBuildings();
  const currentBuilding = buildings.find(b => b.id === buildingId);

  const getMaxDimension = useCallback((dimension: 'width' | 'depth'): number => {
    if (!currentBuilding) return 50;

    const currentX = currentBuilding.position.x;
    const currentY = currentBuilding.position.y;
    const currentZ = currentBuilding.position.z;
    const currentHeight = spec.floorHeight * spec.numberOfFloors;

    let maxAllowed = 50;

    for (const other of buildings) {
      if (other.id === buildingId) continue;

      const otherX = other.position.x;
      const otherY = other.position.y;
      const otherZ = other.position.z;
      const otherWidth = other.spec.width;
      const otherDepth = other.spec.depth;
      const otherHeight = other.spec.floorHeight * other.spec.numberOfFloors;

      const verticalOverlap = !(currentY + currentHeight <= otherY || otherY + otherHeight <= currentY);
      if (!verticalOverlap) continue;

      if (dimension === 'width') {
        const currentDepth = spec.depth;
        const zOverlap = !(currentZ + currentDepth / 2 <= otherZ - otherDepth / 2 ||
                          currentZ - currentDepth / 2 >= otherZ + otherDepth / 2);

        if (zOverlap) {
          const distX = Math.abs(currentX - otherX);
          const maxWidth = (distX - otherWidth / 2) * 2;
          if (maxWidth > 0 && maxWidth < maxAllowed) {
            maxAllowed = Math.max(5, maxWidth - 0.5);
          }
        }
      } else {
        const currentWidth = spec.width;
        const xOverlap = !(currentX + currentWidth / 2 <= otherX - otherWidth / 2 ||
                          currentX - currentWidth / 2 >= otherX + otherWidth / 2);

        if (xOverlap) {
          const distZ = Math.abs(currentZ - otherZ);
          const maxDepth = (distZ - otherDepth / 2) * 2;
          if (maxDepth > 0 && maxDepth < maxAllowed) {
            maxAllowed = Math.max(5, maxDepth - 0.5);
          }
        }
      }
    }

    return maxAllowed;
  }, [buildings, buildingId, currentBuilding, spec.depth, spec.width, spec.floorHeight, spec.numberOfFloors]);

  const getMaxHeight = useCallback((): { maxHeight: number; hasBuildingAbove: boolean } => {
    if (!currentBuilding) return { maxHeight: Infinity, hasBuildingAbove: false };

    const currentX = currentBuilding.position.x;
    const currentY = currentBuilding.position.y;
    const currentZ = currentBuilding.position.z;
    const currentWidth = spec.width;
    const currentDepth = spec.depth;

    let minBuildingAboveY = Infinity;

    for (const other of buildings) {
      if (other.id === buildingId) continue;

      const otherX = other.position.x;
      const otherY = other.position.y;
      const otherZ = other.position.z;
      const otherWidth = other.spec.width;
      const otherDepth = other.spec.depth;

      if (otherY <= currentY) continue;

      const xOverlap = !(currentX + currentWidth / 2 <= otherX - otherWidth / 2 ||
                        currentX - currentWidth / 2 >= otherX + otherWidth / 2);
      const zOverlap = !(currentZ + currentDepth / 2 <= otherZ - otherDepth / 2 ||
                        currentZ - currentDepth / 2 >= otherZ + otherDepth / 2);

      if (xOverlap && zOverlap && otherY < minBuildingAboveY) {
        minBuildingAboveY = otherY;
      }
    }

    const maxHeight = minBuildingAboveY - currentY;
    return { maxHeight, hasBuildingAbove: minBuildingAboveY !== Infinity };
  }, [buildings, buildingId, currentBuilding, spec.width, spec.depth]);

  const maxWidth = getMaxDimension('width');
  const maxDepth = getMaxDimension('depth');
  const { maxHeight, hasBuildingAbove } = getMaxHeight();

  const maxFloors = hasBuildingAbove ? Math.max(1, Math.floor(maxHeight / spec.floorHeight)) : 20;
  const maxFloorHeight = hasBuildingAbove ? Math.max(2.5, maxHeight / spec.numberOfFloors) : 6;

  const sliderClass = "flex-4 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing";
  const inputClass = "flex-1 px-3 py-2 border border-white/10 bg-white/5 rounded-lg text-sm text-center text-zinc-200 focus:border-blue-400 focus:outline-none transition-colors duration-200";

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-zinc-100 mb-2">Dimensions</h3>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-400">
          Width (meters): <span className="text-blue-400">{spec.width}</span>
          {maxWidth < 50 && <span className="text-zinc-500 text-xs ml-2">(max: {maxWidth.toFixed(1)}m)</span>}
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min="5" max={maxWidth} step="0.5" value={Math.min(spec.width, maxWidth)}
            onChange={(e) => onUpdate({ width: parseFloat(e.target.value) })} className={sliderClass} />
          <input type="number" min="5" max={maxWidth} step="0.5" value={spec.width}
            onChange={(e) => { const val = parseFloat(e.target.value); onUpdate({ width: Math.min(val, maxWidth) }); }}
            className={inputClass} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-400">
          Depth (meters): <span className="text-blue-400">{spec.depth}</span>
          {maxDepth < 50 && <span className="text-zinc-500 text-xs ml-2">(max: {maxDepth.toFixed(1)}m)</span>}
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min="5" max={maxDepth} step="0.5" value={Math.min(spec.depth, maxDepth)}
            onChange={(e) => onUpdate({ depth: parseFloat(e.target.value) })} className={sliderClass} />
          <input type="number" min="5" max={maxDepth} step="0.5" value={spec.depth}
            onChange={(e) => { const val = parseFloat(e.target.value); onUpdate({ depth: Math.min(val, maxDepth) }); }}
            className={inputClass} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-400">
          Number of Floors: <span className="text-blue-400">{spec.numberOfFloors}</span>
          {hasBuildingAbove && maxFloors < 20 && <span className="text-zinc-500 text-xs ml-2">(max: {maxFloors})</span>}
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min="1" max={maxFloors} step="1" value={Math.min(spec.numberOfFloors, maxFloors)}
            onChange={(e) => onUpdate({ numberOfFloors: parseInt(e.target.value) })} className={sliderClass} />
          <input type="number" min="1" max={maxFloors} step="1" value={spec.numberOfFloors}
            onChange={(e) => { const val = parseInt(e.target.value); onUpdate({ numberOfFloors: Math.min(val, maxFloors) }); }}
            className={inputClass} />
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-semibold text-zinc-400">
          Floor Height (meters): <span className="text-blue-400">{spec.floorHeight}</span>
          {hasBuildingAbove && maxFloorHeight < 6 && <span className="text-zinc-500 text-xs ml-2">(max: {maxFloorHeight.toFixed(1)}m)</span>}
        </label>
        <div className="flex items-center gap-3">
          <input type="range" min="2.5" max={maxFloorHeight} step="0.1" value={Math.min(spec.floorHeight, maxFloorHeight)}
            onChange={(e) => onUpdate({ floorHeight: parseFloat(e.target.value) })} className={sliderClass} />
          <input type="number" min="2.5" max={maxFloorHeight} step="0.1" value={spec.floorHeight}
            onChange={(e) => { const val = parseFloat(e.target.value); onUpdate({ floorHeight: Math.min(val, maxFloorHeight) }); }}
            className={inputClass} />
        </div>
      </div>

      <div className="pt-4 mt-6 border-t border-white/10">
        <p className="text-sm text-zinc-400 bg-white/5 px-4 py-3 rounded-lg border border-white/10">
          Total Height: <span className="font-bold text-zinc-200">{(spec.numberOfFloors * spec.floorHeight).toFixed(1)}m</span>
        </p>
      </div>
    </div>
  );
}
