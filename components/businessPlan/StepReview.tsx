"use client";

import { CATEGORY_LABELS, computePlanMetrics } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { StepHeader } from "./fields";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

export function StepReview({ onSubmit }: { onSubmit: () => void }) {
  const { plan } = usePlan();
  const m = computePlanMetrics(plan);
  const profit = m.monthlyNet >= 0;

  return (
    <div>
      <StepHeader
        title="Review"
        subtitle="Quick snapshot before you hand this over to the agent committee."
      />

      <div className="space-y-4">
        <Card title="Concept">
          <Row label="Name" value={plan.concept.name || "—"} />
          <Row
            label="Category"
            value={plan.concept.category ? CATEGORY_LABELS[plan.concept.category] : "—"}
          />
          <Row label="Price tier" value={plan.concept.targetIncomeTier} />
          <Row
            label="Target age"
            value={`${plan.concept.targetAgeMin}–${plan.concept.targetAgeMax}`}
          />
        </Card>

        <Card title="Products">
          <Row label="Line items" value={`${plan.products.length}`} />
          <Row label="Projected daily revenue" value={money(m.dailyRevenue)} />
          <Row label="Projected monthly revenue" value={money(m.monthlyRevenue)} />
          <Row label="Gross margin" value={`${m.grossMarginPct.toFixed(1)}%`} />
        </Card>

        <Card title="Operations">
          <Row
            label="Footprint"
            value={`${plan.operations.customerAreaSqft + plan.operations.backOfHouseSqft} sqft`}
          />
          <Row label="Seating" value={`${plan.operations.seatingCapacity}`} />
          <Row label="Service model" value={plan.operations.serviceModel} />
        </Card>

        <Card title="Staffing">
          <Row
            label="Roles"
            value={`${plan.staffing.roles.length} (${plan.staffing.roles.reduce((s, r) => s + r.headcount, 0)} headcount)`}
          />
          <Row label="Monthly labor" value={money(m.monthlyLabor)} />
        </Card>

        <Card title="Monthly P&L (projected)">
          <Row label="Revenue" value={money(m.monthlyRevenue)} />
          <Row label="COGS" value={`− ${money(m.monthlyCogs)}`} />
          <Row label="Labor" value={`− ${money(m.monthlyLabor)}`} />
          <Row label="Fixed costs" value={`− ${money(m.monthlyFixed)}`} />
          {m.monthlyLoanPayment > 0 && (
            <Row label="Loan payment" value={`− ${money(m.monthlyLoanPayment)}`} />
          )}
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-tight text-zinc-400">
              Net monthly
            </span>
            <span
              className={`font-mono text-base font-bold ${
                profit ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {profit ? "" : "− "}
              {money(Math.abs(m.monthlyNet))}
            </span>
          </div>
        </Card>

        <button
          type="button"
          onClick={onSubmit}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-bold uppercase tracking-tight text-white hover:bg-blue-500 transition-colors"
        >
          Submit to committee
        </button>
        <p className="text-center text-[10px] text-zinc-500">
          The committee of specialist agents will review and return suggestions, revenue projections, and risk flags.
        </p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-white/10 bg-white/5 p-4">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-tight text-zinc-400">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className="font-mono text-zinc-100">{value}</span>
    </div>
  );
}
