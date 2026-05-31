import { useState } from 'react';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';
import { TransformForm } from './TransformForm';
import { DimensionsForm } from './DimensionsForm';
import { TextureSelector } from './TextureSelector';
import { WindowForm } from './WindowForm';
import { TreeForm } from './TreeForm';
import { BuildingList } from './BuildingList';
import { DEFAULT_BUILDING_SPEC } from '@/lib/editor/types/buildingSpec';

type SettingsTab = 'transform' | 'dimensions' | 'textures' | 'windows' | 'trees';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'transform', label: 'Transform', icon: '' },
  { id: 'dimensions', label: 'Dimensions', icon: '' },
  { id: 'textures', label: 'Textures', icon: '' },
  { id: 'windows', label: 'Windows', icon: '' },
  { id: 'trees', label: 'Trees', icon: '' },
];

export function InputPanel() {
  const { getSelectedBuilding, updateBuilding, updateBuildingRotation, updateBuildingPosition } = useBuildings();
  const selectedBuilding = getSelectedBuilding();
  const [activeTab, setActiveTab] = useState<SettingsTab>('transform');

  const handleUpdate = (updates: Partial<typeof DEFAULT_BUILDING_SPEC>) => {
    if (selectedBuilding) {
      updateBuilding(selectedBuilding.id, updates);
    }
  };

  const handleReset = () => {
    if (selectedBuilding) {
      updateBuilding(selectedBuilding.id, DEFAULT_BUILDING_SPEC);
    }
  };

  return (
    <div className="w-full h-full flex flex-col border-r border-[#003F7C]/12 bg-white/85 backdrop-blur-xl shadow-[6px_0_22px_-18px_rgba(0,63,124,0.25)]">
      {/* Fixed Header Section */}
      <div className="p-6 pb-4 border-b border-[#003F7C]/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Building Designer</h2>
        </div>

        {/* Building List */}
        <div className="bg-[#003F7C]/5 p-4 rounded-xl border border-[#003F7C]/12">
          <BuildingList />
        </div>
      </div>

      {/* Building Settings Section */}
      {selectedBuilding ? (
        <div className="flex-1 flex flex-col min-h-0 basis-1/2">
          {/* Settings Header with Reset */}
          <div className="px-6 pt-4 pb-2 flex items-center justify-between">
            <h3 className="text-lg font-black tracking-tight text-slate-900">
              {selectedBuilding.name}
            </h3>
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-full font-bold text-xs uppercase tracking-tight border border-[#003F7C]/15 bg-white text-slate-600 hover:bg-[#003F7C] hover:text-white hover:border-[#003F7C] transition-colors duration-200"
            >
              Reset
            </button>
          </div>

          {/* Tab Bar */}
          <div className="px-6 py-2">
            <div className="flex gap-1 p-1 bg-[#003F7C]/5 rounded-xl border border-[#003F7C]/10">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-tight transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white text-[#003F7C] shadow-[0_2px_10px_-2px_rgba(0,63,124,0.18)]'
                      : 'text-slate-500 hover:text-[#003F7C] hover:bg-white/60'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="bg-white p-6 rounded-xl border border-[#003F7C]/10 shadow-[0_8px_24px_-18px_rgba(0,63,124,0.25)]">
              {activeTab === 'transform' && (
                <TransformForm
                  buildingId={selectedBuilding.id}
                  position={selectedBuilding.position}
                  rotation={selectedBuilding.rotation}
                  onPositionChange={(pos) => updateBuildingPosition(selectedBuilding.id, pos)}
                  onRotationChange={(rotation) => updateBuildingRotation(selectedBuilding.id, rotation)}
                />
              )}
              {activeTab === 'dimensions' && (
                <DimensionsForm
                  spec={selectedBuilding.spec}
                  onUpdate={handleUpdate}
                  buildingId={selectedBuilding.id}
                />
              )}
              {activeTab === 'textures' && (
                <TextureSelector spec={selectedBuilding.spec} onUpdate={handleUpdate} />
              )}
              {activeTab === 'windows' && (
                <WindowForm spec={selectedBuilding.spec} onUpdate={handleUpdate} />
              )}
              {activeTab === 'trees' && (
                <TreeForm spec={selectedBuilding.spec} onUpdate={handleUpdate} />
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center py-12 px-6 bg-white rounded-xl border border-[#003F7C]/10 w-full shadow-[0_8px_24px_-18px_rgba(0,63,124,0.2)]">
            <p className="text-slate-700 text-lg font-bold">No building selected</p>
            <p className="text-sm text-slate-500 mt-3">Add a building to get started</p>
          </div>
        </div>
      )}
    </div>
  );
}
