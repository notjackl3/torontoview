import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';

export function BuildingList() {
  const {
    buildings,
    selectedBuildingId,
    selectedBuildingIds,
    selectBuilding,
    toggleBuildingSelection,
    removeBuilding,
    placementMode,
    setPlacementMode,
    mergeMode,
    setMergeMode,
    mergeBuildings,
    ungroupBuilding,
  } = useBuildings();

  const handleAddBuilding = () => {
    setPlacementMode(true);
  };

  const handleBuildingClick = (buildingId: string) => {
    if (mergeMode) {
      toggleBuildingSelection(buildingId);
    } else {
      selectBuilding(buildingId);
    }
  };

  const handleMerge = () => {
    if (selectedBuildingIds.length >= 2) {
      mergeBuildings();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-100">Buildings</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setMergeMode(!mergeMode)}
            disabled={placementMode || buildings.length < 2}
            className={`px-4 py-2 rounded-full font-medium text-sm border-2 transition-all duration-200 ease-out ${
              mergeMode
                ? 'bg-purple-500 border-purple-400 text-white shadow-[0_8px_25px_-5px_rgba(147,51,234,0.35)]'
                : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-purple-500/20 hover:border-purple-400/40 hover:text-purple-300 hover:-translate-y-0.5 active:translate-y-0'
            } disabled:bg-white/5 disabled:border-white/10 disabled:text-zinc-600 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none`}
          >
            {mergeMode ? 'Cancel' : 'Group'}
          </button>
          <button
            onClick={handleAddBuilding}
            disabled={placementMode || mergeMode}
            className="px-4 py-2 rounded-full font-medium text-sm border-2 bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 hover:text-white hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-200 ease-out"
          >
            {placementMode ? 'Click Grid...' : '+ Add'}
          </button>
        </div>
      </div>

      {mergeMode && (
        <div className="p-3 bg-purple-500/10 border border-purple-400/20 rounded-lg">
          <p className="text-sm text-purple-300 font-medium">Group Mode</p>
          <p className="text-xs text-purple-400/70 mt-1">
            Select 2+ buildings to group. They keep individual rotations but share textures/windows.
          </p>
          {selectedBuildingIds.length >= 2 && (
            <button
              onClick={handleMerge}
              className="mt-2 px-4 py-2 rounded-full text-sm font-medium bg-purple-500 border-2 border-purple-400 text-white hover:bg-purple-600 transition-all duration-200 ease-out"
            >
              Group {selectedBuildingIds.length} Buildings
            </button>
          )}
        </div>
      )}

      <div className="space-y-1 max-h-28 overflow-y-auto">
        {buildings.map((building) => {
          const isSelected = mergeMode
            ? selectedBuildingIds.includes(building.id)
            : selectedBuildingId === building.id;
          const selectionIndex = mergeMode ? selectedBuildingIds.indexOf(building.id) : -1;

          return (
            <div
              key={building.id}
              className={`
                px-3 py-2 rounded-lg border cursor-pointer transition-all duration-200 ease-out
                ${isSelected
                  ? mergeMode
                    ? 'border-purple-400/60 bg-purple-500/10'
                    : 'border-blue-400/60 bg-blue-500/10 shadow-[0_2px_10px_-2px_rgba(59,130,246,0.2)]'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                }
              `}
              onClick={() => handleBuildingClick(building.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {mergeMode && selectionIndex >= 0 && (
                      <span className="w-4 h-4 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center font-bold">
                        {selectionIndex + 1}
                      </span>
                    )}
                    <span className="font-medium text-zinc-200 text-sm">{building.name}</span>
                    {mergeMode && selectionIndex === 0 && (
                      <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">Primary</span>
                    )}
                    {!mergeMode && building.groupId && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">Grouped</span>
                    )}
                    <span className="text-xs text-zinc-500">
                      {building.spec.width}×{building.spec.depth}m, {building.spec.numberOfFloors}F
                    </span>
                  </div>
                </div>
                {!mergeMode && (
                  <div className="flex items-center gap-1">
                    {building.groupId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          ungroupBuilding(building.id);
                        }}
                        className="p-1.5 rounded-full border border-green-400/40 text-green-500 hover:bg-green-500 hover:border-green-400 hover:text-white transition-all duration-200 ease-out"
                        title="Ungroup building"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBuilding(building.id);
                      }}
                      className="p-1.5 rounded-full border border-red-400/40 text-red-500 hover:bg-red-500 hover:border-red-400 hover:text-white transition-all duration-200 ease-out"
                      title="Delete building"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {placementMode && (
        <div className="p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-blue-400 mt-0.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-zinc-200 font-medium">Placement Mode Active</p>
              <p className="text-xs text-zinc-500 mt-1">
                Click anywhere on the grid to place the new building
              </p>
              <button
                onClick={() => setPlacementMode(false)}
                className="mt-2 px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-200 ease-out"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
