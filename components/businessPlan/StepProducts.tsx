"use client";

import { Plus, Trash2 } from "lucide-react";
import type { Product } from "@/lib/businessPlan";
import { usePlan } from "./PlanProvider";
import { NumberInput, StepHeader, TextInput } from "./fields";

function newProduct(): Product {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    price: 0,
    cogsPct: 30,
    dailyVolume: 0,
  };
}

export function StepProducts() {
  const { plan, update } = usePlan();
  const products = plan.products;

  const setProducts = (next: Product[]) =>
    update((p) => ({ ...p, products: next }));

  const updateProduct = (id: string, patch: Partial<Product>) =>
    setProducts(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const dailyRevenue = products.reduce((sum, p) => sum + p.price * p.dailyVolume, 0);

  return (
    <div>
      <StepHeader
        title="Products & pricing"
        subtitle="What do you sell, at what price, and how many per day? COGS% is cost of goods as a share of price."
      />

      <div className="rounded-md border border-[#003F7C]/12 overflow-hidden">
        <div className="grid grid-cols-[1fr_90px_70px_90px_36px] gap-2 bg-white px-3 py-2 text-[9px] font-bold uppercase tracking-tight text-slate-600">
          <span>Product</span>
          <span className="text-right">Price ($)</span>
          <span className="text-right">COGS %</span>
          <span className="text-right">Daily vol.</span>
          <span />
        </div>
        <div className="divide-y divide-[#003F7C]/8">
          {products.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-500">
              No products yet. Add your first line item below.
            </p>
          )}
          {products.map((prod) => (
            <div
              key={prod.id}
              className="grid grid-cols-[1fr_90px_70px_90px_36px] gap-2 px-3 py-2"
            >
              <TextInput
                placeholder="Product name"
                value={prod.name}
                onChange={(e) => updateProduct(prod.id, { name: e.target.value })}
              />
              <NumberInput
                min={0}
                step={0.25}
                value={prod.price || ""}
                onChange={(e) =>
                  updateProduct(prod.id, { price: parseFloat(e.target.value) || 0 })
                }
                className="text-right"
              />
              <NumberInput
                min={0}
                max={100}
                step={1}
                value={prod.cogsPct || ""}
                onChange={(e) =>
                  updateProduct(prod.id, { cogsPct: parseFloat(e.target.value) || 0 })
                }
                className="text-right"
              />
              <NumberInput
                min={0}
                step={1}
                value={prod.dailyVolume || ""}
                onChange={(e) =>
                  updateProduct(prod.id, {
                    dailyVolume: parseFloat(e.target.value) || 0,
                  })
                }
                className="text-right"
              />
              <button
                type="button"
                onClick={() => setProducts(products.filter((p) => p.id !== prod.id))}
                className="flex items-center justify-center rounded-md text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setProducts([...products, newProduct()])}
        className="mt-3 flex items-center gap-1.5 rounded-md border border-dashed border-[#003F7C]/15 px-3 py-2 text-[11px] font-bold uppercase tracking-tight text-slate-700 hover:border-[#003F7C]/40 hover:text-[#003F7C] transition-colors"
      >
        <Plus size={13} />
        Add product
      </button>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Projected daily revenue" value={`$${dailyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <Stat label="Projected monthly revenue" value={`$${(dailyRevenue * 30).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[#003F7C]/12 bg-white px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-tight text-slate-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-slate-900 font-mono">{value}</p>
    </div>
  );
}
