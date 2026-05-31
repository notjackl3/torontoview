import { describe, expect, it } from "vitest";
import {
  MATERIAL_RATES,
  buildBreakdown,
  classifyMaterialName,
  normalizeBreakdownToVolume,
} from "./materialCosts";

describe("classifyMaterialName", () => {
  it.each([
    ["concrete_wall", "concrete"],
    ["Steel_Beam_01", "steel"],
    ["glass_curtain", "glass"],
    ["timber_floor", "wood"],
    ["brick_facade", "brick"],
    ["Aluminum-frame", "aluminum"],
    ["granite_cladding", "stone"],
    ["drywall_partition", "drywall"],
    ["roofing_membrane", "roofing"],
    ["plastic_default", "generic"],
    ["", "generic"],
  ] as const)("classifies %s as %s", (input, expected) => {
    expect(classifyMaterialName(input)).toBe(expected);
  });
});

describe("buildBreakdown", () => {
  it("groups multiple matching primitives into a single line item", () => {
    const breakdown = buildBreakdown([
      { materialName: "concrete_wall_a", volumeM3: 100 },
      { materialName: "concrete_wall_b", volumeM3: 50 },
      { materialName: "steel_beam", volumeM3: 25 },
    ]);
    expect(breakdown.lineItems).toHaveLength(2);
    const concrete = breakdown.lineItems.find((l) => l.materialKey === "concrete")!;
    const steel = breakdown.lineItems.find((l) => l.materialKey === "steel")!;
    expect(concrete.volumeM3).toBe(150);
    expect(steel.volumeM3).toBe(25);
    expect(concrete.cost).toBeCloseTo(150 * MATERIAL_RATES.concrete.ratePerM3);
    expect(steel.cost).toBeCloseTo(25 * MATERIAL_RATES.steel.ratePerM3);
  });

  it("ignores zero or negative volumes", () => {
    const breakdown = buildBreakdown([
      { materialName: "concrete", volumeM3: 0 },
      { materialName: "steel", volumeM3: -1 },
      { materialName: "glass", volumeM3: 1 },
    ]);
    expect(breakdown.lineItems).toHaveLength(1);
    expect(breakdown.lineItems[0].materialKey).toBe("glass");
  });

  it("sums cost and embodied CO2 across all line items", () => {
    const breakdown = buildBreakdown([
      { materialName: "wood", volumeM3: 10 },
      { materialName: "glass", volumeM3: 5 },
    ]);
    const expectedCost =
      10 * MATERIAL_RATES.wood.ratePerM3 + 5 * MATERIAL_RATES.glass.ratePerM3;
    const expectedCo2 =
      10 * MATERIAL_RATES.wood.embodiedCo2PerM3 +
      5 * MATERIAL_RATES.glass.embodiedCo2PerM3;
    expect(breakdown.totalCost).toBeCloseTo(expectedCost);
    expect(breakdown.totalEmbodiedCo2Kg).toBeCloseTo(expectedCo2);
  });

  it("sorts line items by descending cost", () => {
    const breakdown = buildBreakdown([
      { materialName: "wood", volumeM3: 1 },
      { materialName: "steel", volumeM3: 1 },
      { materialName: "concrete", volumeM3: 1 },
    ]);
    const costs = breakdown.lineItems.map((l) => l.cost);
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
  });
});

describe("normalizeBreakdownToVolume", () => {
  it("rescales totals to the target volume while preserving material proportions", () => {
    const raw = buildBreakdown([
      { materialName: "concrete", volumeM3: 80 },
      { materialName: "steel", volumeM3: 20 },
    ]);
    const normalized = normalizeBreakdownToVolume(raw, 1000);
    expect(normalized.totalVolumeM3).toBeCloseTo(1000);
    const concrete = normalized.lineItems.find((l) => l.materialKey === "concrete")!;
    const steel = normalized.lineItems.find((l) => l.materialKey === "steel")!;
    expect(concrete.volumeM3).toBeCloseTo(800);
    expect(steel.volumeM3).toBeCloseTo(200);
    // Per-material cost ratio (steel:concrete) is invariant under uniform rescale.
    const rawConcrete = raw.lineItems.find((l) => l.materialKey === "concrete")!;
    const rawSteel = raw.lineItems.find((l) => l.materialKey === "steel")!;
    expect(steel.cost / concrete.cost).toBeCloseTo(rawSteel.cost / rawConcrete.cost);
  });

  it("returns the input unchanged when target volume is invalid", () => {
    const raw = buildBreakdown([{ materialName: "wood", volumeM3: 5 }]);
    expect(normalizeBreakdownToVolume(raw, 0)).toBe(raw);
    expect(normalizeBreakdownToVolume(raw, -10)).toBe(raw);
    expect(normalizeBreakdownToVolume(raw, NaN)).toBe(raw);
  });

  it("handles an empty breakdown gracefully", () => {
    const empty = buildBreakdown([]);
    expect(normalizeBreakdownToVolume(empty, 1000)).toBe(empty);
  });
});
