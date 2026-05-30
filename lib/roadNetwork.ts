/**
 * Road Network Graph for Autonomous Traffic Simulation
 * Builds a navigable graph from OpenStreetMap data
 */

import * as turf from "@turf/turf";

export interface RoadNode {
  id: string;
  position: [number, number]; // [lon, lat]
  type: "intersection" | "spawn" | "destination" | "parking";
  connectedEdges: string[]; // Edge IDs
}

export interface RoadEdge {
  id: string;
  from: string; // Node ID
  to: string; // Node ID
  geometry: [number, number][]; // Path coordinates
  length: number; // meters
  speedLimit: number; // km/h
  lanes: number;
  oneway: boolean;
  name?: string;
}

export interface Destination {
  id: string;
  name: string;
  position: [number, number];
  type: "building" | "parking_lot" | "exit";
  capacity?: number; // For parking
  weight: number; // Probability weight for selection
}

export class RoadNetwork {
  private nodes: Map<string, RoadNode> = new Map();
  private edges: Map<string, RoadEdge> = new Map();
  private destinations: Map<string, Destination> = new Map();

  constructor() {}

  /**
   * Fetch road network from cached Next.js API route
   */
  async fetchFromOSM(bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  }): Promise<void> {
    console.log("Fetching road network from cached API...");

    try {
      const response = await fetch(
        `/api/map/roads?south=${bounds.south}&west=${bounds.west}&north=${bounds.north}&east=${bounds.east}`,
        {
          cache: 'force-cache', // Use browser cache
          next: { revalidate: 86400 }, // Revalidate every 24 hours
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const roadNetworkData = await response.json();

      // Populate internal maps from API response
      this.nodes.clear();
      this.edges.clear();

      if (roadNetworkData.nodes) {
        roadNetworkData.nodes.forEach((node: RoadNode) => {
          this.nodes.set(node.id, node);
        });
      }

      if (roadNetworkData.edges) {
        roadNetworkData.edges.forEach((edge: RoadEdge) => {
          this.edges.set(edge.id, edge);
        });
      }

      // Mark nodes with 3+ connections as intersections
      this.nodes.forEach((node) => {
        if (node.connectedEdges.length >= 3) {
          node.type = "intersection";
        }
      });

      console.log(
        `✅ Loaded road network from cache: ${this.nodes.size} nodes, ${this.edges.size} edges`,
      );
    } catch (error) {
      console.error("Error fetching road network:", error);
      throw error;
    }
  }

  /**
   * Build graph from OSM data
   */
  private buildGraphFromOSM(osmData: any): void {
    const osmNodes = new Map<number, [number, number]>();
    const ways: any[] = [];

    // First pass: collect all nodes with coordinates
    osmData.elements.forEach((element: any) => {
      if (element.type === "node") {
        osmNodes.set(element.id, [element.lon, element.lat]);
      } else if (element.type === "way") {
        ways.push(element);
      }
    });

    // Second pass: build edges from ways
    ways.forEach((way) => {
      const nodes = way.nodes;
      const tags = way.tags || {};

      // Get road properties
      const speedLimit = this.getSpeedLimit(tags);
      const lanes = parseInt(tags.lanes) || 1;
      const oneway = tags.oneway === "yes";

      // Build edge geometry
      const geometry: [number, number][] = [];
      for (const nodeId of nodes) {
        const coords = osmNodes.get(nodeId);
        if (coords) {
          geometry.push(coords);
        }
      }

      if (geometry.length < 2) return;

      // Create edge
      const edgeId = `way-${way.id}`;
      const fromNodeId = `node-${nodes[0]}`;
      const toNodeId = `node-${nodes[nodes.length - 1]}`;

      // Calculate length
      const line = turf.lineString(geometry);
      const length = turf.length(line, { units: "meters" });

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

      this.edges.set(edgeId, edge);

      // Create or update nodes
      this.ensureNode(fromNodeId, geometry[0], edgeId);
      this.ensureNode(toNodeId, geometry[geometry.length - 1], edgeId);

      // If two-way, create reverse edge
      if (!oneway) {
        const reverseEdgeId = `way-${way.id}-reverse`;
        const reverseEdge: RoadEdge = {
          ...edge,
          id: reverseEdgeId,
          from: toNodeId,
          to: fromNodeId,
          geometry: [...geometry].reverse(),
        };
        this.edges.set(reverseEdgeId, reverseEdge);
        this.ensureNode(toNodeId, geometry[geometry.length - 1], reverseEdgeId);
        this.ensureNode(fromNodeId, geometry[0], reverseEdgeId);
      }
    });

    // Mark nodes with 3+ connections as intersections
    this.nodes.forEach((node) => {
      if (node.connectedEdges.length >= 3) {
        node.type = "intersection";
      }
    });
  }

  /**
   * Ensure node exists, create if needed
   */
  private ensureNode(
    nodeId: string,
    position: [number, number],
    edgeId: string,
  ): void {
    if (!this.nodes.has(nodeId)) {
      this.nodes.set(nodeId, {
        id: nodeId,
        position,
        type: "intersection",
        connectedEdges: [edgeId],
      });
    } else {
      const node = this.nodes.get(nodeId)!;
      if (!node.connectedEdges.includes(edgeId)) {
        node.connectedEdges.push(edgeId);
      }
    }
  }

  /**
   * Get speed limit from OSM tags
   */
  private getSpeedLimit(tags: any): number {
    if (tags.maxspeed) {
      return parseInt(tags.maxspeed);
    }

    // Default speed limits by road type
    const roadType = tags.highway;
    switch (roadType) {
      case "primary":
        return 60;
      case "secondary":
        return 50;
      case "tertiary":
        return 40;
      case "residential":
        return 30;
      default:
        return 40;
    }
  }

  /**
   * Add destinations (parking lots, buildings, etc.)
   */
  addDestination(destination: Destination): void {
    this.destinations.set(destination.id, destination);
  }

  /**
   * Add predefined Queen's University destinations
   */
  addQueensDestinations(): void {
    const destinations: Destination[] = [
      {
        id: "stauffer-library",
        name: "Stauffer Library",
        position: [-76.495, 44.2285],
        type: "building",
        weight: 3,
      },
      {
        id: "arc",
        name: "Athletics & Recreation Centre",
        position: [-76.497, 44.2255],
        type: "building",
        weight: 2,
      },
      {
        id: "main-parking",
        name: "Main Campus Parking",
        position: [-76.492, 44.23],
        type: "parking_lot",
        capacity: 100,
        weight: 4,
      },
      {
        id: "union-street-exit",
        name: "Union Street Exit",
        position: [-76.485, 44.232],
        type: "exit",
        weight: 2,
      },
    ];

    destinations.forEach((dest) => this.addDestination(dest));
  }

  /**
   * Get all nodes
   */
  getNodes(): RoadNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getEdges(): RoadEdge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get node by ID
   */
  getNode(id: string): RoadNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get edge by ID
   */
  getEdge(id: string): RoadEdge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get edges connected to a node
   */
  getNodeEdges(nodeId: string): RoadEdge[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    return node.connectedEdges
      .map((edgeId) => this.edges.get(edgeId))
      .filter((edge): edge is RoadEdge => edge !== undefined);
  }

  /**
   * Find actual road intersections (nodes where 3+ roads meet)
   */
  findIntersections(): RoadNode[] {
    const intersections: RoadNode[] = [];

    this.nodes.forEach((node) => {
      const edges = this.getNodeEdges(node.id);
      // Intersection = 3 or more roads meeting
      if (edges.length >= 3) {
        intersections.push(node);
      }
    });

    return intersections;
  }

  /**
   * Get the bearing (direction) of an edge at a specific node
   */
  getEdgeBearingAtNode(edge: RoadEdge, nodeId: string): number {
    const isStart = edge.from === nodeId;
    const coords = edge.geometry;

    if (coords.length < 2) return 0;

    // Get the first two points to calculate direction
    const [from, to] = isStart
      ? [coords[0], coords[1]]
      : [coords[coords.length - 1], coords[coords.length - 2]];

    return turf.bearing(turf.point(from), turf.point(to));
  }

  /**
   * Find nearest node to a position
   */
  findNearestNode(position: [number, number]): RoadNode | null {
    let nearest: RoadNode | null = null;
    let minDistance = Infinity;

    this.nodes.forEach((node) => {
      const distance = turf.distance(
        turf.point(position),
        turf.point(node.position),
        {
          units: "meters",
        },
      );

      if (distance < minDistance) {
        minDistance = distance;
        nearest = node;
      }
    });

    return nearest;
  }

  /**
   * Get random destination (weighted)
   */
  getRandomDestination(): Destination | null {
    const destinations = Array.from(this.destinations.values());
    if (destinations.length === 0) return null;

    const totalWeight = destinations.reduce((sum, d) => sum + d.weight, 0);
    let random = Math.random() * totalWeight;

    for (const dest of destinations) {
      random -= dest.weight;
      if (random <= 0) {
        return dest;
      }
    }

    return destinations[0];
  }

  /**
   * Get all destinations
   */
  getDestinations(): Destination[] {
    return Array.from(this.destinations.values());
  }

  /**
   * Get intersection node by ID
   * Returns intersection nodes (nodes with 3+ connected edges)
   */
  getIntersectionById(id: string): RoadNode | undefined {
    const node = this.nodes.get(id);
    if (node && node.type === "intersection") {
      return node;
    }
    return undefined;
  }

  /**
   * Get all intersection nodes
   */
  getIntersections(): RoadNode[] {
    return Array.from(this.nodes.values()).filter(
      (node) => node.type === "intersection"
    );
  }

  /**
   * Find edges within radius (meters) of a position. Used for building-vicinity
   * spawn points and for blocking the "forward" lane near placed buildings.
   * Returns edges sorted by distance (nearest first).
   */
  findEdgesNearPosition(
    position: [number, number],
    radiusMeters: number
  ): RoadEdge[] {
    const point = turf.point(position);
    const withDistance: { edge: RoadEdge; distance: number }[] = [];

    this.edges.forEach((edge) => {
      if (!edge.geometry || edge.geometry.length < 2) return;
      const line = turf.lineString(edge.geometry);
      const distance = turf.pointToLineDistance(point, line, {
        units: "meters",
      });
      if (distance <= radiusMeters) {
        withDistance.push({ edge, distance });
      }
    });

    withDistance.sort((a, b) => a.distance - b.distance);
    return withDistance.map((x) => x.edge);
  }

  /**
   * Get distance in meters from the start of an edge to the nearest point on
   * that edge to the given position. Used for placing cars at specific points
   * along the road (e.g. burst spawn).
   */
  getDistanceAlongEdge(
    edgeId: string,
    position: [number, number],
  ): number {
    const edge = this.edges.get(edgeId);
    if (!edge?.geometry || edge.geometry.length < 2) return 0;
    const line = turf.lineString(edge.geometry);
    const point = turf.point(position);
    const nearest = turf.nearestPointOnLine(line, point, { units: "meters" });
    const loc = (nearest.properties?.location ?? 0) as number;
    const meters =
      loc <= 1 && loc >= 0 ? loc * edge.length : Math.min(loc, edge.length);
    return Math.max(0, Math.min(meters, edge.length - 0.1));
  }

  /**
   * Sample positions along an edge, spaced by minSpacingMeters (for burst spawn).
   * Returns [{ position, distanceOnEdge }].
   */
  samplePointsAlongEdge(
    edgeId: string,
    minSpacingMeters: number,
  ): { position: [number, number]; distanceOnEdge: number }[] {
    const edge = this.edges.get(edgeId);
    if (!edge?.geometry || edge.geometry.length < 2) return [];
    const line = turf.lineString(edge.geometry);
    const out: { position: [number, number]; distanceOnEdge: number }[] = [];
    let d = 0;
    while (d < edge.length - 1) {
      const along = turf.along(line, d / 1000, { units: "kilometers" });
      const pos = along.geometry.coordinates as [number, number];
      out.push({ position: pos, distanceOnEdge: d });
      d += minSpacingMeters;
    }
    return out;
  }
}
