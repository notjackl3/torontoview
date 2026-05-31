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
        <h3 className="text-base font-black tracking-tight text-slate-900">Buildings</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setMergeMode(!mergeMode)}
            disabled={placementMode || buildings.length < 2}
            className={`px-3 py-1.5 rounded-full font-bold text-[11px] uppercase tracking-tight border transition-all duration-200 ${
              mergeMode
                ? 'bg-purple-600 border-purple-600 text-white shadow-[0_8px_22px_-10px_rgba(147,51,234,0.45)]'
                : 'bg-white border-purple-300/60 text-purple-700 hover:bg-purple-50'
            } disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed`}
          >
            {mergeMode ? 'Cancel' : 'Group'}
          </button>
          <button
            onClick={handleAddBuilding}
            disabled={placementMode || mergeMode}
            className="px-3 py-1.5 rounded-full font-bold text-[11px] uppercase tracking-tight border border-[#003F7C]/20 bg-white text-[#003F7C] hover:bg-[#003F7C] hover:text-white hover:border-[#003F7C] disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {placementMode ? 'Click Grid…' : '+ Add'}
          </button>
        </div>
      </div>

      {mergeMode && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-purple-800 font-bold">Group Mode</p>
          <p className="text-xs text-purple-700/80 mt-1 leading-snug">
            Select 2+ buildings to group. They keep individual rotations but share textures/windows.
          </p>
          {selectedBuildingIds.length >= 2 && (
            <button
              onClick={handleMerge}
              className="mt-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-tight bg-purple-600 text-white hover:bg-purple-700 transition-colors duration-200"
            >
              Group {selectedBuildingIds.length} buildings
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
              className={`px-3 py-2 rounded-lg border cursor-pointer transition-colors duration-150 ${
                isSelected
                  ? mergeMode
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-[#003F7C]/60 bg-[#003F7C]/5'
                  : 'border-[#003F7C]/10 bg-white hover:border-[#003F7C]/25 hover:bg-[#003F7C]/4'
              }`}
              onClick={() => handleBuildingClick(building.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {mergeMode && selectionIndex >= 0 && (
                      <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[10px] flex items-center justify-center font-bold">
                        {selectionIndex + 1}
                      </span>
                    )}
                    <span className="font-bold text-slate-900 text-sm">{building.name}</span>
                    {mergeMode && selectionIndex === 0 && (
                      <span className="text-[9px] font-black uppercase tracking-tight bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">Primary</span>
                    )}
                    {!mergeMode && building.groupId && (
                      <span className="text-[9px] font-black uppercase tracking-tight bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Grouped</span>
                    )}
                    <span className="text-[11px] text-slate-500">
                      {building.spec.width}×{building.spec.depth}m · {building.spec.numberOfFloors}F
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
                        className="p-1.5 rounded-full border border-emerald-300 text-emerald-600 hover:bg-emerald-600 hover:border-emerald-600 hover:text-white transition-colors duration-200"
                        title="Ungroup building"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="p-1.5 rounded-full border border-red-300 text-red-600 hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors duration-200"
                      title="Delete building"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <div className="p-3 bg-[#003F7C]/5 border border-[#003F7C]/20 rounded-lg">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-[#003F7C] mt-0.5 shrink-0"
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
              <p className="text-sm font-bold text-slate-900">Placement Mode Active</p>
              <p className="text-xs text-slate-600 mt-1 leading-snug">
                Click anywhere on the grid to place the new building
              </p>
              <button
                onClick={() => setPlacementMode(false)}
                className="mt-2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-tight border border-[#003F7C]/20 bg-white text-[#003F7C] hover:bg-[#003F7C] hover:text-white transition-colors duration-200"
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
