/**
 * @deprecated This component uses Mapbox GL and is being replaced by ThreeMap.tsx
 * which uses Three.js for better 3D rendering. This file is archived and should
 * not be used for new features.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface Marker {
  id: string;
  coordinates: [number, number];
  title: string;
  description?: string;
}

interface MapWithMarkersProps {
  initialCenter?: [number, number];
  initialZoom?: number;
  style?: string;
  className?: string;
  markers?: Marker[];
}

export default function MapWithMarkers({
  initialCenter = [-79.3800, 43.6500], // Toronto, Ontario
  initialZoom = 13,
  style = 'mapbox://styles/mapbox/streets-v12',
  className = 'w-full h-full',
  markers = [],
}: MapWithMarkersProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return;

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: style,
      center: initialCenter,
      zoom: initialZoom,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

    map.current.on('load', () => {
      setMapLoaded(true);
    });

    return () => {
      // Clean up markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [initialCenter, initialZoom, style]);

  // Add markers when map is loaded
  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Remove existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add new markers
    markers.forEach((markerData) => {
      const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(
        `<div class="p-2">
          <h3 class="font-bold text-lg mb-1">${markerData.title}</h3>
          ${markerData.description ? `<p class="text-sm text-gray-600">${markerData.description}</p>` : ''}
        </div>`
      );

      const marker = new mapboxgl.Marker({
        color: '#3b82f6', // blue-500
      })
        .setLngLat(markerData.coordinates)
        .setPopup(popup)
        .addTo(map.current!);

      markersRef.current.push(marker);
    });
  }, [markers, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className={className} />
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <p className="text-gray-600 dark:text-gray-400">Loading map...</p>
        </div>
      )}
    </div>
  );
}
