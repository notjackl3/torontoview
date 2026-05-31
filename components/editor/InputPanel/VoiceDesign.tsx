'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSpeechToText } from '@/lib/editor/hooks/useSpeechToText';
import { useBuildings } from '@/lib/editor/contexts/BuildingsContext';
import { applyBuildingConfig } from '@/lib/editor/utils/voiceAdapter';
import type { BuildingConfig } from '@/lib/buildingConfig';

type VoicePhase = 'idle' | 'listening' | 'designing' | 'error';

interface VoiceResult {
  transcript: string;
  config: BuildingConfig | null;
  confirmation: string;
}

export function VoiceDesign() {
  const { addBuilding, getSelectedBuilding, updateBuilding } = useBuildings();
  const speech = useSpeechToText();

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [lastResult, setLastResult] = useState<VoiceResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const processingRef = useRef(false);

  const placeholderText = (() => {
    switch (phase) {
      case 'idle':
        return 'Describe a building...';
      case 'listening':
        return 'Listening...';
      case 'designing':
        return 'Designing...';
      case 'error':
        return errorMessage || 'Error. Try again.';
    }
  })();

  const handleVoiceDesign = useCallback(() => {
    setErrorMessage('');
    setPhase('listening');
    speech.reset();
    processingRef.current = false;
    speech.startListening();
  }, [speech]);

  const processSpeechResult = useCallback(
    async (transcript: string) => {
      if (!transcript) {
        setPhase('error');
        setErrorMessage('I did not catch that. Try again.');
        return;
      }

      setPhase('designing');

      try {
        const selectedBuilding = getSelectedBuilding();
        let previousConfig: Partial<BuildingConfig> | undefined;
        if (selectedBuilding) {
          const spec = selectedBuilding.spec;

          // Reverse-map existing spec fields back to BuildingConfig so
          // The local model knows every current value and only changes what the user asks for.
          const textureReverseMap: Record<string, string> = {
            stucco: 'smooth', concrete: 'concrete', brick: 'brick',
            wood: 'wood', glass: 'glass',
          };
          const roofReverseMap: Record<string, string> = {
            flat: 'flat', gabled: 'gable', hipped: 'hip',
          };
          const windowShapeReverseMap: Record<string, string> = {
            rectangular: 'basic', arched: 'arched',
            circular: 'circular', triangular: 'triangular',
          };

          previousConfig = {
            floors: spec.numberOfFloors,
            width: spec.width,
            length: spec.depth,
            heightPerFloor: spec.floorHeight,
            wallColor: spec.wallColor || 'gray',
            windowStyle: (spec.windowPattern === 'none'
              ? 'none'
              : windowShapeReverseMap[spec.windowShape] || 'basic') as BuildingConfig['windowStyle'],
            texture: (textureReverseMap[spec.wallTexture] || 'concrete') as BuildingConfig['texture'],
            roofStyle: (roofReverseMap[spec.roofType] || 'flat') as BuildingConfig['roofStyle'],
            style: 'modern',
          };
        }

        const designResponse = await fetch('/api/design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: transcript, previousConfig }),
        });

        if (!designResponse.ok) {
          const errorData = await designResponse.json();
          throw new Error(errorData.error || `Design API returned ${designResponse.status}`);
        }

        const { config, confirmation } = (await designResponse.json()) as {
          config: BuildingConfig;
          confirmation: string;
        };

        setLastResult({ transcript, config, confirmation });

        const specUpdates = applyBuildingConfig(config);
        if (selectedBuilding) {
          updateBuilding(selectedBuilding.id, specUpdates);
        } else {
          addBuilding({ x: 0, y: 0, z: 0 }, specUpdates);
        }

        setPhase('idle');
      } catch (designError) {
        setPhase('error');
        setErrorMessage(
          designError instanceof Error ? designError.message : 'Failed to design building.'
        );
      }
    },
    [getSelectedBuilding, updateBuilding, addBuilding]
  );

  useEffect(() => {
    if (phase !== 'listening') return;

    if (speech.status === 'done' && speech.transcript && !processingRef.current) {
      processingRef.current = true;
      processSpeechResult(speech.transcript);
    } else if (speech.status === 'error' && !processingRef.current) {
      processingRef.current = true;
      setPhase('error');
      setErrorMessage(speech.error || 'Speech recognition failed.');
    }
  }, [speech.status, speech.transcript, speech.error, phase, processSpeechResult]);

  const isActive = phase !== 'idle' && phase !== 'error';

  // Pulsing ring color for the mic button based on phase
  const micRingClass = (() => {
    switch (phase) {
      case 'listening':
        return 'ring-4 ring-blue-400/50 animate-pulse';
      case 'designing':
        return 'ring-4 ring-amber-400/50 animate-pulse';
      default:
        return '';
    }
  })();

  const micBgClass = (() => {
    switch (phase) {
      case 'listening':
        return 'bg-[#003F7C] text-white';
      case 'designing':
        return 'bg-amber-500 text-white';
      case 'error':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-[#003F7C]/8 text-[#003F7C] hover:bg-violet-600 hover:text-white';
    }
  })();

  return (
    <div className="fixed bottom-24 right-8 z-50 flex flex-col items-end gap-2">
      {/* Popover: Last Voice Command details */}
      {lastResult && showDetails && (
        <div className="w-80 bg-white/95 backdrop-blur-xl border border-[#003F7C]/15 rounded-2xl shadow-[0_18px_50px_-18px_rgba(0,63,124,0.35)] p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
              Last Voice Command
            </span>
            <button
              onClick={() => setShowDetails(false)}
              className="text-slate-500 hover:text-slate-900 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Transcript</p>
            <p className="text-sm text-slate-800">&ldquo;{lastResult.transcript}&rdquo;</p>
          </div>
          {lastResult.config && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Parsed Config</p>
              <pre className="text-[11px] bg-[#003F7C]/5 rounded-lg p-2.5 overflow-x-auto text-slate-700 leading-relaxed max-h-48 overflow-y-auto">
                {JSON.stringify(lastResult.config, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Floating Input Island */}
      <div className="flex items-center gap-2 bg-white/95 backdrop-blur-xl border border-[#003F7C]/15 rounded-full shadow-[0_18px_45px_-20px_rgba(0,63,124,0.35)] pl-4 pr-1.5 py-1.5">
        {/* Text / Status area */}
        <span
          className={`text-sm select-none min-w-[160px] ${
            phase === 'error' ? 'text-red-600' : 'text-slate-500'
          }`}
        >
          {lastResult && phase === 'idle'
            ? `"${lastResult.transcript.length > 22 ? lastResult.transcript.slice(0, 22) + '...' : lastResult.transcript}"`
            : placeholderText}
        </span>

        {/* Show details button (only when we have a result) */}
        {lastResult && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 ${
              showDetails
                ? 'bg-violet-100 text-violet-700'
                : 'bg-[#003F7C]/8 text-[#003F7C] hover:bg-[#003F7C]/15'
            }`}
            title="Show details"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
            </svg>
          </button>
        )}

        {/* Mic Button */}
        <button
          onClick={handleVoiceDesign}
          disabled={isActive}
          className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${micBgClass} ${micRingClass} disabled:cursor-not-allowed`}
          title="Voice Design"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        </button>

        {/* Send / Arrow button (acts as secondary trigger) */}
        <button
          onClick={handleVoiceDesign}
          disabled={isActive}
          className="w-10 h-10 rounded-full flex items-center justify-center bg-violet-500 text-white hover:bg-violet-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Start voice design"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
