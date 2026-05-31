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
                ? "bg-[#003F7C]/8 border border-[#003F7C]/30"
                : "border border-transparent hover:bg-[#003F7C]/5"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                isActive
                  ? "bg-[#003F7C] border-[#003F7C] text-white"
                  : "bg-white border-[#003F7C]/15 text-slate-500"
              }`}
            >
              <Icon size={13} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-black uppercase tracking-tight ${
                  isActive ? "text-[#003F7C]" : "text-slate-800"
                }`}
              >
                {step.label}
              </p>
              <p className="truncate text-[9px] text-slate-500">{step.hint}</p>
            </div>
          </button>
        );
      })}
    </nav>
  );
}
