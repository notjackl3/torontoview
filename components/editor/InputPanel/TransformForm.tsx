import { BuildingId } from '@/lib/editor/types/buildingSpec';
interface TransformFormProps {
  buildingId: BuildingId;
  position: { x: number; y: number; z: number };
  rotation: number;
  onPositionChange: (position: { x?: number; z?: number }) => void;
  onRotationChange: (rotation: number) => void;
}

export function TransformForm({
  position,
  rotation,
  onPositionChange,
  onRotationChange,
}: TransformFormProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold text-slate-900 mb-4">Position</h3>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-600">
              X Position: <span className="text-blue-400">{position.x.toFixed(1)}m</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="-100"
                max="100"
                step="0.5"
                value={position.x}
                onChange={(e) => onPositionChange({ x: parseFloat(e.target.value) })}
                className="flex-4 h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
              />
              <input
                type="number"
                min="-100"
                max="100"
                step="0.5"
                value={position.x}
                onChange={(e) => onPositionChange({ x: parseFloat(e.target.value) })}
                className="flex-1 px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-center text-slate-800 focus:border-[#003F7C] focus:outline-none transition-colors duration-200"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-600">
              Z Position: <span className="text-blue-400">{position.z.toFixed(1)}m</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="-100"
                max="100"
                step="0.5"
                value={position.z}
                onChange={(e) => onPositionChange({ z: parseFloat(e.target.value) })}
                className="flex-4 h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
              />
              <input
                type="number"
                min="-100"
                max="100"
                step="0.5"
                value={position.z}
                onChange={(e) => onPositionChange({ z: parseFloat(e.target.value) })}
                className="flex-1 px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-center text-slate-800 focus:border-[#003F7C] focus:outline-none transition-colors duration-200"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-200">
        <h3 className="text-xl font-bold text-slate-900 mb-4">Rotation</h3>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-600 mb-2">
            Horizontal Rotation: <span className="text-blue-400">{Math.round(rotation * (180 / Math.PI))}°</span>
          </label>
          <input
            type="range"
            min="0"
            max={2 * Math.PI}
            step={Math.PI / 36}
            value={rotation}
            onChange={(e) => onRotationChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>0°</span>
            <span>90°</span>
            <span>180°</span>
            <span>270°</span>
            <span>360°</span>
          </div>
          <div className="flex gap-2 mt-3">
            {[{ label: '0°', val: 0 }, { label: '90°', val: Math.PI / 2 }, { label: '180°', val: Math.PI }, { label: '270°', val: 3 * Math.PI / 2 }].map(({ label, val }) => (
              <button
                key={label}
                onClick={() => onRotationChange(val)}
                className="flex-1 px-3 py-2 rounded-full text-xs font-medium border bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-900 transition-colors duration-200"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
