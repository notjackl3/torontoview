/**
 * A* Pathfinding for Road Network
 * Cars use this to find optimal routes to destinations
 */

import * as turf from '@turf/turf';
import { RoadNetwork, RoadNode, RoadEdge } from './roadNetwork';

interface PathNode {
  nodeId: string;
  gCost: number; // Cost from start
  hCost: number; // Heuristic cost to goal
  fCost: number; // Total cost (g + h)
  parent: string | null;
}

export interface Route {
  nodes: string[]; // Node IDs in order
  edges: string[]; // Edge IDs in order
  totalDistance: number; // meters
  estimatedTime: number; // seconds
  waypoints: [number, number][]; // Full path coordinates
}

export class Pathfinder {
  constructor(private network: RoadNetwork) {}

  /**
   * Find route from start position to destination using A*
   * @param options.blockedEdgeIds - Edge IDs to avoid (e.g. lane/road blocks near construction)
   */
  findRoute(
    startPos: [number, number],
    endPos: [number, number],
    options?: { blockedEdgeIds?: Set<string> }
  ): Route | null {
    // Find nearest nodes
    const startNode = this.network.findNearestNode(startPos);
    const endNode = this.network.findNearestNode(endPos);

    if (!startNode || !endNode) {
      console.error('Could not find start or end node');
      return null;
    }

    if (startNode.id === endNode.id) {
      return this.createDirectRoute(startPos, endPos);
    }

    return this.astar(startNode.id, endNode.id, options?.blockedEdgeIds);
  }

  /**
   * A* pathfinding algorithm
   * Skips edges in blockedEdgeIds (e.g. construction lane blocks)
   */
  private astar(
    startId: string,
    goalId: string,
    blockedEdgeIds?: Set<string>
  ): Route | null {
    const openSet = new Set<string>([startId]);
    const closedSet = new Set<string>();
    const nodes = new Map<string, PathNode>();

    const startNode = this.network.getNode(startId);
    const goalNode = this.network.getNode(goalId);

    if (!startNode || !goalNode) return null;

    // Initialize start node
    nodes.set(startId, {
      nodeId: startId,
      gCost: 0,
      hCost: this.heuristic(startNode.position, goalNode.position),
      fCost: 0,
      parent: null,
    });
    nodes.get(startId)!.fCost = nodes.get(startId)!.hCost;

    while (openSet.size > 0) {
      // Find node with lowest fCost
      let current: string | null = null;
      let lowestF = Infinity;

      openSet.forEach((nodeId) => {
        const node = nodes.get(nodeId);
        if (node && node.fCost < lowestF) {
          lowestF = node.fCost;
          current = nodeId;
        }
      });

      if (!current) break;

      // Reached goal
      if (current === goalId) {
        return this.reconstructPath(nodes, current);
      }

      openSet.delete(current);
      closedSet.add(current);

      // Check neighbors
      const currentNode = this.network.getNode(current);
      if (!currentNode) continue;

      const edges = this.network.getNodeEdges(current);

      edges.forEach((edge) => {
        if (blockedEdgeIds?.has(edge.id)) return;

        const neighborId = edge.to;

        if (closedSet.has(neighborId)) return;

        const neighbor = this.network.getNode(neighborId);
        if (!neighbor) return;

        const tentativeG = (nodes.get(current!)?.gCost || 0) + edge.length;

        if (!openSet.has(neighborId)) {
          openSet.add(neighborId);
        } else if (tentativeG >= (nodes.get(neighborId)?.gCost || Infinity)) {
          return; // Not a better path
        }

        // This is the best path so far
        const hCost = this.heuristic(neighbor.position, goalNode.position);
        nodes.set(neighborId, {
          nodeId: neighborId,
          gCost: tentativeG,
          hCost,
          fCost: tentativeG + hCost,
          parent: current,
        });
      });
    }

    console.warn('No path found');
    return null;
  }

  /**
   * Heuristic: straight-line distance
   */
  private heuristic(from: [number, number], to: [number, number]): number {
    return turf.distance(turf.point(from), turf.point(to), { units: 'meters' });
  }

  /**
   * Reconstruct path from A* result
   */
  private reconstructPath(
    nodes: Map<string, PathNode>,
    goalId: string
  ): Route {
    const path: string[] = [];
    let current: string | null = goalId;

    // Build node path backwards
    while (current) {
      path.unshift(current);
      current = nodes.get(current)?.parent || null;
    }

    // Build edge path and collect waypoints
    const edges: string[] = [];
    const waypoints: [number, number][] = [];
    let totalDistance = 0;
    let estimatedTime = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const fromNode = this.network.getNode(path[i]);
      const toNode = this.network.getNode(path[i + 1]);

      if (!fromNode || !toNode) continue;

      // Find edge connecting these nodes
      const nodeEdges = this.network.getNodeEdges(fromNode.id);
      const edge = nodeEdges.find((e) => e.to === toNode.id);

      if (edge) {
        edges.push(edge.id);
        waypoints.push(...edge.geometry);
        totalDistance += edge.length;
        estimatedTime += (edge.length / 1000) / (edge.speedLimit / 3600); // Convert to seconds
      }
    }

    return {
      nodes: path,
      edges,
      totalDistance,
      estimatedTime,
      waypoints,
    };
  }

  /**
   * Create direct route (for same-node case)
   */
  private createDirectRoute(
    start: [number, number],
    end: [number, number]
  ): Route {
    return {
      nodes: [],
      edges: [],
      totalDistance: turf.distance(turf.point(start), turf.point(end), {
        units: 'meters',
      }),
      estimatedTime: 0,
      waypoints: [start, end],
    };
  }

  /**
   * Get next edge at intersection based on route
   */
  getNextEdge(currentEdgeId: string, route: Route): string | null {
    const currentIndex = route.edges.indexOf(currentEdgeId);

    if (currentIndex === -1 || currentIndex === route.edges.length - 1) {
      return null; // Route complete or edge not in route
    }

    return route.edges[currentIndex + 1];
  }

  /**
   * Get upcoming turn angle for turn signal detection
   * Returns bearing change in degrees (positive = right, negative = left)
   * Returns 0 if no turn ahead or route complete
   */
  getUpcomingTurn(route: Route, currentEdge: string): number {
    const currentIndex = route.edges.indexOf(currentEdge);

    if (currentIndex === -1 || currentIndex >= route.edges.length - 1) {
      return 0; // No turn ahead
    }

    const currentEdgeData = this.network.getEdge(currentEdge);
    const nextEdgeData = this.network.getEdge(route.edges[currentIndex + 1]);

    if (!currentEdgeData || !nextEdgeData) {
      return 0;
    }

    // Get bearing of current edge (last segment)
    const currentGeom = currentEdgeData.geometry;
    if (currentGeom.length < 2) return 0;

    const currentBearing = turf.bearing(
      turf.point(currentGeom[currentGeom.length - 2]),
      turf.point(currentGeom[currentGeom.length - 1])
    );

    // Get bearing of next edge (first segment)
    const nextGeom = nextEdgeData.geometry;
    if (nextGeom.length < 2) return 0;

    const nextBearing = turf.bearing(
      turf.point(nextGeom[0]),
      turf.point(nextGeom[1])
    );

    // Calculate bearing change
    let bearingChange = nextBearing - currentBearing;

    // Normalize to -180 to 180
    while (bearingChange > 180) bearingChange -= 360;
    while (bearingChange < -180) bearingChange += 360;

    return bearingChange;
  }
}
