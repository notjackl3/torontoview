import { BuildingSpecification, WindowPattern, WindowShape } from '@/lib/editor/types/buildingSpec';
interface WindowFormProps {
  spec: BuildingSpecification;
  onUpdate: (updates: Partial<BuildingSpecification>) => void;
}

const WINDOW_PATTERNS: { value: WindowPattern; label: string }[] = [
  { value: 'grid', label: 'Grid' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'none', label: 'None' },
];

const WINDOW_SHAPES: { value: WindowShape; label: string; icon: string }[] = [
  { value: 'rectangular', label: 'Rectangle', icon: '▭' },
  { value: 'arched', label: 'Arched', icon: '⌂' },
  { value: 'circular', label: 'Circle', icon: '○' },
  { value: 'triangular', label: 'Triangle', icon: '△' },
];

const sliderClass = "w-full h-2 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-blue-400 [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing";

export function WindowForm({ spec, onUpdate }: WindowFormProps) {
  const handleWindowUpdate = (updates: Partial<BuildingSpecification>) => {
    onUpdate(updates);
  };

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-slate-900 mb-2">Windows</h3>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600 mb-3">
          Window Pattern
        </label>
        <div className="space-y-2">
          {WINDOW_PATTERNS.map((pattern) => (
            <button
              key={pattern.value}
              onClick={() => handleWindowUpdate({ windowPattern: pattern.value })}
              className={`w-full px-5 py-2.5 rounded-full text-sm font-medium border text-left transition-all duration-200 ease-out ${
                spec.windowPattern === pattern.value
                  ? 'bg-[#003F7C] border-[#003F7C] text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              {pattern.label}
            </button>
          ))}
        </div>
      </div>

      {spec.windowPattern !== 'none' && (
        <>
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-600 mb-3">
              Window Shape
            </label>
            <div className="grid grid-cols-4 gap-2">
              {WINDOW_SHAPES.map((shape) => (
                <button
                  key={shape.value}
                  onClick={() => handleWindowUpdate({ windowShape: shape.value })}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium border flex flex-col items-center gap-1 transition-all duration-200 ease-out ${
                    spec.windowShape === shape.value
                      ? 'bg-[#003F7C] border-[#003F7C] text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800'
                  }`}
                >
                  <span className="text-lg">{shape.icon}</span>
                  <span className="text-xs">{shape.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-600 mb-2">
              Windows per Floor: <span className="text-blue-400">{spec.windowRows}</span>
            </label>
            <input type="range" min="1" max="10" step="1" value={spec.windowRows}
              onChange={(e) => onUpdate({ windowRows: parseInt(e.target.value) })} className={sliderClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-600">
                Width: <span className="text-blue-400">{spec.windowWidth?.toFixed(1)}m</span>
              </label>
              <input type="range" min="0.5" max="3" step="0.1" value={spec.windowWidth || 1.2}
                onChange={(e) => handleWindowUpdate({ windowWidth: parseFloat(e.target.value) })} className={sliderClass} />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-600">
                Height: <span className="text-blue-400">{spec.windowHeight?.toFixed(1)}m</span>
              </label>
              <input type="range" min="0.5" max="3" step="0.1" value={spec.windowHeight || 1.8}
                onChange={(e) => handleWindowUpdate({ windowHeight: parseFloat(e.target.value) })} className={sliderClass} />
            </div>
          </div>
        </>
      )}

    </div>
  );
}
