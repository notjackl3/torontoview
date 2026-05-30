import { NextRequest, NextResponse } from 'next/server';
import { readFile, unlink } from 'fs/promises';
import path from 'path';

// Directory where buildings are saved
const BUILDINGS_DIR = path.join(process.cwd(), 'public', 'map-data', 'buildings');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filename = `${id}.glb`;
    const filePath = path.join(BUILDINGS_DIR, filename);

    // Read the GLB file
    const data = await readFile(filePath);

    // Return the GLB data as binary
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Error retrieving building:', error);
    return NextResponse.json(
      { error: 'Building not found' },
      { status: 404 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const filename = `${id}.glb`;
    const filePath = path.join(BUILDINGS_DIR, filename);

    await unlink(filePath);
    console.log(`🗑️ Deleted building: ${filename}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting building:', error);
    return NextResponse.json(
      { error: 'Building not found' },
      { status: 404 }
    );
  }
}
