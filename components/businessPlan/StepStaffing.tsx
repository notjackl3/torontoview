"use client";

import { Plus, Trash2 } from "lucide-react";
import type { StaffRole } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { Field, NumberInput, StepHeader, TextInput } from "./fields";

function newRole(): StaffRole {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    headcount: 1,
    hourlyWage: 17.2,
    fullTime: false,
  };
}

export function StepStaffing() {
  const { plan, update } = usePlan();
  const roles = plan.staffing.roles;

  const setRoles = (next: StaffRole[]) =>
    update((p) => ({ ...p, staffing: { ...p.staffing, roles: next } }));

  const updateRole = (id: string, patch: Partial<StaffRole>) =>
    setRoles(roles.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div>
      <StepHeader
        title="Staffing"
        subtitle="Roles you'll hire on day one. Ontario minimum wage is currently $17.20/hr (2025)."
      />

      <div className="rounded-md border border-white/10 overflow-hidden">
        <div className="grid grid-cols-[1fr_80px_90px_90px_36px] gap-2 bg-white/5 px-3 py-2 text-[9px] font-bold uppercase tracking-tight text-zinc-400">
          <span>Role</span>
          <span className="text-right">Headcount</span>
          <span className="text-right">$/hour</span>
          <span className="text-center">FT/PT</span>
          <span />
        </div>
        <div className="divide-y divide-white/5">
          {roles.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-zinc-500">
              No roles defined. Add your first one below.
            </p>
          )}
          {roles.map((role) => (
            <div
              key={role.id}
              className="grid grid-cols-[1fr_80px_90px_90px_36px] gap-2 px-3 py-2"
            >
              <TextInput
                placeholder="e.g. Barista"
                value={role.title}
                onChange={(e) => updateRole(role.id, { title: e.target.value })}
              />
              <NumberInput
                min={1}
                value={role.headcount || ""}
                onChange={(e) =>
                  updateRole(role.id, { headcount: parseInt(e.target.value) || 0 })
                }
                className="text-right"
              />
              <NumberInput
                min={0}
                step={0.5}
                value={role.hourlyWage || ""}
                onChange={(e) =>
                  updateRole(role.id, { hourlyWage: parseFloat(e.target.value) || 0 })
                }
                className="text-right"
              />
              <button
                type="button"
                onClick={() => updateRole(role.id, { fullTime: !role.fullTime })}
                className={`rounded px-2 py-1 text-[9px] font-bold uppercase tracking-tight ${
                  role.fullTime
                    ? "bg-blue-500/20 text-blue-200 border border-blue-400/30"
                    : "bg-white/5 text-zinc-400 border border-white/10"
                }`}
              >
                {role.fullTime ? "Full-time" : "Part-time"}
              </button>
              <button
                type="button"
                onClick={() => setRoles(roles.filter((r) => r.id !== role.id))}
                className="flex items-center justify-center rounded-md text-zinc-500 hover:bg-rose-500/15 hover:text-rose-400 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setRoles([...roles, newRole()])}
        className="mt-3 flex items-center gap-1.5 rounded-md border border-dashed border-white/15 px-3 py-2 text-[11px] font-bold uppercase tracking-tight text-zinc-300 hover:border-blue-400/40 hover:text-blue-200 transition-colors"
      >
        <Plus size={13} />
        Add role
      </button>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Field label="Founder monthly draw ($)">
          <NumberInput
            min={0}
            value={plan.staffing.founderDraw}
            onChange={(e) =>
              update((p) => ({
                ...p,
                staffing: { ...p.staffing, founderDraw: parseInt(e.target.value) || 0 },
              }))
            }
          />
        </Field>
        <Field label="Benefits % (on top of wages)">
          <NumberInput
            min={0}
            max={50}
            step={1}
            value={plan.staffing.benefitsPct}
            onChange={(e) =>
              update((p) => ({
                ...p,
                staffing: { ...p.staffing, benefitsPct: parseFloat(e.target.value) || 0 },
              }))
            }
          />
        </Field>
      </div>
    </div>
  );
}
