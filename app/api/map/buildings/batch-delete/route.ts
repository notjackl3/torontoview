import { NextResponse } from 'next/server';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface Building {
  id: string;
  footprint: [number, number][];
  height: number;
  type?: string;
}

/**
 * Batch DELETE buildings from the buildings.json file
 */
export async function POST(request: Request) {
  try {
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: 'No building IDs provided' },
        { status: 400 }
      );
    }

    const filePath = join(process.cwd(), 'public', 'map-data', 'buildings.json');

    // Read current buildings
    const fileContent = readFileSync(filePath, 'utf-8');
    const buildings = JSON.parse(fileContent) as Building[];

    // Create a set of IDs to delete for O(1) lookup
    const idsToDelete = new Set(ids);

    // Filter out the buildings to delete
    const remainingBuildings = buildings.filter(b => !idsToDelete.has(b.id));
    const deletedCount = buildings.length - remainingBuildings.length;

    // Write back to file
    writeFileSync(filePath, JSON.stringify(remainingBuildings, null, 2));

    console.log(`✅ Batch deleted ${deletedCount} buildings from buildings.json`);

    return NextResponse.json({
      success: true,
      deletedCount,
      remainingCount: remainingBuildings.length,
    });
  } catch (error) {
    console.error('Error batch deleting buildings:', error);
    return NextResponse.json(
      { error: 'Failed to batch delete buildings' },
      { status: 500 }
    );
  }
}
