"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  DollarSign,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { usePlan } from "./PlanProvider";
import { StepperRail, type StepDescriptor } from "./StepperRail";
import { StepConcept } from "./StepConcept";
import { StepProducts } from "./StepProducts";
import { StepOperations } from "./StepOperations";
import { StepStaffing } from "./StepStaffing";
import { StepFinancials } from "./StepFinancials";
import { StepReview } from "./StepReview";

const STEPS: StepDescriptor[] = [
  { id: "concept", label: "Concept", hint: "Name, category, target", icon: Briefcase },
  { id: "products", label: "Products", hint: "What you sell", icon: ShoppingBag },
  { id: "operations", label: "Operations", hint: "Hours, footprint", icon: Clock },
  { id: "staffing", label: "Staffing", hint: "Roles and wages", icon: Users },
  { id: "financials", label: "Financials", hint: "Capital and costs", icon: DollarSign },
  { id: "review", label: "Review", hint: "Submit to committee", icon: ClipboardCheck },
];

export function WizardShell() {
  const { plan, saveStatus } = usePlan();
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleContinue = () => {
    if (currentIndex < STEPS.length - 1) setCurrentIndex(currentIndex + 1);
  };
  const handleBack = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleSubmit = () => {
    console.log("Submit to committee:", plan);
    alert("Committee submission stub — see console. Wire this to your agent endpoint next.");
  };

  return (
    <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-100">
      <aside className="hidden md:flex w-72 flex-col border-r border-white/10 bg-zinc-900/50">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-tight text-zinc-500">
              Business plan
            </p>
            <p className="truncate text-sm font-bold text-zinc-100">
              {plan.concept.name || "Untitled plan"}
            </p>
          </div>
          <Link
            href="/map"
            className="rounded p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-100 transition-colors"
            title="Close"
          >
            <X size={16} />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <StepperRail
            steps={STEPS}
            currentIndex={currentIndex}
            onSelect={(idx) => setCurrentIndex(idx)}
          />
        </div>
        <div className="border-t border-white/10 px-5 py-3 text-[10px] text-zinc-500">
          {saveStatus === "saving" && "Saving draft…"}
          {saveStatus === "saved" && "Draft saved"}
          {saveStatus === "idle" && "Auto-saved locally"}
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b border-white/10 px-6 py-4 md:hidden flex items-center justify-between">
          <p className="text-sm font-bold text-zinc-100">
            {STEPS[currentIndex].label}
            <span className="ml-2 text-[10px] text-zinc-500">
              Step {currentIndex + 1} of {STEPS.length}
            </span>
          </p>
          <Link href="/map" className="p-1.5 text-zinc-400 hover:text-zinc-100">
            <X size={16} />
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-8">
            {STEPS[currentIndex].id === "concept" && <StepConcept />}
            {STEPS[currentIndex].id === "products" && <StepProducts />}
            {STEPS[currentIndex].id === "operations" && <StepOperations />}
            {STEPS[currentIndex].id === "staffing" && <StepStaffing />}
            {STEPS[currentIndex].id === "financials" && <StepFinancials />}
            {STEPS[currentIndex].id === "review" && <StepReview onSubmit={handleSubmit} />}
          </div>
        </div>

        <footer className="border-t border-white/10 bg-zinc-900/50 px-6 py-4">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentIndex === 0}
              className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[11px] font-bold uppercase tracking-tight text-zinc-300 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <p className="text-[10px] text-zinc-500">
              Step {currentIndex + 1} / {STEPS.length}
            </p>
            {currentIndex < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleContinue}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-[11px] font-bold uppercase tracking-tight text-white hover:bg-blue-500 transition-colors"
              >
                Continue
                <ChevronRight size={14} />
              </button>
            ) : (
              <span className="text-[10px] text-zinc-500 italic">Submit below</span>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
