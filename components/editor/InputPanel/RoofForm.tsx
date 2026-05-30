import { BuildingSpecification, RoofType } from '@/lib/editor/types/buildingSpec';

interface RoofFormProps {
  spec: BuildingSpecification;
  onUpdate: (updates: Partial<BuildingSpecification>) => void;
}

const ROOF_TYPES: { value: RoofType; label: string }[] = [
  { value: 'flat', label: 'Flat' },
  { value: 'gabled', label: 'Gabled' },
  { value: 'hipped', label: 'Hipped' },
  { value: 'pyramid', label: 'Pyramid' },
];

export function RoofForm({ spec, onUpdate }: RoofFormProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-zinc-100 mb-2">Roof</h3>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-zinc-400 mb-3">
          Roof Type
        </label>
        <div className="space-y-2">
          {ROOF_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => onUpdate({ roofType: type.value })}
              className={`w-full px-5 py-2.5 rounded-full text-sm font-medium border text-left transition-all duration-200 ease-out ${
                spec.roofType === type.value
                  ? 'bg-white/15 border-white/20 text-white'
                  : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20 hover:text-zinc-200'
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {spec.roofType !== 'flat' && (
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-zinc-400">
            Roof Height (meters): <span className="text-blue-400">{spec.roofHeight}</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              value={spec.roofHeight}
              onChange={(e) => onUpdate({ roofHeight: parseFloat(e.target.value) })}
              className="flex-4 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
            />
            <input
              type="number"
              min="1"
              max="10"
              step="0.5"
              value={spec.roofHeight}
              onChange={(e) => onUpdate({ roofHeight: parseFloat(e.target.value) })}
              className="flex-1 px-3 py-2 border border-white/10 bg-white/5 rounded-lg text-sm text-center text-zinc-200 focus:border-blue-400 focus:outline-none transition-colors duration-200"
            />
          </div>
        </div>
      )}
    </div>
  );
}
