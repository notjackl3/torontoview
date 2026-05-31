"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyCategoryDefaults,
  emptyPlan,
  type BusinessCategory,
  type BusinessPlan,
} from "@/lib/businessPlan";

const STORAGE_PREFIX = "tv:plan:";

type Updater = (prev: BusinessPlan) => BusinessPlan;

interface PlanContextValue {
  plan: BusinessPlan;
  update: (updater: Updater) => void;
  setCategory: (category: BusinessCategory) => void;
  resetPlan: () => void;
  saveStatus: "idle" | "saving" | "saved";
}

const PlanContext = createContext<PlanContextValue | null>(null);

function loadFromStorage(id: string): BusinessPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    return JSON.parse(raw) as BusinessPlan;
  } catch {
    return null;
  }
}

function saveToStorage(plan: BusinessPlan) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + plan.id, JSON.stringify(plan));
  } catch {
    // ignore quota errors
  }
}

export function PlanProvider({
  planId,
  buildingId,
  children,
}: {
  planId: string;
  buildingId?: string;
  children: React.ReactNode;
}) {
  const [plan, setPlan] = useState<BusinessPlan>(() => emptyPlan(planId, buildingId));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const stored = loadFromStorage(planId);
    if (stored) setPlan(stored);
    hydratedRef.current = true;
  }, [planId]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    setSaveStatus("saving");
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveToStorage(plan);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    }, 400);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [plan]);

  const update = useCallback((updater: Updater) => {
    setPlan((prev) => ({ ...updater(prev), updatedAt: Date.now() }));
  }, []);

  const setCategory = useCallback((category: BusinessCategory) => {
    setPlan((prev) => ({ ...applyCategoryDefaults(prev, category), updatedAt: Date.now() }));
  }, []);

  const resetPlan = useCallback(() => {
    setPlan(emptyPlan(planId, buildingId));
  }, [planId, buildingId]);

  const value = useMemo(
    () => ({ plan, update, setCategory, resetPlan, saveStatus }),
    [plan, update, setCategory, resetPlan, saveStatus],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used inside PlanProvider");
  return ctx;
}
