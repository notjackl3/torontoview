import { NextRequest, NextResponse } from "next/server";

interface EdgeInput {
  id: string;
  geometry: [number, number][];
}

interface CongestionResult {
  level: "low" | "moderate" | "heavy" | "severe";
  speed?: number;
}

// In-memory cache with 5-minute TTL
let cachedResult: Record<string, CongestionResult> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * POST /api/map/traffic
 * Proxies to Mapbox Map Matching API to get real-time congestion data.
 * Accepts: { edges: Array<{ id, geometry }> }
 * Returns: { congestion: Record<edgeId, { level, speed? }> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const edges: EdgeInput[] = body.edges;

    if (!edges || !Array.isArray(edges) || edges.length === 0) {
      return NextResponse.json(
        { error: "Missing or empty edges array" },
        { status: 400 },
      );
    }

    // Check cache
    if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return NextResponse.json({ congestion: cachedResult, cached: true });
    }

    const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!MAPBOX_TOKEN) {
      // No Mapbox token available — return synthetic congestion based on road properties
      const syntheticCongestion = generateSyntheticCongestion(edges);
      return NextResponse.json({
        congestion: syntheticCongestion,
        synthetic: true,
      });
    }

    // Batch edges into groups of ~100 coordinates for Map Matching API
    const congestion: Record<string, CongestionResult> = {};
    const BATCH_SIZE = 50; // edges per batch (Map Matching supports up to 100 coords)

    for (let i = 0; i < edges.length; i += BATCH_SIZE) {
      const batch = edges.slice(i, i + BATCH_SIZE);
      const batchResult = await fetchMapboxBatch(batch, MAPBOX_TOKEN);
      Object.assign(congestion, batchResult);
    }

    // Cache the result
    cachedResult = congestion;
    cacheTimestamp = Date.now();

    return NextResponse.json({ congestion });
  } catch (error) {
    console.error("Traffic API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch traffic data" },
      { status: 500 },
    );
  }
}

/**
 * Fetch congestion data from Mapbox Map Matching API for a batch of edges.
 */
async function fetchMapboxBatch(
  edges: EdgeInput[],
  token: string,
): Promise<Record<string, CongestionResult>> {
  const result: Record<string, CongestionResult> = {};

  // Build coordinates string from edge geometries
  // Use midpoints of each edge to keep coordinate count manageable
  const coordPairs: { edgeId: string; coord: [number, number] }[] = [];
  for (const edge of edges) {
    if (edge.geometry.length >= 2) {
      // Use first and last points of the geometry
      coordPairs.push({ edgeId: edge.id, coord: edge.geometry[0] });
      coordPairs.push({
        edgeId: edge.id,
        coord: edge.geometry[edge.geometry.length - 1],
      });
    }
  }

  // Limit to 100 coordinates (Mapbox limit)
  const limitedPairs = coordPairs.slice(0, 100);
  if (limitedPairs.length < 2) return result;

  const coordsStr = limitedPairs
    .map((p) => `${p.coord[0]},${p.coord[1]}`)
    .join(";");

  try {
    const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coordsStr}?annotations=congestion,speed&geometries=geojson&access_token=${token}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Fallback to Directions API
      return await fetchMapboxDirectionsFallback(edges, token);
    }

    const data = await response.json();

    if (data.matchings && data.matchings.length > 0) {
      const matching = data.matchings[0];
      const legs = matching.legs || [];

      // Map congestion annotations back to edges
      let pairIdx = 0;
      for (const leg of legs) {
        const congestionLevels: string[] = leg.annotation?.congestion || [];
        if (congestionLevels.length > 0 && pairIdx < limitedPairs.length) {
          const edgeId = limitedPairs[pairIdx].edgeId;
          // Use the most common congestion level for this edge
          const level = mapCongestionLevel(congestionLevels[0]);
          const speeds: number[] = leg.annotation?.speed || [];
          result[edgeId] = {
            level,
            speed: speeds.length > 0 ? speeds[0] : undefined,
          };
        }
        pairIdx += 2; // Each edge contributes 2 points
      }
    }
  } catch (error) {
    console.warn("Mapbox Map Matching failed, trying Directions:", error);
    return await fetchMapboxDirectionsFallback(edges, token);
  }

  return result;
}

/**
 * Fallback: use Mapbox Directions API if Map Matching fails.
 */
async function fetchMapboxDirectionsFallback(
  edges: EdgeInput[],
  token: string,
): Promise<Record<string, CongestionResult>> {
  const result: Record<string, CongestionResult> = {};

  // Use a sample of edges to get general area congestion
  const sampleEdges = edges.slice(0, 12);
  const coords = sampleEdges
    .map((e) => {
      const mid = e.geometry[Math.floor(e.geometry.length / 2)];
      return `${mid[0]},${mid[1]}`;
    })
    .join(";");

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?annotations=congestion,speed&geometries=geojson&access_token=${token}`;
    const response = await fetch(url);

    if (!response.ok) return result;

    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const legs = route.legs || [];

      for (let i = 0; i < Math.min(legs.length, sampleEdges.length); i++) {
        const leg = legs[i];
        const congestionLevels: string[] = leg.annotation?.congestion || [];
        if (congestionLevels.length > 0) {
          result[sampleEdges[i].id] = {
            level: mapCongestionLevel(congestionLevels[0]),
            speed: leg.annotation?.speed?.[0],
          };
        }
      }
    }
  } catch {
    // Silently fail — caller handles empty result
  }

  return result;
}

/**
 * Map Mapbox congestion string to our typed level.
 */
function mapCongestionLevel(
  mbLevel: string,
): "low" | "moderate" | "heavy" | "severe" {
  switch (mbLevel) {
    case "low":
      return "low";
    case "moderate":
      return "moderate";
    case "heavy":
      return "heavy";
    case "severe":
      return "severe";
    default:
      return "low"; // "unknown" or empty defaults to low
  }
}

/**
 * Generate synthetic congestion data when no Mapbox token is available.
 * Uses a deterministic hash of edge ID to simulate varying congestion levels.
 */
function generateSyntheticCongestion(
  edges: EdgeInput[],
): Record<string, CongestionResult> {
  const result: Record<string, CongestionResult> = {};
  const levels: Array<"low" | "moderate" | "heavy" | "severe"> = [
    "low",
    "moderate",
    "heavy",
    "severe",
  ];

  for (const edge of edges) {
    // Simple hash from edge ID to generate deterministic but varied congestion
    let hash = 0;
    for (let i = 0; i < edge.id.length; i++) {
      hash = ((hash << 5) - hash + edge.id.charCodeAt(i)) | 0;
    }
    // Weight towards low/moderate congestion (more realistic)
    const idx = Math.abs(hash) % 10;
    const level =
      idx < 5 ? levels[0] : idx < 8 ? levels[1] : idx < 9 ? levels[2] : levels[3];
    result[edge.id] = { level };
  }

  return result;
}
