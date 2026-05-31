import { NextRequest, NextResponse } from 'next/server';
import { readFile, unlink, stat } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';

const BUILDINGS_DIR = path.join(process.cwd(), 'public', 'map-data', 'buildings');

/**
 * Per-process buffer cache for GLB responses. Capped to ~64 MB so a
 * long-running dev server doesn't grow unbounded. ETags are derived from the
 * file contents so a re-upload under the same name still revalidates.
 */
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
interface CacheEntry {
  buffer: Buffer;
  etag: string;
  mtimeMs: number;
  size: number;
}
const cache = new Map<string, CacheEntry>();
let cacheBytes = 0;

function evictIfNeeded(incoming: number) {
  while (cacheBytes + incoming > MAX_CACHE_BYTES && cache.size > 0) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    const evicted = cache.get(oldestKey);
    if (evicted) cacheBytes -= evicted.size;
    cache.delete(oldestKey);
  }
}

async function loadEntry(id: string): Promise<CacheEntry | null> {
  const filename = `${id}.glb`;
  const filePath = path.join(BUILDINGS_DIR, filename);
  let stats;
  try {
    stats = await stat(filePath);
  } catch {
    return null;
  }

  const cached = cache.get(id);
  if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
    // Touch LRU ordering by re-inserting
    cache.delete(id);
    cache.set(id, cached);
    return cached;
  }

  const buffer = await readFile(filePath);
  const etag = `"${createHash('sha1').update(buffer).digest('hex')}"`;
  const entry: CacheEntry = {
    buffer,
    etag,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };

  if (cached) cacheBytes -= cached.size;
  evictIfNeeded(stats.size);
  cache.set(id, entry);
  cacheBytes += stats.size;
  return entry;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const entry = await loadEntry(id);
    if (!entry) {
      return NextResponse.json({ error: 'Building not found' }, { status: 404 });
    }

    // Honor conditional GETs — saves bandwidth when the browser revalidates.
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === entry.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: entry.etag,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return new NextResponse(entry.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Disposition': `inline; filename="${id}.glb"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: entry.etag,
      },
    });
  } catch (error) {
    console.error('Error retrieving building:', error);
    return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const filename = `${id}.glb`;
    const filePath = path.join(BUILDINGS_DIR, filename);

    await unlink(filePath);
    const evicted = cache.get(id);
    if (evicted) {
      cacheBytes -= evicted.size;
      cache.delete(id);
    }
    console.log(`🗑️ Deleted building: ${filename}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting building:', error);
    return NextResponse.json({ error: 'Building not found' }, { status: 404 });
  }
}
