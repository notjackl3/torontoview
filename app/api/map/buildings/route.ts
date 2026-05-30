import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

interface Building {
  id: string;
  footprint: [number, number][];
  height: number;
  type?: string;
}

/**
 * Serve pre-processed buildings data from static JSON file
 * Data was downloaded from OpenStreetMap and processed offline
 * See scripts/process-map-data.ts for processing logic
 */
export async function GET() {
  try {
    // Read the file dynamically so changes take effect without restart
    const filePath = join(process.cwd(), 'public', 'map-data', 'buildings.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const buildings = JSON.parse(fileContent) as Building[];

    // In development, use short cache. In production, cache longer.
    const isDev = process.env.NODE_ENV === 'development';
    const cacheControl = isDev
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=3600, stale-while-revalidate=86400';

    return NextResponse.json(buildings, {
      headers: {
        'Cache-Control': cacheControl,
      },
    });
  } catch (error) {
    console.error('Error serving buildings:', error);
    return NextResponse.json(
      { error: 'Failed to serve buildings' },
      { status: 500 }
    );
  }
}
