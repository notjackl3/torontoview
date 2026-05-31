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
  // Building id can arrive via three names:
  //   - osmBuildingId : an existing OSM building the user is leasing (move-in)
  //   - placedBuildingId : a building the user just placed via new-build /
  //     demolish-rebuild
  //   - buildingId : legacy / generic catch-all
  const buildingId =
    searchParams.get("buildingId") ??
    searchParams.get("osmBuildingId") ??
    searchParams.get("placedBuildingId") ??
    undefined;

  return (
    <PlanProvider planId={planId} buildingId={buildingId}>
      <WizardShell />
    </PlanProvider>
  );
}
