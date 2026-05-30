import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';
import { exportMultiBuildingsToGLB, exportMultiBuildingsToJSON, copyMultiBuildingsToClipboard, exportToMap } from '@/lib/editor/utils/exportUtils';

interface ExportBarProps {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
}

export function ExportBar({ sceneRef }: ExportBarProps) {
  const { buildings } = useBuildings();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportingToMap, setExportingToMap] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleExportGLB = async () => {
    if (!sceneRef.current) {
      alert('Scene not ready for export');
      return;
    }

    setExporting(true);
    try {
      await exportMultiBuildingsToGLB(sceneRef.current);
      alert(`Successfully exported ${buildings.length} building${buildings.length > 1 ? 's' : ''} as GLB!`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export GLB. Check console for details.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportJSON = () => {
    exportMultiBuildingsToJSON(buildings);
  };

  const handleCopyJSON = async () => {
    try {
      await copyMultiBuildingsToClipboard(buildings);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const handleExportToMap = async () => {
    if (!sceneRef.current) {
      alert('Scene not ready for export');
      return;
    }

    if (buildings.length === 0) {
      alert('No buildings to export. Create a building first!');
      return;
    }

    setExportingToMap(true);
    try {
      const { id } = await exportToMap(sceneRef.current, 'custom-building');
      // Navigate to map with the building ID
      router.push(`/map?buildingId=${id}`);
    } catch (error) {
      console.error('Export to map failed:', error);
      alert('Failed to export to map. Check console for details.');
      setExportingToMap(false);
    }
  };

  return (
    <div className="w-full glass text-white px-6 py-4 border-t border-white/10 flex items-center justify-between">
      <div className="text-sm">
        <span className="font-semibold">Export Options</span>
        <span className="ml-3 text-zinc-500">
          {buildings.length} building{buildings.length > 1 ? 's' : ''}
        </span>
      </div>

      <button
        onClick={handleExportToMap}
        disabled={exportingToMap}
        className="px-5 py-2.5 rounded-full font-medium text-sm border-2 bg-indigo-600 border-indigo-500 text-white hover:bg-indigo-500 hover:border-indigo-400 hover:shadow-[0_8px_25px_-5px_rgba(99,102,241,0.5)] hover:-translate-y-0.5 active:translate-y-0 disabled:bg-zinc-800 disabled:border-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none transition-all duration-200 ease-out"
      >
        {exportingToMap ? 'Exporting...' : 'Export to Map →'}
      </button>
    </div>
  );
}
