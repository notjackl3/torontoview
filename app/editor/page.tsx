'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const BuildingEditorApp = dynamic(() => import('@/components/editor/BuildingEditorApp'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen w-screen bg-gradient-to-b from-[#f5f8fc] via-[#eef3fa] to-[#e8f0fc]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-[#003F7C] mx-auto mb-4"></div>
        <p className="text-slate-500">Loading 3D Building Editor...</p>
      </div>
    </div>
  ),
});

function EditorPageInner() {
  const searchParams = useSearchParams();
  const pipelineMode = searchParams.get('mode');
  return <BuildingEditorApp pipelineMode={pipelineMode} />;
}

export default function EditorPage() {
  return (
    <Suspense fallback={null}>
      <EditorPageInner />
    </Suspense>
  );
}
