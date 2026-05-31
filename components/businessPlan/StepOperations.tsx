"use client";

import { WEEKDAYS, type ServiceModel } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { Field, NumberInput, Select, StepHeader, Toggle } from "./fields";

const SERVICE_MODELS: { value: ServiceModel; label: string }[] = [
  { value: "counter", label: "Counter service" },
  { value: "table", label: "Table service" },
  { value: "quick-serve", label: "Quick-serve / takeout" },
  { value: "self-serve", label: "Self-serve" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "hybrid", label: "Hybrid" },
];

export function StepOperations() {
  const { plan, update } = usePlan();
  const ops = plan.operations;

  return (
    <div>
      <StepHeader
        title="Operations"
        subtitle="How the business runs day-to-day: hours, footprint, service model."
      />

      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-tight text-slate-600">
            Hours of operation
          </p>
          <div className="rounded-md border border-[#003F7C]/12 overflow-hidden divide-y divide-[#003F7C]/8">
            {WEEKDAYS.map(({ key, label }) => {
              const day = ops.hours[key];
              return (
                <div key={key} className="grid grid-cols-[60px_60px_1fr_1fr] items-center gap-2 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-tight text-slate-700">
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      update((p) => ({
                        ...p,
                        operations: {
                          ...p.operations,
                          hours: { ...p.operations.hours, [key]: { ...day, open: !day.open } },
                        },
                      }))
                    }
                    className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-tight ${
                      day.open
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : "bg-white text-slate-500 border border-[#003F7C]/12"
                    }`}
                  >
                    {day.open ? "Open" : "Closed"}
                  </button>
                  <input
                    type="time"
                    disabled={!day.open}
                    value={day.start}
                    onChange={(e) =>
                      update((p) => ({
                        ...p,
                        operations: {
                          ...p.operations,
                          hours: {
                            ...p.operations.hours,
                            [key]: { ...day, start: e.target.value },
                          },
                        },
                      }))
                    }
                    className="bg-white border border-[#003F7C]/12 rounded px-2 py-1 text-xs text-slate-800 disabled:opacity-40"
                  />
                  <input
                    type="time"
                    disabled={!day.open}
                    value={day.end}
                    onChange={(e) =>
                      update((p) => ({
                        ...p,
                        operations: {
                          ...p.operations,
                          hours: {
                            ...p.operations.hours,
                            [key]: { ...day, end: e.target.value },
                          },
                        },
                      }))
                    }
                    className="bg-white border border-[#003F7C]/12 rounded px-2 py-1 text-xs text-slate-800 disabled:opacity-40"
                  />
                </div>
              );
            })}
          </div>
        </div>

        <Field label="Service model">
          <Select
            value={ops.serviceModel}
            onChange={(e) =>
              update((p) => ({
                ...p,
                operations: { ...p.operations, serviceModel: e.target.value as ServiceModel },
              }))
            }
          >
            {SERVICE_MODELS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer-area sqft">
            <NumberInput
              min={0}
              value={ops.customerAreaSqft}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  operations: { ...p.operations, customerAreaSqft: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Back-of-house sqft">
            <NumberInput
              min={0}
              value={ops.backOfHouseSqft}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  operations: { ...p.operations, backOfHouseSqft: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Seating capacity">
            <NumberInput
              min={0}
              value={ops.seatingCapacity}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  operations: { ...p.operations, seatingCapacity: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Peak customers / hour">
            <NumberInput
              min={0}
              value={ops.peakTurnRate}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  operations: { ...p.operations, peakTurnRate: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Toggle
            checked={ops.alcoholLicense}
            onChange={(v) =>
              update((p) => ({ ...p, operations: { ...p.operations, alcoholLicense: v } }))
            }
            label="Alcohol licence"
          />
          <Toggle
            checked={ops.liveEntertainment}
            onChange={(v) =>
              update((p) => ({ ...p, operations: { ...p.operations, liveEntertainment: v } }))
            }
            label="Live entertainment"
          />
        </div>
      </div>
    </div>
  );
}
