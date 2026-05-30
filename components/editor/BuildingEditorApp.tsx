'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import * as THREE from 'three';
import { BuildingsProvider } from '@/lib/editor/contexts/BuildingsContext';
import { InputPanel } from '@/components/editor/InputPanel/InputPanel';
import { Scene } from '@/components/editor/Viewport/Scene';
import { ExportBar } from '@/components/editor/Export/ExportBar';
import { VoiceDesign } from '@/components/editor/InputPanel/VoiceDesign';

export default function BuildingEditorApp() {
  const sceneRef = useRef<THREE.Scene | null>(null);

  return (
    <BuildingsProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#222222]">
        {/* Header */}
        <header className="glass z-10 px-4 py-3 flex items-center justify-between border-b border-white/10">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">3D Building Editor</h1>
            <p className="text-xs text-zinc-500">Create and customize 3D buildings</p>
          </div>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full font-medium text-sm border-2 bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10 hover:border-white/20 hover:text-white hover:shadow-[0_8px_25px_-5px_rgba(255,255,255,0.08)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ease-out"
          >
            ← Back to Campus Map
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
        <ExportBar sceneRef={sceneRef} />
      </div>

      {/* Voice Design - Floating Bottom Left */}
      <VoiceDesign />
    </BuildingsProvider>
  );
}
