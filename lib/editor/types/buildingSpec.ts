export type RoofType = 'flat' | 'gabled' | 'hipped' | 'pyramid';
export type WindowPattern = 'grid' | 'ribbon' | 'none';
export type WindowShape = 'rectangular' | 'arched' | 'circular' | 'triangular';
export type TreeType =
  | 'autumn-blaze-maple'
  | 'canadian-serviceberry'
  | 'colorado-blue-spruce'
  | 'cortland-apple'
  | 'eastern-redbud'
  | 'eastern-white-pine'
  | 'mcintosh-apple'
  | 'northern-red-oak'
  | 'paper-birch'
  | 'sugar-maple'
  | 'white-spruce';

export interface TreeConfig {
  enabled: boolean;
  density: number; // 1-10, affects number of trees
  radius: number; // distance from building edge
  types: TreeType[]; // which tree types to include
  minScale: number;
  maxScale: number;
  seed: number; // for consistent randomization
}

export interface BuildingSpecification {
  // Dimensions
  width: number;            // meters
  depth: number;            // meters
  floorHeight: number;      // meters
  numberOfFloors: number;

  // Roof
  roofType: RoofType;
  roofHeight: number;       // meters (for non-flat roofs)

  // Textures
  wallTexture: string;      // texture name or 'custom'
  roofTexture: string;      // texture name or 'custom'
  windowTexture: string;    // texture name or 'custom'
  customWallTexture?: string;  // data URL if custom
  customRoofTexture?: string;  // data URL if custom
  customWindowTexture?: string; // data URL if custom

  // Windows
  windowPattern: WindowPattern;
  windowShape: WindowShape;
  windowRows: number;       // windows per floor horizontally
  windowColumns?: number;   // auto-calculated from numberOfFloors
  windowWidth: number;      // meters
  windowHeight: number;     // meters

  // Wall color override (hex string, e.g. "#cc3333")
  wallColor?: string;

  // Trees/Landscaping
  treeConfig?: TreeConfig;
}

export interface BuildingExportData {
  version: string;
  building: BuildingSpecification;
  position: {
    longitude: number | null;
    latitude: number | null;
    altitude: number;
    rotation: number;
  };
  metadata?: {
    name?: string;
    description?: string;
    createdAt?: string;
  };
}

export const DEFAULT_TREE_CONFIG: TreeConfig = {
  enabled: true,
  density: 5,
  radius: 8,
  types: ['sugar-maple', 'northern-red-oak', 'white-spruce'],
  minScale: 0.8,
  maxScale: 1.4,
  seed: 12345,
};

export const DEFAULT_BUILDING_SPEC: BuildingSpecification = {
  width: 20,
  depth: 15,
  floorHeight: 3.5,
  numberOfFloors: 3,
  roofType: 'flat',
  roofHeight: 3,
  wallTexture: 'brick',
  roofTexture: 'shingle',
  windowTexture: 'glass',
  windowPattern: 'grid',
  windowShape: 'rectangular',
  windowRows: 4,
  windowWidth: 1.2,
  windowHeight: 1.8,
  treeConfig: DEFAULT_TREE_CONFIG,
};

// Multi-building support types
export type BuildingId = string;
export type GroupId = string;

export interface BuildingInstance {
  id: BuildingId;
  name: string;
  position: { x: number; y: number; z: number };
  rotation: number;
  spec: BuildingSpecification;
  groupId?: GroupId;  // Buildings in the same group share textures/windows
}

// Properties that are synced across grouped buildings
export const GROUP_SYNCED_PROPERTIES: (keyof BuildingSpecification)[] = [
  'wallTexture',
  'roofTexture',
  'windowTexture',
  'customWallTexture',
  'customRoofTexture',
  'customWindowTexture',
  'windowPattern',
  'windowShape',
  'windowRows',
  'windowWidth',
  'windowHeight',
];

export interface MultiBuildingExportData {
  version: string;
  buildings: BuildingInstance[];
  metadata?: {
    name?: string;
    createdAt?: string;
  };
}
