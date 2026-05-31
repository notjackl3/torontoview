import { BuildingSpecification } from '@/lib/editor/types/buildingSpec';
import { WALL_TEXTURES, WINDOW_TEXTURES } from '@/lib/editor/utils/textureLoader';
interface TextureSelectorProps {
  spec: BuildingSpecification;
  onUpdate: (updates: Partial<BuildingSpecification>) => void;
}

export function TextureSelector({ spec, onUpdate }: TextureSelectorProps) {
  const handleWallTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onUpdate({ wallTexture: 'custom', customWallTexture: dataUrl });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWindowTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        onUpdate({ windowTexture: 'custom', customWindowTexture: dataUrl });
      };
      reader.readAsDataURL(file);
    }
  };

  const btnBase = "w-full px-5 py-2.5 rounded-full text-sm font-medium border text-left transition-all duration-200 ease-out";
  const btnActive = "bg-[#003F7C] border-[#003F7C] text-white";
  const btnInactive = "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 hover:text-slate-800 hover:-translate-y-0.5 active:translate-y-0";

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-slate-900 mb-2">Textures</h3>

      {/* Wall Texture */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600 mb-3">
          Wall Texture
        </label>
        <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
          {WALL_TEXTURES.map((texture) => (
            <button
              key={texture.name}
              onClick={() => onUpdate({ wallTexture: texture.name, customWallTexture: undefined })}
              className={`${btnBase} ${
                spec.wallTexture === texture.name && !spec.customWallTexture ? btnActive : btnInactive
              }`}
            >
              {texture.displayName}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 mb-2 block">Upload Custom Texture</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleWallTextureUpload}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2.5 file:px-5
                file:rounded-full file:border file:border-slate-200
                file:text-sm file:font-medium
                file:bg-slate-50 file:text-slate-700
                hover:file:bg-slate-100 hover:file:border-slate-300 hover:file:text-white
                file:cursor-pointer file:transition-all file:duration-200"
            />
          </label>
          {spec.customWallTexture && (
            <p className="mt-2 text-xs font-semibold text-green-400 bg-green-500/10 px-3 py-2 rounded-lg border border-green-400/20">
              ✓ Custom texture loaded
            </p>
          )}
        </div>
      </div>

      {/* Window Texture */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-slate-600 mb-3">
          Window Texture
        </label>
        <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
          {WINDOW_TEXTURES.map((texture) => (
            <button
              key={texture.name}
              onClick={() => onUpdate({ windowTexture: texture.name, customWindowTexture: undefined })}
              className={`${btnBase} ${
                spec.windowTexture === texture.name && !spec.customWindowTexture ? btnActive : btnInactive
              }`}
            >
              {texture.displayName}
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-500 mb-2 block">Upload Custom Texture</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleWindowTextureUpload}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2.5 file:px-5
                file:rounded-full file:border file:border-slate-200
                file:text-sm file:font-medium
                file:bg-slate-50 file:text-slate-700
                hover:file:bg-slate-100 hover:file:border-slate-300 hover:file:text-white
                file:cursor-pointer file:transition-all file:duration-200"
            />
          </label>
          {spec.customWindowTexture && (
            <p className="mt-2 text-xs font-semibold text-green-400 bg-green-500/10 px-3 py-2 rounded-lg border border-green-400/20">
              ✓ Custom texture loaded
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
