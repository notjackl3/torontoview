"use client";

import type { MarketingTier } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { Field, NumberInput, Select, StepHeader } from "./fields";

export function StepFinancials() {
  const { plan, update } = usePlan();
  const f = plan.financials;
  const totalCapital = f.capitalOwn + f.capitalLoan + f.capitalGrants;

  return (
    <div>
      <StepHeader
        title="Financials"
        subtitle="Start-up capital, monthly fixed costs, marketing. The committee will project revenue and break-even from here."
      />

      <div className="space-y-5">
        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-tight text-zinc-400">
            Start-up capital
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Own ($)">
              <NumberInput
                min={0}
                value={f.capitalOwn}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, capitalOwn: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Loan ($)">
              <NumberInput
                min={0}
                value={f.capitalLoan}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, capitalLoan: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Grants ($)">
              <NumberInput
                min={0}
                value={f.capitalGrants}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, capitalGrants: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
            Total capital: <span className="text-zinc-200 font-mono">${totalCapital.toLocaleString()}</span>
          </p>
        </section>

        {f.capitalLoan > 0 && (
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-tight text-zinc-400">
              Loan terms
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Interest rate (%)">
                <NumberInput
                  min={0}
                  max={30}
                  step={0.1}
                  value={f.loanRatePct}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      financials: { ...p.financials, loanRatePct: parseFloat(e.target.value) || 0 },
                    }))
                  }
                />
              </Field>
              <Field label="Term (months)">
                <NumberInput
                  min={6}
                  max={360}
                  step={6}
                  value={f.loanTermMonths}
                  onChange={(e) =>
                    update((p) => ({
                      ...p,
                      financials: { ...p.financials, loanTermMonths: parseInt(e.target.value) || 0 },
                    }))
                  }
                />
              </Field>
            </div>
          </section>
        )}

        <section>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-tight text-zinc-400">
            Monthly fixed costs
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rent ($/mo)">
              <NumberInput
                value={f.rent}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, rent: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Utilities ($/mo)">
              <NumberInput
                value={f.utilities}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, utilities: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Insurance ($/mo)">
              <NumberInput
                value={f.insurance}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, insurance: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Software / POS ($/mo)">
              <NumberInput
                value={f.softwarePos}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, softwarePos: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Accounting ($/mo)">
              <NumberInput
                value={f.accounting}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, accounting: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
            <Field label="Other ($/mo)">
              <NumberInput
                value={f.other}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    financials: { ...p.financials, other: parseInt(e.target.value) || 0 },
                  }))
                }
              />
            </Field>
          </div>
        </section>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Marketing tier">
            <Select
              value={f.marketingTier}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  financials: { ...p.financials, marketingTier: e.target.value as MarketingTier },
                }))
              }
            >
              <option value="low">Low ($)</option>
              <option value="medium">Medium ($$)</option>
              <option value="high">High ($$$)</option>
            </Select>
          </Field>
          <Field label="Inventory float ($)">
            <NumberInput
              min={0}
              value={f.inventoryFloat}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  financials: { ...p.financials, inventoryFloat: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Break-even target (mo)">
            <NumberInput
              min={1}
              max={60}
              value={f.breakEvenMonth}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  financials: { ...p.financials, breakEvenMonth: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
