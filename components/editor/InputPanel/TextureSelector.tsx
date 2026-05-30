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
  const btnActive = "bg-white/15 border-white/20 text-white";
  const btnInactive = "bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10 hover:border-white/20 hover:text-zinc-200 hover:-translate-y-0.5 active:translate-y-0";

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-bold text-zinc-100 mb-2">Textures</h3>

      {/* Wall Texture */}
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-zinc-400 mb-3">
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
            <span className="text-xs font-semibold text-zinc-500 mb-2 block">Upload Custom Texture</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleWallTextureUpload}
              className="block w-full text-sm text-zinc-500
                file:mr-4 file:py-2.5 file:px-5
                file:rounded-full file:border file:border-white/10
                file:text-sm file:font-medium
                file:bg-white/5 file:text-zinc-300
                hover:file:bg-white/10 hover:file:border-white/20 hover:file:text-white
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
        <label className="block text-sm font-semibold text-zinc-400 mb-3">
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
            <span className="text-xs font-semibold text-zinc-500 mb-2 block">Upload Custom Texture</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleWindowTextureUpload}
              className="block w-full text-sm text-zinc-500
                file:mr-4 file:py-2.5 file:px-5
                file:rounded-full file:border file:border-white/10
                file:text-sm file:font-medium
                file:bg-white/5 file:text-zinc-300
                hover:file:bg-white/10 hover:file:border-white/20 hover:file:text-white
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
