import { NextResponse } from 'next/server';
import trafficSignalsData from '@/public/map-data/traffic-signals.json';

interface TrafficSignal {
  lat: number;
  lon: number;
  type: string;
  id: number;
}

/**
 * Serve pre-processed traffic signals data from static JSON file
 * Data was downloaded from OpenStreetMap and processed offline
 * See scripts/process-map-data.ts for processing logic
 */
export async function GET() {
  try {
    // Serve pre-processed static data
    const signals = trafficSignalsData as TrafficSignal[];

    return NextResponse.json(signals, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache forever since it's static
      },
    });
  } catch (error) {
    console.error('Error serving traffic signals:', error);
    return NextResponse.json(
      { error: 'Failed to serve traffic signals' },
      { status: 500 }
    );
  }
}
