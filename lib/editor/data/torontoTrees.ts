import { TreeType } from '../types/buildingSpec';

export interface TorontoTreeData {
  id: TreeType;
  name: string;
  scientificName: string;
  height: {
    min: number;
    max: number;
    unit: 'metres';
  };
  crownSpread: {
    min: number;
    max: number;
    unit: 'metres';
  };
  foliageType: 'deciduous' | 'coniferous';
  sunExposure: 'full' | 'partial' | 'shade-tolerant';
  soilAdaptability: 'high' | 'medium' | 'low';
  growthRate: 'fast' | 'medium' | 'slow';
  maintenanceLevel: 'low' | 'medium' | 'high';
  cost: number; // $20 per tree from Toronto program
  spacing: number; // minimum metres between trees
  features: string[];
  fallColor: string;
  springFeatures: string;
  wildlife: boolean;
  fruit: boolean;
  urbanTolerance: 'high' | 'medium' | 'low';
  windBreak: boolean;
  shade: 'excellent' | 'good' | 'moderate' | 'minimal';
  description: string;
  funFacts: string;
  idealFor: string[];
  avoidIf: string[];
}

export const TORONTO_TREES: TorontoTreeData[] = [
  {
    id: 'autumn-blaze-maple',
    name: 'Autumn Blaze Maple',
    scientificName: 'Acer x freemanii \'Autumn Blaze\'',
    height: { min: 15, max: 15, unit: 'metres' },
    crownSpread: { min: 10, max: 10, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'full',
    soilAdaptability: 'high',
    growthRate: 'fast',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 6,
    features: ['brilliant fall color', 'fast growing', 'excellent shade'],
    fallColor: 'brilliant bright red',
    springFeatures: 'green foliage emerges',
    wildlife: false,
    fruit: false,
    urbanTolerance: 'high',
    windBreak: false,
    shade: 'excellent',
    description: 'A fast-growing hybrid maple that provides excellent shade for open spaces. Adaptable to varying soil types.',
    funFacts: 'This fast-growing tree provides excellent shade for an open space.',
    idealFor: ['large open spaces', 'shade gardens', 'quick results', 'fall color display'],
    avoidIf: ['limited space', 'near power lines', 'small yards'],
  },
  {
    id: 'canadian-serviceberry',
    name: 'Canadian Serviceberry',
    scientificName: 'Amelanchier canadensis',
    height: { min: 5, max: 5, unit: 'metres' },
    crownSpread: { min: 5, max: 5, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'partial',
    soilAdaptability: 'high',
    growthRate: 'medium',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 5,
    features: ['white spring flowers', 'edible berries', 'minimal maintenance', 'four-season interest'],
    fallColor: 'deep red',
    springFeatures: 'white flowers',
    wildlife: true,
    fruit: true,
    urbanTolerance: 'high',
    windBreak: false,
    shade: 'minimal',
    description: 'White flowers in spring, deep greenish purple in summer, followed by brilliant transition to deep red in fall.',
    funFacts: 'An icon for garden lovers, the Serviceberry is an extremely minimal maintenance tree and fits well into landscape designs.',
    idealFor: ['small yards', 'landscape designs', 'wildlife gardens', 'low maintenance', 'edible landscaping'],
    avoidIf: ['need large shade tree'],
  },
  {
    id: 'colorado-blue-spruce',
    name: 'Colorado Blue Spruce',
    scientificName: 'Picea pungens var. glauca',
    height: { min: 10, max: 15, unit: 'metres' },
    crownSpread: { min: 7, max: 10, unit: 'metres' },
    foliageType: 'coniferous',
    sunExposure: 'full',
    soilAdaptability: 'high',
    growthRate: 'medium',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 6,
    features: ['silvery blue color', 'year-round interest', 'wind protection', 'holiday tree'],
    fallColor: 'evergreen - silvery blue',
    springFeatures: 'new growth emerges',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'high',
    windBreak: true,
    shade: 'good',
    description: 'Dense needle foliage with a silvery blue colour. Provides excellent wind coverage and stands out in urban settings.',
    funFacts: 'This tree can be seen during the holidays in Springer Market Square.',
    idealFor: ['wind breaks', 'privacy screens', 'year-round color', 'urban settings', 'holiday decorating'],
    avoidIf: ['limited space', 'prefer deciduous'],
  },
  {
    id: 'cortland-apple',
    name: 'Cortland Apple',
    scientificName: 'Malus domestica \'Cortland\'',
    height: { min: 2, max: 4, unit: 'metres' },
    crownSpread: { min: 3, max: 4, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'full',
    soilAdaptability: 'high',
    growthRate: 'slow',
    maintenanceLevel: 'high',
    cost: 20,
    spacing: 5,
    features: ['edible fruit', 'spring blossoms', 'compact size', 'culinary use'],
    fallColor: 'yellowish brown',
    springFeatures: 'white/pink blossoms',
    wildlife: true,
    fruit: true,
    urbanTolerance: 'medium',
    windBreak: false,
    shade: 'minimal',
    description: 'A cross between Ben Davis and McIntosh apple. Medium to large fruit with crisp sweet flavour.',
    funFacts: 'Slow to oxidise making it great for salads, fruit trays and peeled and sliced on its own.',
    idealFor: ['edible gardens', 'small spaces', 'family gardens', 'culinary use'],
    avoidIf: ['want low maintenance', 'no time for pruning', 'need shade'],
  },
  {
    id: 'eastern-redbud',
    name: 'Eastern Redbud',
    scientificName: 'Cercis canadensis',
    height: { min: 10, max: 10, unit: 'metres' },
    crownSpread: { min: 12, max: 12, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'partial',
    soilAdaptability: 'medium',
    growthRate: 'medium',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 6,
    features: ['vibrant pink spring flowers', 'heart-shaped leaves', 'edible parts', 'early bloomer'],
    fallColor: 'yellow',
    springFeatures: 'vibrant pink blossoms before leaves',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'medium',
    windBreak: false,
    shade: 'good',
    description: 'Unique heart shaped green leaves with vibrant pink spring blossoms. Thrives in loam to clay loam soils.',
    funFacts: 'Great landscape tree, flowers early in the spring before leaf out; leaves, flowers and seeds are edible.',
    idealFor: ['spring interest', 'landscape focal points', 'edible landscaping', 'wildlife gardens'],
    avoidIf: ['poor soil drainage', 'very sandy soil'],
  },
  {
    id: 'eastern-white-pine',
    name: 'Eastern White Pine',
    scientificName: 'Pinus strobus',
    height: { min: 20, max: 20, unit: 'metres' },
    crownSpread: { min: 5, max: 5, unit: 'metres' },
    foliageType: 'coniferous',
    sunExposure: 'shade-tolerant',
    soilAdaptability: 'medium',
    growthRate: 'fast',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 6,
    features: ['tall and narrow', 'soft fragrant needles', 'Canadian icon', 'shade tolerant when young'],
    fallColor: 'evergreen - dark green',
    springFeatures: 'new soft needle growth',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'medium',
    windBreak: true,
    shade: 'moderate',
    description: 'Long dark green needles, soft to the touch, emitting a lovely fragrance. Prefers sandy soils but adaptable.',
    funFacts: 'This iconic Canadian species was made famous by artist Tom Thomson, who portrayed the White Pine in many of his renowned paintings.',
    idealFor: ['large properties', 'naturalized areas', 'windbreaks', 'Canadian heritage gardens'],
    avoidIf: ['small yards', 'need broad canopy shade'],
  },
  {
    id: 'mcintosh-apple',
    name: 'McIntosh Apple',
    scientificName: 'Malus domestica \'McIntosh\'',
    height: { min: 2, max: 5, unit: 'metres' },
    crownSpread: { min: 5, max: 5, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'full',
    soilAdaptability: 'medium',
    growthRate: 'medium',
    maintenanceLevel: 'high',
    cost: 20,
    spacing: 5,
    features: ['Canada\'s national apple', 'spring flowers', 'edible fruit', 'heritage variety'],
    fallColor: 'bright yellow',
    springFeatures: 'white flowers',
    wildlife: true,
    fruit: true,
    urbanTolerance: 'medium',
    windBreak: false,
    shade: 'minimal',
    description: 'Green leaves turning bright yellow in fall, with white flowers in spring. Grows best on well drained sites.',
    funFacts: 'Known as Canada\'s national apple, first discovered in Southern Ontario in the early 19th century.',
    idealFor: ['heritage gardens', 'edible landscaping', 'family orchards', 'Canadian themed gardens'],
    avoidIf: ['poor drainage', 'no time for maintenance'],
  },
  {
    id: 'northern-red-oak',
    name: 'Northern Red Oak',
    scientificName: 'Quercus rubra',
    height: { min: 20, max: 30, unit: 'metres' },
    crownSpread: { min: 10, max: 15, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'partial',
    soilAdaptability: 'high',
    growthRate: 'medium',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 6,
    features: ['majestic size', 'excellent shade', 'urban tolerant', 'long-lived'],
    fallColor: 'deep red and brown',
    springFeatures: 'new leaves emerge',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'high',
    windBreak: false,
    shade: 'excellent',
    description: 'Deep forest green leaves transitioning to deep red and brown in fall. Tolerates moderate shade and varying moisture levels.',
    funFacts: 'One of the largest tree species found in the Toronto area, some of which are best seen today around Lake Ontario Park.',
    idealFor: ['large properties', 'parks', 'long-term shade', 'urban environments', 'legacy planting'],
    avoidIf: ['small yards', 'need quick results'],
  },
  {
    id: 'paper-birch',
    name: 'Paper Birch',
    scientificName: 'Betula papyrifera',
    height: { min: 10, max: 10, unit: 'metres' },
    crownSpread: { min: 5, max: 10, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'full',
    soilAdaptability: 'high',
    growthRate: 'medium',
    maintenanceLevel: 'medium',
    cost: 20,
    spacing: 5,
    features: ['white peeling bark', 'year-round interest', 'bright fall color', 'ornamental'],
    fallColor: 'bright yellow',
    springFeatures: 'catkins and new leaves',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'medium',
    windBreak: false,
    shade: 'moderate',
    description: 'Vibrant green leaves throughout summer, turning bright yellow in fall. Beautiful white peeling bark year-round.',
    funFacts: 'Most recognizable for the beautiful white peeling bark that denotes the tree year-round.',
    idealFor: ['ornamental gardens', 'winter interest', 'naturalized areas', 'visual focal points'],
    avoidIf: ['very hot/dry locations', 'need dense shade'],
  },
  {
    id: 'sugar-maple',
    name: 'Sugar Maple',
    scientificName: 'Acer saccharum',
    height: { min: 35, max: 35, unit: 'metres' },
    crownSpread: { min: 10, max: 15, unit: 'metres' },
    foliageType: 'deciduous',
    sunExposure: 'full',
    soilAdaptability: 'low',
    growthRate: 'slow',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 6,
    features: ['maple syrup production', 'Canadian icon', 'spectacular fall color', 'long-lived'],
    fallColor: 'vibrant red, orange, or yellow',
    springFeatures: 'early sap flow, new leaves',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'low',
    windBreak: false,
    shade: 'excellent',
    description: 'Deep yellowish-green leaves turning vibrant red, orange, or yellow in fall. Prefers full sun and deep rich soils.',
    funFacts: 'Best known for the delicious maple syrup its sap produces; the Sugar Maple has become an icon in Canadian culture.',
    idealFor: ['large rural properties', 'syrup production', 'fall color', 'legacy trees', 'Canadian heritage'],
    avoidIf: ['urban/polluted areas', 'poor soil', 'small spaces', 'salt exposure'],
  },
  {
    id: 'white-spruce',
    name: 'White Spruce',
    scientificName: 'Picea glauca',
    height: { min: 10, max: 15, unit: 'metres' },
    crownSpread: { min: 5, max: 5, unit: 'metres' },
    foliageType: 'coniferous',
    sunExposure: 'shade-tolerant',
    soilAdaptability: 'high',
    growthRate: 'medium',
    maintenanceLevel: 'low',
    cost: 20,
    spacing: 5,
    features: ['extremely hardy', 'dense branching', 'wildlife habitat', 'wind/privacy screen'],
    fallColor: 'evergreen - dark green',
    springFeatures: 'new growth; sensitive to late frost',
    wildlife: true,
    fruit: false,
    urbanTolerance: 'high',
    windBreak: true,
    shade: 'moderate',
    description: 'Dark green needles with dense branching. Shade tolerant and adaptable to varying soil types.',
    funFacts: 'An icon of the Canadian north, this hearty tree can grow nearly anywhere. Dense branching offers great hideout for birds, squirrels, and chipmunks.',
    idealFor: ['windbreaks', 'privacy screens', 'wildlife habitat', 'cold climates', 'low maintenance'],
    avoidIf: ['need fall color', 'want fast dense shade'],
  },
];

export const getTreeById = (id: TreeType): TorontoTreeData | undefined => {
  return TORONTO_TREES.find(tree => tree.id === id);
};

export const getTreesByFeature = (feature: string): TorontoTreeData[] => {
  return TORONTO_TREES.filter(tree =>
    tree.features.some(f => f.toLowerCase().includes(feature.toLowerCase())) ||
    tree.idealFor.some(i => i.toLowerCase().includes(feature.toLowerCase()))
  );
};

export const getCheapestTrees = (): TorontoTreeData[] => {
  // All trees are $20, so return all. In future, could sort by maintenance cost
  return [...TORONTO_TREES].sort((a, b) => {
    const maintenanceCost = { low: 1, medium: 2, high: 3 };
    return maintenanceCost[a.maintenanceLevel] - maintenanceCost[b.maintenanceLevel];
  });
};

export const getTreesForShade = (): TorontoTreeData[] => {
  return TORONTO_TREES.filter(tree => tree.shade === 'excellent' || tree.shade === 'good');
};

export const getSmallSpaceTrees = (): TorontoTreeData[] => {
  return TORONTO_TREES.filter(tree => tree.height.max <= 10);
};

export const getNativeTrees = (): TorontoTreeData[] => {
  // Trees native to the Toronto/Ontario area
  return TORONTO_TREES.filter(tree =>
    ['sugar-maple', 'northern-red-oak', 'paper-birch', 'eastern-white-pine', 'white-spruce', 'canadian-serviceberry', 'eastern-redbud'].includes(tree.id)
  );
};

export const TREE_DATASET_SUMMARY = `
Toronto Neighbourhood Tree Planting Program Dataset

This dataset contains 11 tree species available for $20 each through Toronto's program:

DECIDUOUS TREES (lose leaves in fall):
1. Autumn Blaze Maple - 15m, fast-growing, excellent shade, bright red fall color
2. Canadian Serviceberry - 5m, minimal maintenance, white spring flowers, edible berries
3. Cortland Apple - 2-4m, edible fruit, requires pruning, great for culinary use
4. Eastern Redbud - 10m, pink spring flowers, heart-shaped leaves, edible parts
5. McIntosh Apple - 2-5m, Canada's national apple, heritage variety, edible fruit
6. Northern Red Oak - 20-30m, majestic, excellent shade, long-lived, urban tolerant
7. Paper Birch - 10m, distinctive white peeling bark, bright yellow fall color
8. Sugar Maple - up to 35m, maple syrup production, Canadian icon, needs rich soil

CONIFEROUS TREES (keep needles year-round):
9. Colorado Blue Spruce - 10-15m, silvery-blue needles, wind protection
10. Eastern White Pine - 20m tall/narrow, soft fragrant needles, Tom Thomson's inspiration
11. White Spruce - 10-15m, extremely hardy, dense wildlife habitat, windbreak

KEY CONSIDERATIONS FOR RECOMMENDATIONS:
- All trees cost $20 each (up to 3 per purchase)
- Minimum 5-6 metres spacing between trees
- Consider mature height vs overhead wires (3m clearance needed)
- Consider crown spread vs property boundaries
- Full sun vs shade tolerance varies by species
- Urban pollution tolerance varies (Oak and Spruce are most tolerant)
- Maintenance level ranges from minimal (Serviceberry) to high (Apple trees)
`;
