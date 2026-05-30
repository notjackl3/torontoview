/**
 * Process raw OSM data into the format expected by the app
 * Run with: npx tsx scripts/process-map-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as turf from '@turf/turf';

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'map-data');

// ==================== BUILDINGS ====================

type RoofShape = 'flat' | 'gabled' | 'hipped' | 'pyramidal' | 'dome' | 'skillion';

interface Building {
  id: string;
  footprint: [number, number][];
  height: number;
  type?: string;
  roofShape: RoofShape;
  roofHeight: number;
  color?: string;
  roofColor?: string;
  material?: string;
  levels?: number;
}

function parseHeight(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.toString().match(/[\d.]+/);
  if (match) {
    const h = parseFloat(match[0]);
    if (!isNaN(h) && h > 0) return h;
  }
  return null;
}

/**
 * Infer roof shape from building type when not explicitly tagged
 */
function inferRoofShape(type: string | undefined): RoofShape {
  switch (type) {
    case 'house':
    case 'detached':
    case 'semidetached_house':
    case 'terrace':
    case 'bungalow':
    case 'farm':
    case 'cabin':
      return 'gabled';

    case 'residential':
      return 'hipped'; // multi-unit residential often hipped

    case 'church':
    case 'cathedral':
    case 'chapel':
      return 'gabled'; // steep gable

    case 'garage':
    case 'garages':
    case 'carport':
    case 'shed':
      return 'skillion';

    case 'apartments':
    case 'commercial':
    case 'retail':
    case 'office':
    case 'industrial':
    case 'warehouse':
    case 'school':
    case 'university':
    case 'hospital':
    case 'civic':
    case 'public':
    case 'government':
      return 'flat';

    default:
      return 'flat';
  }
}

/**
 * Infer roof height based on shape and building dimensions
 */
function inferRoofHeight(shape: RoofShape, wallHeight: number, type?: string): number {
  switch (shape) {
    case 'gabled':
      // Churches get steeper roofs
      if (type === 'church' || type === 'cathedral' || type === 'chapel') {
        return wallHeight * 0.5;
      }
      return wallHeight * 0.3;
    case 'hipped':
      return wallHeight * 0.25;
    case 'pyramidal':
      return wallHeight * 0.4;
    case 'dome':
      return wallHeight * 0.35;
    case 'skillion':
      return wallHeight * 0.15;
    case 'flat':
    default:
      return 0;
  }
}

/**
 * Default wall height by building type when no height/levels data exists
 */
function defaultHeightForType(type: string | undefined): number {
  switch (type) {
    case 'house':
    case 'detached':
    case 'semidetached_house':
    case 'bungalow':
    case 'cabin':
      return 6; // ~2 stories
    case 'garage':
    case 'garages':
    case 'carport':
    case 'shed':
      return 3;
    case 'church':
    case 'cathedral':
      return 15;
    case 'chapel':
      return 8;
    case 'industrial':
    case 'warehouse':
      return 8;
    case 'apartments':
      return 14; // ~4 stories
    case 'commercial':
    case 'retail':
    case 'office':
      return 12;
    case 'school':
    case 'university':
    case 'hospital':
      return 12;
    case 'civic':
    case 'public':
    case 'government':
      return 12;
    default:
      return 8;
  }
}

/**
 * Parse a CSS-style color from OSM tags
 */
function parseColor(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  // Already a hex color
  if (v.startsWith('#')) return v;
  // Named colors used in OSM
  const named: Record<string, string> = {
    white: '#ffffff', grey: '#999999', gray: '#999999',
    red: '#b04040', brown: '#8b6a4a', tan: '#d2b48c',
    beige: '#f5f0dc', yellow: '#e8d44d', cream: '#fffdd0',
    brick: '#b35a38', sandstone: '#d4c4a0', limestone: '#d9d0b8',
    black: '#333333', blue: '#5577aa', green: '#558855',
    orange: '#cc7733',
  };
  return named[v] || undefined;
}

/**
 * Remove buildings that are contained within larger buildings (OSM data artifacts).
 * Uses two checks:
 * 1. Centroid-in-polygon for simple containment
 * 2. Convex hull check for complex concave buildings (where smaller buildings sit in indentations)
 */
function removeContainedBuildings(buildings: Building[]): Building[] {
  const enriched = buildings.map((b) => {
    const coords = [...b.footprint];
    if (
      coords.length > 0 &&
      (coords[0][0] !== coords[coords.length - 1][0] ||
        coords[0][1] !== coords[coords.length - 1][1])
    ) {
      coords.push(coords[0]);
    }
    const poly = turf.polygon([coords]);
    const area = turf.area(poly);
    const bbox = turf.bbox(poly);
    const centroid = turf.centroid(poly);
    return { building: b, poly, area, bbox, centroid };
  });

  // Sort by area descending (largest first)
  enriched.sort((a, b) => b.area - a.area);

  // Precompute convex hulls for large complex buildings (many vertices = likely concave)
  const hulls = new Map<string, ReturnType<typeof turf.convex>>();
  for (const e of enriched) {
    if (e.building.footprint.length >= 20) {
      hulls.set(e.building.id, turf.convex(turf.explode(e.poly)));
    }
  }

  const removed = new Set<string>();

  for (let i = 0; i < enriched.length; i++) {
    if (removed.has(enriched[i].building.id)) continue;

    const larger = enriched[i];
    const largerHull = hulls.get(larger.building.id);

    for (let j = i + 1; j < enriched.length; j++) {
      if (removed.has(enriched[j].building.id)) continue;

      const smaller = enriched[j];

      // Quick bbox overlap check
      if (
        smaller.bbox[2] < larger.bbox[0] ||
        smaller.bbox[0] > larger.bbox[2] ||
        smaller.bbox[3] < larger.bbox[1] ||
        smaller.bbox[1] > larger.bbox[3]
      ) {
        continue;
      }

      // Check 1: centroid directly inside the polygon
      if (turf.booleanPointInPolygon(smaller.centroid, larger.poly)) {
        removed.add(smaller.building.id);
        continue;
      }

      // Check 2: for complex concave buildings, check if the smaller building
      // sits inside the convex hull (i.e., in an indentation of the larger building)
      if (largerHull && turf.booleanPointInPolygon(smaller.centroid, largerHull)) {
        // Verify: majority of smaller building's vertices should be inside the hull
        let insideCount = 0;
        for (const pt of smaller.building.footprint) {
          if (turf.booleanPointInPolygon(turf.point(pt), largerHull)) {
            insideCount++;
          }
        }
        if (insideCount / smaller.building.footprint.length >= 0.5) {
          removed.add(smaller.building.id);
        }
      }
    }
  }

  const result = buildings.filter((b) => !removed.has(b.id));
  console.log(`  Removed ${removed.size} contained/duplicate buildings`);
  return result;
}

function parseBuildingsFromOSM(osmData: any): Building[] {
  const osmNodes = new Map<number, [number, number]>();
  const buildings: Building[] = [];

  // First pass: collect all nodes with coordinates
  osmData.elements.forEach((element: any) => {
    if (element.type === 'node') {
      osmNodes.set(element.id, [element.lon, element.lat]);
    }
  });

  // Second pass: process building ways
  osmData.elements.forEach((element: any) => {
    if (element.type === 'way' && element.tags?.building) {
      const tags = element.tags;

      // Build footprint polygon from node references
      const footprint: [number, number][] = [];
      for (const nodeId of element.nodes) {
        const coords = osmNodes.get(nodeId);
        if (coords) {
          footprint.push(coords);
        }
      }

      // Skip if footprint is invalid
      if (footprint.length < 3) return;

      const type = tags.building !== 'yes' ? tags.building : undefined;
      const levels = tags['building:levels'] ? parseInt(tags['building:levels']) : undefined;

      // Calculate wall height
      let height = parseHeight(tags.height);
      if (height === null && levels && levels > 0) {
        height = levels * 3.5;
      }
      if (height === null) {
        height = defaultHeightForType(type);
      }

      // Determine roof shape: explicit tag > inference from type
      let roofShape: RoofShape;
      const explicitRoof = tags['roof:shape'] as RoofShape | undefined;
      if (explicitRoof && ['flat', 'gabled', 'hipped', 'pyramidal', 'dome', 'skillion'].includes(explicitRoof)) {
        roofShape = explicitRoof;
      } else {
        roofShape = inferRoofShape(type);
      }

      // Roof height: explicit tag > inference
      let roofHeight = parseHeight(tags['roof:height']);
      if (roofHeight === null) {
        roofHeight = inferRoofHeight(roofShape, height, type);
      }

      // Colors
      const color = parseColor(tags['building:colour'] || tags['building:color']);
      const roofColor = parseColor(tags['roof:colour'] || tags['roof:color']);
      const material = tags['building:material'] as string | undefined;

      const building: Building = {
        id: `building-${element.id}`,
        footprint,
        height,
        type,
        roofShape,
        roofHeight,
        color,
        roofColor,
        material,
        levels: levels && levels > 0 ? levels : undefined,
      };

      buildings.push(building);
    }
  });

  return buildings;
}

// ==================== TRAFFIC SIGNALS ====================

interface TrafficSignal {
  lat: number;
  lon: number;
  type: string;
  id: number;
}

function parseTrafficSignals(osmData: any): TrafficSignal[] {
  return osmData.elements.map((el: any) => ({
    lat: el.lat,
    lon: el.lon,
    type: el.tags.highway,
    id: el.id,
  }));
}

// ==================== ROADS ====================

interface RoadNode {
  id: string;
  position: [number, number];
  type: 'intersection' | 'spawn' | 'destination' | 'parking';
  connectedEdges: string[];
}

interface RoadEdge {
  id: string;
  from: string;
  to: string;
  geometry: [number, number][];
  length: number;
  speedLimit: number;
  lanes: number;
  oneway: boolean;
  name?: string;
}

interface RoadNetworkData {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

function getSpeedLimit(tags: any): number {
  if (tags.maxspeed) {
    const speedStr = tags.maxspeed.toString();
    const speedMatch = speedStr.match(/[\d]+/);
    if (speedMatch) {
      const speed = parseInt(speedMatch[0]);
      if (!isNaN(speed) && speed > 0) {
        return speed;
      }
    }
  }

  // Default speeds by road type
  const defaults: Record<string, number> = {
    primary: 60,
    secondary: 50,
    tertiary: 40,
    residential: 30,
    unclassified: 40,
  };

  return defaults[tags.highway] || 40;
}

function buildGraphFromOSM(osmData: any): RoadNetworkData {
  const nodes = new Map<string, RoadNode>();
  const edges = new Map<string, RoadEdge>();
  const osmNodes = new Map<number, [number, number]>();
  const ways: any[] = [];

  // First pass: collect all nodes with coordinates
  osmData.elements.forEach((element: any) => {
    if (element.type === 'node') {
      osmNodes.set(element.id, [element.lon, element.lat]);
    } else if (element.type === 'way') {
      ways.push(element);
    }
  });

  // Second pass: build edges from ways
  ways.forEach((way) => {
    const wayNodes = way.nodes;
    const tags = way.tags || {};

    // Get road properties
    const speedLimit = getSpeedLimit(tags);
    const lanes = parseInt(tags.lanes) || 1;
    const oneway = tags.oneway === 'yes';

    // Build edge geometry
    const geometry: [number, number][] = [];
    for (const nodeId of wayNodes) {
      const coords = osmNodes.get(nodeId);
      if (coords) {
        geometry.push(coords);
      }
    }

    if (geometry.length < 2) return;

    // Create edge
    const edgeId = `way-${way.id}`;
    const fromNodeId = `node-${wayNodes[0]}`;
    const toNodeId = `node-${wayNodes[wayNodes.length - 1]}`;

    // Calculate length
    const line = turf.lineString(geometry);
    const length = turf.length(line, { units: 'meters' });

    const edge: RoadEdge = {
      id: edgeId,
      from: fromNodeId,
      to: toNodeId,
      geometry,
      length,
      speedLimit,
      lanes,
      oneway,
      name: tags.name,
    };

    edges.set(edgeId, edge);

    // Create or update nodes
    const ensureNode = (
      nodeId: string,
      position: [number, number],
      edgeId: string
    ) => {
      if (!nodes.has(nodeId)) {
        nodes.set(nodeId, {
          id: nodeId,
          position,
          type: 'intersection',
          connectedEdges: [],
        });
      }
      const node = nodes.get(nodeId)!;
      if (!node.connectedEdges.includes(edgeId)) {
        node.connectedEdges.push(edgeId);
      }
    };

    ensureNode(fromNodeId, geometry[0], edgeId);
    ensureNode(toNodeId, geometry[geometry.length - 1], edgeId);

    // If two-way, create reverse edge
    if (!oneway) {
      const reverseEdgeId = `${edgeId}-reverse`;
      const reverseEdge: RoadEdge = {
        id: reverseEdgeId,
        from: toNodeId,
        to: fromNodeId,
        geometry: [...geometry].reverse(),
        length,
        speedLimit,
        lanes,
        oneway: false,
        name: tags.name,
      };
      edges.set(reverseEdgeId, reverseEdge);
      ensureNode(toNodeId, geometry[geometry.length - 1], reverseEdgeId);
      ensureNode(fromNodeId, geometry[0], reverseEdgeId);
    }
  });

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
  };
}

// ==================== MAIN ====================

async function main() {
  console.log('🔄 Processing map data...\n');

  // Process buildings
  console.log('📦 Processing buildings...');
  const buildingsRaw = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'buildings-raw.json'), 'utf-8')
  );
  let buildings = parseBuildingsFromOSM(buildingsRaw);
  buildings = removeContainedBuildings(buildings);
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'buildings.json'),
    JSON.stringify(buildings, null, 2)
  );
  console.log(`✅ Processed ${buildings.length} buildings\n`);

  // Process traffic signals
  console.log('🚦 Processing traffic signals...');
  const trafficSignalsRaw = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'traffic-signals-raw.json'), 'utf-8')
  );
  const trafficSignals = parseTrafficSignals(trafficSignalsRaw);
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'traffic-signals.json'),
    JSON.stringify(trafficSignals, null, 2)
  );
  console.log(`✅ Processed ${trafficSignals.length} traffic signals\n`);

  // Process roads
  console.log('🛣️  Processing roads...');
  const roadsRaw = JSON.parse(
    fs.readFileSync(path.join(PUBLIC_DIR, 'roads-raw.json'), 'utf-8')
  );
  const roads = buildGraphFromOSM(roadsRaw);
  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'roads.json'),
    JSON.stringify(roads, null, 2)
  );
  console.log(`✅ Processed ${roads.nodes.length} nodes and ${roads.edges.length} edges\n`);

  console.log('🎉 All map data processed successfully!');
}

main().catch(console.error);
