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
 * DELETE a building from the buildings.json file
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filePath = join(process.cwd(), 'public', 'map-data', 'buildings.json');

    // Read current buildings
    const fileContent = readFileSync(filePath, 'utf-8');
    const buildings = JSON.parse(fileContent) as Building[];

    // Find the building to delete
    const buildingIndex = buildings.findIndex(b => b.id === id);

    if (buildingIndex === -1) {
      return NextResponse.json(
        { error: 'Building not found' },
        { status: 404 }
      );
    }

    // Remove the building
    const deletedBuilding = buildings.splice(buildingIndex, 1)[0];

    // Write back to file
    writeFileSync(filePath, JSON.stringify(buildings, null, 2));

    console.log(`✅ Deleted building ${id} from buildings.json`);

    return NextResponse.json({
      success: true,
      deletedBuilding: {
        id: deletedBuilding.id,
        type: deletedBuilding.type,
      },
      remainingCount: buildings.length,
    });
  } catch (error) {
    console.error('Error deleting building:', error);
    return NextResponse.json(
      { error: 'Failed to delete building' },
      { status: 500 }
    );
  }
}
