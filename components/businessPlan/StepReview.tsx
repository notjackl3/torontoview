"use client";

import { CATEGORY_LABELS, computePlanMetrics } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { StepHeader } from "./fields";

function money(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

export function StepReview({
  onSubmit,
  onSubmitMock,
}: {
  onSubmit: () => void;
  onSubmitMock?: () => void;
}) {
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
          <div className="mt-2 flex items-center justify-between border-t border-[#003F7C]/12 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-tight text-slate-600">
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
          className="w-full rounded-md bg-[#003F7C] px-4 py-3 text-sm font-bold uppercase tracking-tight text-white hover:brightness-110 transition-colors"
        >
          Submit to committee
        </button>
        <p className="text-center text-[10px] text-slate-500">
          The committee of specialist agents will review and return suggestions, revenue projections, and risk flags.
        </p>

        {onSubmitMock && (
          <>
            <button
              type="button"
              onClick={onSubmitMock}
              className="w-full rounded-md border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm font-bold uppercase tracking-tight text-amber-800 hover:bg-amber-100 transition-colors"
            >
              Submit mock · skip to map analysis
            </button>
            <p className="text-center text-[10px] text-slate-500">
              Dev shortcut — bypasses the agent committee and jumps straight to the on-map business analysis with the plan already loaded.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-[#003F7C]/12 bg-white p-4">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-tight text-slate-600">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-slate-900">{value}</span>
    </div>
  );
}
