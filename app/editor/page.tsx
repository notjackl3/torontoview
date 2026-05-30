'use client';

import dynamic from 'next/dynamic';

const BuildingEditorApp = dynamic(() => import('@/components/editor/BuildingEditorApp'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen w-screen bg-zinc-950">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-400 mx-auto mb-4"></div>
        <p className="text-zinc-400">Loading 3D Building Editor...</p>
      </div>
    </div>
  ),
});

export default function EditorPage() {
  return <BuildingEditorApp />;
}
