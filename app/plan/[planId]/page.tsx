"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { PlanProvider } from "@/components/businessPlan/PlanProvider";
import { WizardShell } from "@/components/businessPlan/WizardShell";

export default function PlanPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = use(params);
  const searchParams = useSearchParams();
  const buildingId =
    searchParams.get("buildingId") ??
    searchParams.get("osmBuildingId") ??
    undefined;

  return (
    <PlanProvider planId={planId} buildingId={buildingId}>
      <WizardShell />
    </PlanProvider>
  );
}
