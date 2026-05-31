"use client";

import type { LucideIcon } from "lucide-react";

export interface StepDescriptor {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

interface StepperRailProps {
  steps: StepDescriptor[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function StepperRail({ steps, currentIndex, onSelect }: StepperRailProps) {
  return (
    <nav className="flex flex-col gap-1 p-3">
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isActive = idx === currentIndex;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(idx)}
            className={`group flex items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
              isActive
                ? "bg-blue-500/15 border border-blue-400/30"
                : "border border-transparent hover:bg-white/5"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                isActive
                  ? "bg-blue-500/30 border-blue-400/60 text-blue-100"
                  : "bg-white/5 border-white/10 text-zinc-400"
              }`}
            >
              <Icon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-bold uppercase tracking-tight ${
                  isActive ? "text-blue-100" : "text-zinc-200"
                }`}
              >
                {step.label}
              </p>
              <p className="truncate text-[9px] text-zinc-500">{step.hint}</p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
