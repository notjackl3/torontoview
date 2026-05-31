import type { BusinessCategory } from "./businessPlan";
import type { BuildMode } from "./buildMode";

export type GrantLevel = "City of Toronto" | "Province of Ontario" | "Federal";

export interface Grant {
  id: string;
  name: string;
  level: GrantLevel;
  /** One-sentence description of what it funds. */
  funds: string;
  /** Typical award size. Range in CAD. */
  amountRangeCad: [number, number];
  /** Categories this grant generally applies to; empty = applies to most. */
  eligibleCategories?: BusinessCategory[];
  /** Free-text eligibility cues we can match against the business plan. */
  eligibilityRules: string[];
  /** Whether the grant is restricted to inside a Business Improvement Area. */
  biaOnly?: boolean;
  /** Whether the grant favors street-front retail. */
  storefrontFocused?: boolean;
  /** Which take-the-site modes this program funds. Omit = applies to all. */
  eligibleBuildModes?: BuildMode[];
  applyUrl: string;
  /** Optional matching dataset id on open.toronto.ca for cross-reference. */
  ckanPackageId?: string;
}

export const GRANTS: Grant[] = [
  {
    id: "commercial-facade-improvement",
    name: "Commercial Façade Improvement Grant (CFIG)",
    level: "City of Toronto",
    funds:
      "50% cost-share (up to $12,500 per property) to restore or improve the façade of a commercial property within a BIA or designated avenue.",
    amountRangeCad: [2500, 12500],
    eligibilityRules: [
      "Property fronts a public street within a Toronto BIA or designated avenue",
      "Work includes signage, lighting, windows, doors, or storefront restoration",
      "Property is not in arrears with City of Toronto",
    ],
    biaOnly: true,
    storefrontFocused: true,
    // Façade work happens on the existing building — best fit for move-in
    // tenants restoring a storefront, but also valid during a fit-out after
    // demo-rebuild. Not a new-build-from-empty-lot program.
    eligibleBuildModes: ["move-in", "demolish-rebuild"],
    applyUrl:
      "https://www.toronto.ca/business-economy/business-operation-growth/business-improvement-areas/bia-financial-incentives/commercial-facade-improvement/",
  },
  {
    id: "bia-capital-cost-sharing",
    name: "BIA Capital Cost-Sharing",
    level: "City of Toronto",
    funds:
      "City contributes 50% of capital streetscape improvements (planters, lighting, way-finding) led by the local BIA.",
    amountRangeCad: [10_000, 250_000],
    eligibilityRules: [
      "Applicant is a registered BIA",
      "Project benefits public realm in the BIA",
    ],
    biaOnly: true,
    storefrontFocused: true,
    applyUrl:
      "https://www.toronto.ca/business-economy/business-operation-growth/business-improvement-areas/bia-financial-incentives/",
  },
  {
    id: "main-street-innovation",
    name: "Main Street Innovation Fund",
    level: "City of Toronto",
    funds:
      "Small grants for new retail / food / service concepts that activate vacant storefronts on main streets.",
    amountRangeCad: [5_000, 25_000],
    // Activating an existing vacant storefront — move-in only.
    eligibleBuildModes: ["move-in"],
    eligibleCategories: [
      "cafe",
      "full-service-restaurant",
      "quick-serve-restaurant",
      "bakery",
      "retail-apparel",
      "retail-grocery",
      "bookstore",
      "salon-spa",
    ],
    eligibilityRules: [
      "Storefront business opening on a Toronto main street",
      "Fewer than 25 employees",
      "Operating in Toronto for less than 5 years",
    ],
    storefrontFocused: true,
    applyUrl:
      "https://www.toronto.ca/business-economy/business-operation-growth/business-incentives/main-street-innovation-fund/",
  },
  {
    id: "digital-main-street",
    name: "Digital Main Street — ShopHERE / Grants",
    level: "Province of Ontario",
    funds:
      "Subsidized e-commerce builds, free digital-transformation consults, and up to $2,500 grants for digital tooling.",
    amountRangeCad: [500, 2_500],
    eligibilityRules: [
      "Brick-and-mortar Ontario business",
      "Fewer than 25 employees",
      "Not a franchise of a national chain",
    ],
    storefrontFocused: true,
    applyUrl: "https://digitalmainstreet.ca/",
  },
  {
    id: "starter-company-plus",
    name: "Starter Company Plus (Enterprise Toronto)",
    level: "Province of Ontario",
    funds:
      "$5,000 micro-grant + mentorship for new or recently-started Toronto businesses.",
    amountRangeCad: [5_000, 5_000],
    eligibilityRules: [
      "Toronto resident, 18+",
      "Business operating less than 5 years",
      "Fewer than 5 employees",
      "Not enrolled full-time in school",
    ],
    applyUrl:
      "https://www.toronto.ca/business-economy/business-operation-growth/business-incentives/starter-company-plus-grant/",
  },
  {
    id: "canada-small-business-financing-program",
    name: "Canada Small Business Financing Program (CSBFP)",
    level: "Federal",
    funds:
      "Government-backed loan for equipment, leasehold improvements, real estate (up to $1.15M). Lower rates than typical unsecured small-business credit.",
    amountRangeCad: [50_000, 1_150_000],
    eligibilityRules: [
      "For-profit small business",
      "Annual revenue under $10M",
      "Loan is for eligible asset purchases (equipment, leaseholds, real property)",
    ],
    applyUrl: "https://ised-isde.canada.ca/site/canada-small-business-financing-program/en",
  },
  {
    id: "feddev-ontario-jobs-prosperity",
    name: "FedDev Ontario — Jobs and Prosperity Fund",
    level: "Federal",
    funds:
      "Repayable contribution for productivity and scale-up projects in southern Ontario.",
    amountRangeCad: [200_000, 5_000_000],
    eligibleCategories: ["office-coworking", "medical-clinic"],
    eligibilityRules: [
      "Established business with growth project",
      "Project demonstrably creates Ontario jobs / productivity",
    ],
    // Capital scale-up program — typically funds new construction or
    // significant facility expansion, not a lease fit-out.
    eligibleBuildModes: ["new-build", "demolish-rebuild"],
    // The Jobs and Prosperity Fund branding was retired; FedDev's current
    // business funding hub lists active programs (Regional Tariff Response,
    // Regional AI/Quantum, Homebuilding Innovation, etc.).
    applyUrl: "https://feddev-ontario.canada.ca/en/funding-southern-ontario",
  },
  {
    id: "toronto-public-health-food-safety-grant",
    name: "Toronto Public Health Food-Handler Training Subsidy",
    level: "City of Toronto",
    funds:
      "Subsidized food-handler certification training for new food-premise operators.",
    amountRangeCad: [0, 500],
    eligibleCategories: [
      "cafe",
      "full-service-restaurant",
      "quick-serve-restaurant",
      "bakery",
      "retail-grocery",
      "bar",
    ],
    eligibilityRules: [
      "Newly opening or first-time food premise in Toronto",
    ],
    applyUrl:
      "https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/food-safety/food-handler-certification/",
  },
];

/**
 * Score a grant 0..1 against a plan profile. Higher = better match.
 * Returns null if the grant is hard-disqualified (category restriction, BIA
 * gate, or build-mode mismatch).
 */
export function scoreGrant(
  grant: Grant,
  profile: {
    category: BusinessCategory | "";
    employees: number | null;
    insideBia: boolean | null;
    isStorefront: boolean | null;
    /** How the user is taking the site. Used to drop grants whose program
     *  only funds a specific delivery model (new-build vs fit-out). */
    buildMode?: BuildMode;
  },
): { score: number; matched: string[]; disqualified: string[] } | null {
  const matched: string[] = [];
  const disqualified: string[] = [];

  if (
    grant.eligibleCategories &&
    profile.category &&
    !grant.eligibleCategories.includes(profile.category)
  ) {
    return null;
  }
  if (
    grant.eligibleBuildModes &&
    profile.buildMode &&
    !grant.eligibleBuildModes.includes(profile.buildMode)
  ) {
    return null;
  }
  if (grant.biaOnly && profile.insideBia === false) {
    disqualified.push("Requires a Business Improvement Area location");
    return { score: 0, matched, disqualified };
  }

  let score = 0.5;
  if (profile.category && grant.eligibleCategories?.includes(profile.category)) {
    score += 0.2;
    matched.push("Category match");
  }
  if (grant.storefrontFocused && profile.isStorefront) {
    score += 0.15;
    matched.push("Street-front retail / food");
  }
  if (
    grant.eligibleBuildModes &&
    profile.buildMode &&
    grant.eligibleBuildModes.includes(profile.buildMode)
  ) {
    score += 0.1;
    matched.push("Funds this delivery model");
  }
  if (
    profile.employees != null &&
    grant.eligibilityRules.some((r) => /fewer than (\d+)/i.test(r))
  ) {
    const rule = grant.eligibilityRules.find((r) => /fewer than (\d+)/i.test(r))!;
    const cap = Number(rule.match(/fewer than (\d+)/i)?.[1] ?? "0");
    if (profile.employees < cap) {
      score += 0.15;
      matched.push(`Under ${cap}-employee cap`);
    } else {
      score -= 0.2;
      disqualified.push(`Employee count exceeds ${cap}`);
    }
  }
  return { score: Math.max(0, Math.min(1, score)), matched, disqualified };
}
