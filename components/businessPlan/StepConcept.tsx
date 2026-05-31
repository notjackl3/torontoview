"use client";

import { CATEGORY_LABELS, type BusinessCategory } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { Field, Select, StepHeader, TextArea, TextInput, Toggle } from "./fields";

const CATEGORIES: BusinessCategory[] = [
  "cafe",
  "bakery",
  "quick-serve-restaurant",
  "full-service-restaurant",
  "bar",
  "retail-apparel",
  "retail-grocery",
  "bookstore",
  "salon-spa",
  "gym-fitness",
  "medical-clinic",
  "office-coworking",
];

export function StepConcept() {
  const { plan, update, setCategory } = usePlan();
  const c = plan.concept;

  return (
    <div>
      <StepHeader
        title="Concept"
        subtitle="Tell us who you are. Pick a category and we'll pre-fill plausible defaults for the next steps."
      />

      <div className="space-y-4">
        <Field label="Business name">
          <TextInput
            placeholder="e.g. Queen Street Coffee Co."
            value={c.name}
            onChange={(e) => update((p) => ({ ...p, concept: { ...p.concept, name: e.target.value } }))}
          />
        </Field>

        <Field label="Category" hint="Pre-fills products, hours, staffing, costs">
          <Select
            value={c.category}
            onChange={(e) => {
              const v = e.target.value as BusinessCategory | "";
              if (v) setCategory(v);
              else
                update((p) => ({ ...p, concept: { ...p.concept, category: "" } }));
            }}
          >
            <option value="">Select a category…</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="One-line value proposition">
          <TextArea
            placeholder="What makes this business worth visiting?"
            value={c.valueProp}
            onChange={(e) =>
              update((p) => ({ ...p, concept: { ...p.concept, valueProp: e.target.value } }))
            }
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Target age (min)">
            <TextInput
              type="number"
              min={0}
              max={99}
              value={c.targetAgeMin}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  concept: { ...p.concept, targetAgeMin: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <Field label="Target age (max)">
            <TextInput
              type="number"
              min={0}
              max={99}
              value={c.targetAgeMax}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  concept: { ...p.concept, targetAgeMax: parseInt(e.target.value) || 0 },
                }))
              }
            />
          </Field>
        </div>

        <Field label="Price tier">
          <Select
            value={c.targetIncomeTier}
            onChange={(e) =>
              update((p) => ({
                ...p,
                concept: { ...p.concept, targetIncomeTier: e.target.value as typeof c.targetIncomeTier },
              }))
            }
          >
            <option value="$">$ — budget</option>
            <option value="$$">$$ — mid-market</option>
            <option value="$$$">$$$ — premium</option>
            <option value="$$$$">$$$$ — luxury</option>
          </Select>
        </Field>

        <Toggle
          checked={c.chain}
          onChange={(v) => update((p) => ({ ...p, concept: { ...p.concept, chain: v } }))}
          label="Part of a chain / franchise"
        />
      </div>
    </div>
  );
}
