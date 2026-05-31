"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  DollarSign,
  ShoppingBag,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { vietnameseCafeMockPlan } from "@/lib/businessPlan";
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
  const { plan, update, saveStatus } = usePlan();
  const router = useRouter();
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

  // Dev shortcut: skip the agent-council call and jump straight to the on-map
  // analysis stage. The plan is already auto-saved to localStorage by
  // PlanProvider, so /map will find it and the Demographics + Competitor
  // panels will read targetAge / targetIncomeTier from it.
  const handleSubmitMock = () => {
    const anchor = plan.buildingId;
    const planParam = `planId=${encodeURIComponent(plan.id)}`;
    if (!anchor) {
      router.push(`/map?${planParam}`);
      return;
    }
    // Pick the right anchor-param based on id shape so /map knows which
    // store to look the building up in:
    //   building-<ts>  → placed building (in localStorage tv:placedBuildings)
    //   tor3d... / others → OSM building
    const param = anchor.startsWith("building-")
      ? "placedBuildingId"
      : "osmBuildingId";
    router.push(
      `/map?${planParam}&${param}=${encodeURIComponent(anchor)}`,
    );
  };

  const handleFillMock = () => {
    update((prev) => ({ ...vietnameseCafeMockPlan(prev.id, prev.buildingId) }));
    setCurrentIndex(0);
  };

  return (
    <div className="flex min-h-screen w-full bg-gradient-to-b from-[#f5f8fc] via-[#eef3fa] to-[#e8f0fc] text-slate-900">
      <aside className="hidden md:flex w-72 flex-col border-r border-[#003F7C]/12 bg-white/85 backdrop-blur-xl shadow-[6px_0_22px_-18px_rgba(0,63,124,0.25)]">
        <div className="flex items-center justify-between border-b border-[#003F7C]/10 px-5 py-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-tight text-[#003F7C]">
              Business plan
            </p>
            <p className="truncate text-sm font-black text-slate-900">
              {plan.concept.name || "Untitled plan"}
            </p>
          </div>
          <Link
            href="/map"
            className="rounded p-1.5 text-slate-500 hover:bg-[#003F7C]/8 hover:text-[#003F7C] transition-colors"
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
        <div className="border-t border-[#003F7C]/10 px-5 py-3 space-y-2">
          <button
            type="button"
            onClick={handleFillMock}
            title="Replace this draft with a Vietnamese café test fixture"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-400/60 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-tight text-amber-800 hover:bg-amber-100 transition-colors"
          >
            <Sparkles size={12} />
            Fill mock data (Vietnamese café)
          </button>
          <p className="text-[10px] text-slate-500">
            {saveStatus === "saving" && "Saving draft…"}
            {saveStatus === "saved" && "Draft saved"}
            {saveStatus === "idle" && "Auto-saved locally"}
          </p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b border-[#003F7C]/10 bg-white/70 backdrop-blur-xl px-6 py-4 md:hidden flex items-center justify-between">
          <p className="text-sm font-black text-slate-900">
            {STEPS[currentIndex].label}
            <span className="ml-2 text-[10px] text-slate-500">
              Step {currentIndex + 1} of {STEPS.length}
            </span>
          </p>
          <Link href="/map" className="p-1.5 text-slate-500 hover:text-[#003F7C]">
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
            {STEPS[currentIndex].id === "review" && (
              <StepReview
                onSubmit={handleSubmit}
                onSubmitMock={handleSubmitMock}
              />
            )}
          </div>
        </div>

        <footer className="border-t border-[#003F7C]/10 bg-white/80 backdrop-blur-xl px-6 py-4 shadow-[0_-4px_18px_-12px_rgba(0,63,124,0.2)]">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentIndex === 0}
              className="flex items-center gap-1.5 rounded-md px-4 py-2 text-[11px] font-black uppercase tracking-tight text-slate-700 hover:bg-[#003F7C]/8 hover:text-[#003F7C] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <p className="text-[10px] text-slate-500">
              Step {currentIndex + 1} / {STEPS.length}
            </p>
            {currentIndex < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleContinue}
                className="flex items-center gap-1.5 rounded-md bg-[#003F7C] px-4 py-2 text-[11px] font-black uppercase tracking-tight text-white hover:brightness-110 shadow-[0_8px_22px_-10px_rgba(0,63,124,0.55)] transition-colors"
              >
                Continue
                <ChevronRight size={14} />
              </button>
            ) : (
              <span className="text-[10px] text-slate-500 italic">Submit below</span>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
