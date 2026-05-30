import type { BuildingConfig } from '@/lib/buildingConfig';
import type { BuildingSpecification, RoofType, WindowPattern, WindowShape } from '@/lib/editor/types/buildingSpec';
import { DEFAULT_BUILDING_SPEC } from '@/lib/editor/types/buildingSpec';

/**
 * Maps a voice-generated BuildingConfig to the existing BuildingSpecification format.
 * Adapts field names and values to match what the editor expects.
 */

const TEXTURE_MAP: Record<BuildingConfig['texture'], string> = {
  smooth: 'stucco',
  concrete: 'concrete',
  brick: 'brick',
  wood: 'wood',
  glass: 'glass',
};

const ROOF_MAP: Record<BuildingConfig['roofStyle'], RoofType> = {
  flat: 'flat',
  gable: 'gabled',
  hip: 'hipped',
};

const WINDOW_PATTERN_MAP: Record<BuildingConfig['windowStyle'], WindowPattern> = {
  none: 'none',
  basic: 'grid',
  glass: 'grid',
  arched: 'grid',
  circular: 'grid',
  triangular: 'grid',
};

const WINDOW_SHAPE_MAP: Record<BuildingConfig['windowStyle'], WindowShape> = {
  none: 'rectangular',
  basic: 'rectangular',
  glass: 'rectangular',
  arched: 'arched',
  circular: 'circular',
  triangular: 'triangular',
};

/**
 * Resolves a color name or hex string to a hex number for Three.js.
 * Returns null if the color cannot be parsed.
 */
const COLOR_NAME_MAP: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  gray: '#808080',
  grey: '#808080',
  red: '#cc3333',
  blue: '#336699',
  green: '#336633',
  yellow: '#cccc33',
  brown: '#8b4513',
  beige: '#f5deb3',
  cream: '#fffdd0',
  tan: '#d2b48c',
  orange: '#cc6633',
  pink: '#cc6699',
  purple: '#663399',
  navy: '#003366',
  teal: '#006666',
  silver: '#c0c0c0',
  gold: '#ffd700',
  ivory: '#fffff0',
  charcoal: '#333333',
  slate: '#708090',
  terracotta: '#cc4433',
  sandstone: '#c2b280',
  limestone: '#d9cbb3',
};

function resolveWallColor(colorInput: string): string | undefined {
  if (!colorInput) return undefined;
  const lower = colorInput.toLowerCase().trim();
  if (COLOR_NAME_MAP[lower]) return COLOR_NAME_MAP[lower];
  if (/^#[0-9a-f]{3,6}$/i.test(lower)) return lower;
  return undefined;
}

/**
 * Maps a BuildingConfig from the voice/AI pipeline to the existing BuildingSpecification.
 * Returns a partial spec suitable for use with updateBuilding() or addBuilding().
 */
export function applyBuildingConfig(config: BuildingConfig): Partial<BuildingSpecification> {
  const wallTextureName = TEXTURE_MAP[config.texture] || DEFAULT_BUILDING_SPEC.wallTexture;

  const spec: Partial<BuildingSpecification> = {
    width: config.width,
    depth: config.length,
    numberOfFloors: config.floors,
    floorHeight: config.heightPerFloor,
    roofType: ROOF_MAP[config.roofStyle] || DEFAULT_BUILDING_SPEC.roofType,
    wallTexture: wallTextureName,
    windowPattern: WINDOW_PATTERN_MAP[config.windowStyle] || DEFAULT_BUILDING_SPEC.windowPattern,
    windowShape: WINDOW_SHAPE_MAP[config.windowStyle] || DEFAULT_BUILDING_SPEC.windowShape,
  };

  // Handle wallColor: resolve to hex and store for material override
  const resolvedColor = resolveWallColor(config.wallColor);
  if (resolvedColor) {
    spec.wallColor = resolvedColor;
  }

  // Glass window style uses a different window texture approach
  if (config.windowStyle === 'glass') {
    spec.windowTexture = 'glass';
  }

  // Style-based texture defaults (only if user didn't specify a texture explicitly)
  if (config.style === 'modern' && config.texture === 'concrete') {
    spec.wallTexture = 'concrete';
  } else if (config.style === 'classic' && config.texture === 'concrete') {
    spec.wallTexture = 'brick';
  } else if (config.style === 'industrial') {
    spec.wallTexture = config.texture === 'concrete' ? 'concrete' : TEXTURE_MAP[config.texture];
  }

  return spec;
}
