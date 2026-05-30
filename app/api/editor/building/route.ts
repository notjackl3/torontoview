import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, unlink, stat } from 'fs/promises';
import path from 'path';

// Directory where buildings are saved
const BUILDINGS_DIR = path.join(process.cwd(), 'public', 'map-data', 'buildings');

// Simple ID generator
function generateId(): string {
  return `bld_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

// Ensure the buildings directory exists
async function ensureBuildingsDir() {
  try {
    await mkdir(BUILDINGS_DIR, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
}

// Clean up old entries (older than 24 hours)
async function cleanupOldEntries() {
  try {
    const files = await readdir(BUILDINGS_DIR);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.endsWith('.glb')) {
        const filePath = path.join(BUILDINGS_DIR, file);
        const stats = await stat(filePath);
        if (stats.mtimeMs < oneDayAgo) {
          await unlink(filePath);
          console.log(`🗑️ Cleaned up old building: ${file}`);
        }
      }
    }
  } catch (error) {
    // Directory might not exist yet
  }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure directory exists
    await ensureBuildingsDir();

    // Clean up old entries periodically
    await cleanupOldEntries();

    const contentType = request.headers.get('content-type') || '';

    let arrayBuffer: ArrayBuffer;
    let name = 'building';

    if (contentType.includes('application/octet-stream')) {
      // Binary GLB data
      arrayBuffer = await request.arrayBuffer();
      name = request.headers.get('x-building-name') || 'building';
    } else {
      return NextResponse.json(
        { error: 'Invalid content type. Expected application/octet-stream' },
        { status: 400 }
      );
    }

    // Generate unique ID
    const id = generateId();
    const filename = `${id}.glb`;
    const filePath = path.join(BUILDINGS_DIR, filename);

    // Save the building data to file
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filePath, buffer);

    console.log(`✅ Saved building to ${filePath} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);

    return NextResponse.json({
      id,
      name,
      size: arrayBuffer.byteLength,
      // Return the public URL path for direct access
      publicPath: `/map-data/buildings/${filename}`,
    });
  } catch (error) {
    console.error('Error storing building:', error);
    return NextResponse.json(
      { error: 'Failed to store building' },
      { status: 500 }
    );
  }
}

// List all saved buildings
export async function GET() {
  try {
    await ensureBuildingsDir();
    const files = await readdir(BUILDINGS_DIR);
    const buildings = files
      .filter(f => f.endsWith('.glb'))
      .map(f => ({
        id: f.replace('.glb', ''),
        filename: f,
        publicPath: `/map-data/buildings/${f}`,
      }));

    return NextResponse.json({ buildings });
  } catch (error) {
    console.error('Error listing buildings:', error);
    return NextResponse.json({ buildings: [] });
  }
}
