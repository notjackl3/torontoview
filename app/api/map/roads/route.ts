import { NextResponse } from 'next/server';
import roadsData from '@/public/map-data/roads.json';

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

/**
 * Serve pre-processed roads data from static JSON file
 * Data was downloaded from OpenStreetMap and processed offline
 * See scripts/process-map-data.ts for processing logic
 */
export async function GET() {
  try {
    // Serve pre-processed static data
    const roadNetwork = roadsData as RoadNetworkData;

    return NextResponse.json(roadNetwork, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache forever since it's static
      },
    });
  } catch (error) {
    console.error('Error serving roads:', error);
    return NextResponse.json(
      { error: 'Failed to serve road network' },
      { status: 500 }
    );
  }
}
