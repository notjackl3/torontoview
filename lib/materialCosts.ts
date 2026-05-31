/**
 * Material cost rates for Toronto commercial construction (2025 baseline).
 *
 * Rates are per cubic meter of mesh volume — a rough but defensible proxy
 * when no real bill-of-materials is available. The volume is estimated from
 * the GLB's mesh bounding boxes; volumes are not exact but the relative cost
 * weight between material classes is what drives the final number.
 *
 * Source basis: Altus Group 2024 Canadian Construction Cost Guide ranges,
 * adjusted to the per-m³ "material + install" envelope used elsewhere in
 * the app's cost panel.
 */
export interface MaterialRate {
  /** Friendly category label */
  label: string;
  /** Installed cost in CAD per m³ of mesh volume */
  ratePerM3: number;
  /** Embodied CO2 in kg per m³ — used by the reasonableness review */
  embodiedCo2PerM3: number;
}

export const MATERIAL_RATES: Record<string, MaterialRate> = {
  concrete: { label: "Concrete", ratePerM3: 480, embodiedCo2PerM3: 410 },
  steel: { label: "Steel", ratePerM3: 7800, embodiedCo2PerM3: 12400 },
  glass: { label: "Glass curtain wall", ratePerM3: 5200, embodiedCo2PerM3: 1800 },
  wood: { label: "Wood / timber", ratePerM3: 1100, embodiedCo2PerM3: -260 },
  brick: { label: "Brick / masonry", ratePerM3: 720, embodiedCo2PerM3: 350 },
  aluminum: { label: "Aluminum", ratePerM3: 9400, embodiedCo2PerM3: 21000 },
  stone: { label: "Stone / cladding", ratePerM3: 2600, embodiedCo2PerM3: 220 },
  drywall: { label: "Drywall / gypsum", ratePerM3: 380, embodiedCo2PerM3: 180 },
  roofing: { label: "Roofing membrane", ratePerM3: 1900, embodiedCo2PerM3: 950 },
  generic: { label: "Generic / unknown", ratePerM3: 900, embodiedCo2PerM3: 380 },
};

/** Heuristic keyword match — material names from GLB authors vary widely. */
const KEYWORD_TO_KEY: Array<[RegExp, keyof typeof MATERIAL_RATES]> = [
  [/concrete|cement|rebar|precast/i, "concrete"],
  [/steel|metal_struct|iron|girder|beam/i, "steel"],
  [/glass|window|glazing|curtain[_ ]?wall/i, "glass"],
  [/wood|timber|oak|pine|cedar|maple|plywood|osb/i, "wood"],
  [/brick|masonry|clay/i, "brick"],
  [/alum/i, "aluminum"],
  [/stone|granite|marble|limestone|cladding/i, "stone"],
  [/drywall|gypsum|plaster/i, "drywall"],
  [/roof|membrane|shingle|tar/i, "roofing"],
];

export function classifyMaterialName(name: string): keyof typeof MATERIAL_RATES {
  for (const [pattern, key] of KEYWORD_TO_KEY) {
    if (pattern.test(name)) return key;
  }
  return "generic";
}

export interface MaterialLineItem {
  materialKey: keyof typeof MATERIAL_RATES;
  label: string;
  rawName: string;
  volumeM3: number;
  cost: number;
  embodiedCo2Kg: number;
}

export interface MaterialCostBreakdown {
  lineItems: MaterialLineItem[];
  totalVolumeM3: number;
  totalCost: number;
  totalEmbodiedCo2Kg: number;
  source: "glb-parsed" | "manifest" | "estimated";
}

/**
 * Compose a breakdown from a list of {materialName, volumeM3} pairs.
 * Groups by material class so a GLB with 12 "concrete_*" submeshes becomes
 * a single "Concrete" line item in the cost panel.
 */
export function buildBreakdown(
  inputs: Array<{ materialName: string; volumeM3: number }>,
  source: MaterialCostBreakdown["source"] = "glb-parsed",
): MaterialCostBreakdown {
  const grouped = new Map<keyof typeof MATERIAL_RATES, MaterialLineItem>();

  for (const { materialName, volumeM3 } of inputs) {
    if (!Number.isFinite(volumeM3) || volumeM3 <= 0) continue;
    const key = classifyMaterialName(materialName);
    const rate = MATERIAL_RATES[key];
    const existing = grouped.get(key);
    const cost = volumeM3 * rate.ratePerM3;
    const co2 = volumeM3 * rate.embodiedCo2PerM3;

    if (existing) {
      existing.volumeM3 += volumeM3;
      existing.cost += cost;
      existing.embodiedCo2Kg += co2;
      existing.rawName = `${existing.rawName}, ${materialName}`.slice(0, 120);
    } else {
      grouped.set(key, {
        materialKey: key,
        label: rate.label,
        rawName: materialName,
        volumeM3,
        cost,
        embodiedCo2Kg: co2,
      });
    }
  }

  const lineItems = [...grouped.values()].sort((a, b) => b.cost - a.cost);
  const totalVolumeM3 = lineItems.reduce((s, l) => s + l.volumeM3, 0);
  const totalCost = lineItems.reduce((s, l) => s + l.cost, 0);
  const totalEmbodiedCo2Kg = lineItems.reduce((s, l) => s + l.embodiedCo2Kg, 0);

  return { lineItems, totalVolumeM3, totalCost, totalEmbodiedCo2Kg, source };
}

/**
 * Rescale a breakdown so its total volume matches a target (the building's
 * actual physical volume in m³). GLBs come in mixed units (m, cm, mm) and
 * arbitrary scales; the parser cannot tell them apart, so we normalize the
 * material *proportions* against a grounded target volume.
 */
export function normalizeBreakdownToVolume(
  breakdown: MaterialCostBreakdown,
  targetVolumeM3: number,
): MaterialCostBreakdown {
  if (
    !Number.isFinite(targetVolumeM3) ||
    targetVolumeM3 <= 0 ||
    breakdown.totalVolumeM3 <= 0
  ) {
    return breakdown;
  }
  const scale = targetVolumeM3 / breakdown.totalVolumeM3;
  const lineItems = breakdown.lineItems.map((l) => ({
    ...l,
    volumeM3: l.volumeM3 * scale,
    cost: l.cost * scale,
    embodiedCo2Kg: l.embodiedCo2Kg * scale,
  }));
  return {
    lineItems,
    totalVolumeM3: targetVolumeM3,
    totalCost: lineItems.reduce((s, l) => s + l.cost, 0),
    totalEmbodiedCo2Kg: lineItems.reduce((s, l) => s + l.embodiedCo2Kg, 0),
    source: breakdown.source,
  };
}
