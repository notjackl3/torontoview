/**
 * Building Data for 3D City Visualization
 * Fetches building footprints, heights, roof shapes, and colors from processed OSM data
 */

export type RoofShape = "flat" | "gabled" | "hipped" | "pyramidal" | "dome" | "skillion";

export interface Building {
  id: string;
  footprint: [number, number][]; // Polygon coordinates [lon, lat]
  height: number; // Wall height in meters (up to where roof starts)
  type?: string; // building type (residential, commercial, etc.)
  roofShape: RoofShape;
  roofHeight: number; // meters
  color?: string; // CSS hex color for walls
  roofColor?: string; // CSS hex color for roof
  material?: string; // building:material (brick, stone, glass, etc.)
  levels?: number;
  /**
   * Optional triangle-mesh geometry from Toronto's 3D Massing Multipatch
   * dataset. Present only for buildings that have real 3D surface data
   * (towers with setbacks, the CN Tower's pod, domes, etc.). When present,
   * the renderer uses this mesh instead of prism-extruding `footprint`.
   *
   * `positions` is a flat array of (lng, lat, z_meters) triplets, with each
   * consecutive group of 3 triplets forming one triangle. Vertex order is
   * front-facing (CCW when viewed from outside the building).
   */
  mesh?: {
    positions: number[];
  };
}

/**
 * Fetch buildings from cached Next.js API route
 * @param bbox Bounding box [south, west, north, east]
 * @returns Array of buildings with footprints and heights
 */
export async function fetchBuildings(
  bbox: [number, number, number, number]
): Promise<Building[]> {
  const [south, west, north, east] = bbox;

  console.log("Fetching buildings from cached API...");

  try {
    // Try the API route first, fall back to static file
    let response = await fetch(
      `/api/map/buildings?south=${south}&west=${west}&north=${north}&east=${east}`,
      { cache: 'force-cache' }
    );

    if (!response.ok) {
      console.warn(`API returned ${response.status}, falling back to static file`);
      response = await fetch('/map-data/buildings.json', { cache: 'force-cache' });
    }

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const buildings = await response.json();

    console.log(`✅ Fetched ${buildings.length} buildings (cached)`);
    return buildings;
  } catch (error) {
    console.error("Error fetching buildings:", error);
    throw error;
  }
}
