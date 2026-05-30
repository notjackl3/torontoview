import { z } from 'zod';

export const BuildingConfigSchema = z.object({
  floors: z.number().int().min(1).max(200),
  width: z.number().min(0.5).max(500),
  length: z.number().min(0.5).max(500),
  heightPerFloor: z.number().min(2).max(10),
  wallColor: z.string(),
  windowStyle: z.enum(['none', 'basic', 'glass', 'arched', 'circular', 'triangular']),
  style: z.enum(['modern', 'classic', 'industrial', 'minimal']),
  texture: z.enum(['smooth', 'concrete', 'brick', 'wood', 'glass']),
  roofStyle: z.enum(['flat', 'gable', 'hip']),
  notes: z.string().optional(),
});

export type BuildingConfig = z.infer<typeof BuildingConfigSchema>;

export const defaultBuildingConfig: BuildingConfig = {
  floors: 3,
  width: 20,
  length: 15,
  heightPerFloor: 3.5,
  wallColor: 'gray',
  windowStyle: 'basic',
  style: 'modern',
  texture: 'concrete',
  roofStyle: 'flat',
};

/**
 * Clamps ranges and fills missing fields with defaults.
 * Returns a valid BuildingConfig with any out-of-range values corrected.
 */
export function normalizeBuildingConfig(
  config: Partial<BuildingConfig>
): { config: BuildingConfig; clamped: string[] } {
  const clamped: string[] = [];

  function clampField(
    value: number | undefined,
    min: number,
    max: number,
    defaultValue: number,
    fieldName: string
  ): number {
    if (value === undefined || value === null) return defaultValue;
    if (value < min) {
      clamped.push(`${fieldName} clamped from ${value} to ${min}`);
      return min;
    }
    if (value > max) {
      clamped.push(`${fieldName} clamped from ${value} to ${max}`);
      return max;
    }
    return value;
  }

  const normalized: BuildingConfig = {
    floors: clampField(config.floors, 1, 200, defaultBuildingConfig.floors, 'floors'),
    width: clampField(config.width, 0.5, 500, defaultBuildingConfig.width, 'width'),
    length: clampField(config.length, 0.5, 500, defaultBuildingConfig.length, 'length'),
    heightPerFloor: clampField(
      config.heightPerFloor,
      2,
      10,
      defaultBuildingConfig.heightPerFloor,
      'heightPerFloor'
    ),
    wallColor: config.wallColor || defaultBuildingConfig.wallColor,
    windowStyle: config.windowStyle || defaultBuildingConfig.windowStyle,
    style: config.style || defaultBuildingConfig.style,
    texture: config.texture || defaultBuildingConfig.texture,
    roofStyle: config.roofStyle || defaultBuildingConfig.roofStyle,
    notes: config.notes,
  };

  // Validate enum values, falling back to defaults for invalid ones
  const validWindowStyles = ['none', 'basic', 'glass', 'arched', 'circular', 'triangular'] as const;
  if (!validWindowStyles.includes(normalized.windowStyle as typeof validWindowStyles[number])) {
    normalized.windowStyle = defaultBuildingConfig.windowStyle;
  }

  const validStyles = ['modern', 'classic', 'industrial', 'minimal'] as const;
  if (!validStyles.includes(normalized.style as typeof validStyles[number])) {
    normalized.style = defaultBuildingConfig.style;
  }

  const validTextures = ['smooth', 'concrete', 'brick', 'wood', 'glass'] as const;
  if (!validTextures.includes(normalized.texture as typeof validTextures[number])) {
    normalized.texture = defaultBuildingConfig.texture;
  }

  const validRoofStyles = ['flat', 'gable', 'hip'] as const;
  if (!validRoofStyles.includes(normalized.roofStyle as typeof validRoofStyles[number])) {
    normalized.roofStyle = defaultBuildingConfig.roofStyle;
  }

  return { config: normalized, clamped };
}
