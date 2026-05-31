import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as THREE from 'three';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';
import { exportToMap } from '@/lib/editor/utils/exportUtils';

interface ExportBarProps {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  /** When provided, the map redirect carries `mode=...` so the guided
   *  placement pipeline (new-build / demolish-rebuild) re-engages. */
  pipelineMode?: string | null;
}

export function ExportBar({ sceneRef, pipelineMode = null }: ExportBarProps) {
  const { buildings } = useBuildings();
  const router = useRouter();
  const [exportingToMap, setExportingToMap] = useState(false);

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
      const params = new URLSearchParams({ buildingId: id });
      if (pipelineMode) params.set('mode', pipelineMode);
      router.push(`/map?${params.toString()}`);
    } catch (error) {
      console.error('Export to map failed:', error);
      alert('Failed to export to map. Check console for details.');
      setExportingToMap(false);
    }
  };

  const ctaLabel = pipelineMode
    ? exportingToMap
      ? 'Sending to map…'
      : 'Place on Map →'
    : exportingToMap
      ? 'Exporting…'
      : 'Export to Map →';

  return (
    <div className="w-full px-6 py-3 border-t border-[#003F7C]/12 bg-white/80 backdrop-blur-xl flex items-center justify-between shadow-[0_-4px_18px_-12px_rgba(0,63,124,0.2)]">
      <div className="text-sm text-slate-700">
        <span className="font-black tracking-tight text-slate-900">Export</span>
        <span className="ml-3 text-slate-500">
          {buildings.length} building{buildings.length === 1 ? '' : 's'}
        </span>
        {pipelineMode && (
          <span className="ml-3 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tight bg-[#003F7C]/10 text-[#003F7C]">
            {pipelineMode} pipeline
          </span>
        )}
      </div>

      <button
        onClick={handleExportToMap}
        disabled={exportingToMap || buildings.length === 0}
        className="px-5 py-2.5 rounded-full font-black text-xs uppercase tracking-tight bg-[#003F7C] text-white hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed disabled:hover:translate-y-0 shadow-[0_8px_22px_-10px_rgba(0,63,124,0.55)] transition-all duration-200 ease-out"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
