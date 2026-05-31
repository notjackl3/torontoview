'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { BuildingsProvider } from '@/lib/editor/contexts/BuildingsContext';
import { InputPanel } from '@/components/editor/InputPanel/InputPanel';
import { Scene } from '@/components/editor/Viewport/Scene';
import { ExportBar } from '@/components/editor/Export/ExportBar';
import { VoiceDesign } from '@/components/editor/InputPanel/VoiceDesign';

interface BuildingEditorAppProps {
  /** Pipeline mode forwarded from /start (?mode=new-build|demolish-rebuild|move-in).
   *  When set, the export flow returns the user to /map with the same mode so
   *  guided placement re-engages with their custom-designed building. */
  pipelineMode?: string | null;
}

export default function BuildingEditorApp({ pipelineMode = null }: BuildingEditorAppProps) {
  const sceneRef = useRef<THREE.Scene | null>(null);

  const backHref = pipelineMode ? `/start` : '/';
  const backLabel = pipelineMode ? '← Back to pipeline' : '← Back to Campus Map';

  return (
    <BuildingsProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-gradient-to-b from-[#f5f8fc] via-[#eef3fa] to-[#e8f0fc] text-slate-900">
        {/* Header */}
        <header className="z-10 px-6 py-3 flex items-center justify-between border-b border-[#003F7C]/12 bg-white/70 backdrop-blur-xl shadow-[0_4px_18px_-12px_rgba(0,63,124,0.25)]">
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900">
              3D Building Editor
            </h1>
            <p className="text-xs text-slate-500">
              {pipelineMode
                ? `Designing for the ${pipelineMode.replace('-', ' ')} pipeline · export sends it back to the map`
                : 'Create and customize 3D buildings'}
            </p>
          </div>
          <Link
            href={backHref}
            className="px-5 py-2.5 rounded-full font-bold text-xs uppercase tracking-tight border border-[#003F7C]/15 bg-white/80 text-[#003F7C] hover:bg-[#003F7C] hover:text-white hover:border-[#003F7C] transition-colors duration-200"
          >
            {backLabel}
          </Link>
        </header>

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Input Panel - Left Side */}
          <div className="w-[30%] min-w-[320px] max-w-[500px]">
            <InputPanel />
          </div>

          {/* 3D Viewport - Right Side */}
          <div className="flex-1">
            <Scene sceneRef={sceneRef} />
          </div>
        </div>

        {/* Export Bar - Bottom */}
        <ExportBar sceneRef={sceneRef} pipelineMode={pipelineMode} />
      </div>

      {/* Voice Design - Floating Bottom Left */}
      <VoiceDesign />
    </BuildingsProvider>
  );
}
