/**
 * Pre-fetch map data to warm up the browser cache
 * Call this on app initialization
 */

const TORONTO_BBOX = {
  south: 43.640,
  west: -79.395,
  north: 43.660,
  east: -79.365,
};

/**
 * Pre-fetch all map data to warm up the browser cache
 * This can be called on app startup to improve initial load performance
 */
export async function prefetchMapData() {
  if (typeof window === 'undefined') return; // Only run client-side

  try {
    // Pre-fetch all endpoints in parallel with aggressive caching
    await Promise.allSettled([
      fetch(`/api/map/buildings?south=${TORONTO_BBOX.south}&west=${TORONTO_BBOX.west}&north=${TORONTO_BBOX.north}&east=${TORONTO_BBOX.east}`, {
        cache: 'force-cache',
        next: { revalidate: 86400 },
      }),
      fetch(`/api/map/roads?south=${TORONTO_BBOX.south}&west=${TORONTO_BBOX.west}&north=${TORONTO_BBOX.north}&east=${TORONTO_BBOX.east}`, {
        cache: 'force-cache',
        next: { revalidate: 86400 },
      }),
      fetch(`/api/map/traffic-signals?south=${TORONTO_BBOX.south}&west=${TORONTO_BBOX.west}&north=${TORONTO_BBOX.north}&east=${TORONTO_BBOX.east}`, {
        cache: 'force-cache',
        next: { revalidate: 86400 },
      }),
    ]);

    console.log('✅ Map data cache pre-warmed');
  } catch (error) {
    console.warn('Failed to pre-warm map data cache:', error);
  }
}
