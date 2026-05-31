import type { BusinessCategory } from "./businessPlan";
import type { BuildMode } from "./buildMode";

export type PermitAuthority =
  | "City of Toronto — Toronto Building"
  | "City of Toronto — City Planning"
  | "City of Toronto — Municipal Licensing & Standards"
  | "City of Toronto — Revenue Services"
  | "Toronto Public Health"
  | "Toronto Fire Services"
  | "AGCO (Province of Ontario)"
  | "Ontario — Ministry of Health"
  | "Committee of Adjustment / OLT";

export interface RequiredPermit {
  id: string;
  name: string;
  authority: PermitAuthority;
  /** Short reason this business needs it. */
  why: string;
  /** Whether it's a hard blocker before opening (vs. ongoing compliance). */
  blocker: boolean;
  /** Typical timeline before issue, in calendar weeks. */
  typicalWeeks: [number, number];
  /** Official application URL. */
  applyUrl: string;
  /** Which take-the-site modes this applies to. */
  appliesTo: BuildMode[];
}

// ───────────────────────────────────────────────────────────────────────────
// Construction / occupancy permits — these differ by build mode.
// ───────────────────────────────────────────────────────────────────────────

const TENANT_IMPROVEMENT: RequiredPermit = {
  id: "building-permit-tenant-improvement",
  name: "Building permit — interior alterations / tenant improvement",
  authority: "City of Toronto — Toronto Building",
  why: "Required for any reconfiguration of partitions, plumbing, HVAC, or electrical inside an existing tenant space above the 'minor work' threshold.",
  blocker: true,
  typicalWeeks: [4, 12],
  applyUrl: "https://www.toronto.ca/services-payments/building-construction/building-permit/",
  appliesTo: ["move-in"],
};

const NEW_BUILDING_PERMIT: RequiredPermit = {
  id: "building-permit-new-construction",
  name: "Building permit — new construction",
  authority: "City of Toronto — Toronto Building",
  why: "Ground-up construction requires a full Part 3 / Part 9 Ontario Building Code review covering structure, life-safety, mechanical, and accessibility.",
  blocker: true,
  typicalWeeks: [12, 26],
  applyUrl: "https://www.toronto.ca/services-payments/building-construction/building-permit/",
  appliesTo: ["new-build", "demolish-rebuild"],
};

const DEMOLITION_PERMIT: RequiredPermit = {
  id: "demolition-permit",
  name: "Demolition permit",
  authority: "City of Toronto — Toronto Building",
  why: "Required before any structural demolition; includes utility disconnection sign-offs and waste-diversion plan. Heritage-listed properties require additional Heritage Preservation review.",
  blocker: true,
  typicalWeeks: [4, 10],
  applyUrl: "https://www.toronto.ca/services-payments/building-construction/building-permit/before-you-apply-for-a-building-permit/building-permit-application-guides/",
  appliesTo: ["demolish-rebuild"],
};

const SITE_PLAN_APPROVAL: RequiredPermit = {
  id: "site-plan-approval",
  name: "Site Plan Approval (SPA)",
  authority: "City of Toronto — City Planning",
  why: "New construction over the SPA threshold needs City Planning sign-off on site layout, landscaping, servicing, and stormwater before a building permit is issued.",
  blocker: true,
  typicalWeeks: [16, 40],
  applyUrl: "https://www.toronto.ca/city-government/planning-development/application-forms-fees/building-toronto-together-a-development-guide/site-plan-control-applications/",
  appliesTo: ["new-build", "demolish-rebuild"],
};

const DEVELOPMENT_CHARGES: RequiredPermit = {
  id: "development-charges",
  name: "Development charges + parkland levy",
  authority: "City of Toronto — Revenue Services",
  why: "City and Education development charges are due at building-permit issuance for ground-up construction; parkland dedication / cash-in-lieu is set at site plan.",
  blocker: true,
  typicalWeeks: [0, 2],
  applyUrl: "https://www.toronto.ca/city-government/planning-development/application-forms-fees/development-charges/",
  appliesTo: ["new-build", "demolish-rebuild"],
};

const ZONING_REVIEW: RequiredPermit = {
  id: "zoning-certificate",
  name: "Zoning Certificate / Preliminary Project Review",
  authority: "City of Toronto — City Planning",
  why: "Confirms the proposed use, height, density and setbacks comply with Zoning By-law 569-2013 at the site address. Catches required variances before you spend on drawings.",
  blocker: true,
  typicalWeeks: [3, 6],
  applyUrl: "https://www.toronto.ca/city-government/planning-development/application-forms-fees/building-toronto-together-a-development-guide/zoning-certificate/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const MINOR_VARIANCE: RequiredPermit = {
  id: "committee-of-adjustment",
  name: "Committee of Adjustment — minor variance",
  authority: "Committee of Adjustment / OLT",
  why: "Surfaced only when the proposed use or massing departs from the as-of-right zoning at this site. Needed before any permit is issued.",
  blocker: true,
  typicalWeeks: [12, 26],
  applyUrl: "https://www.toronto.ca/city-government/planning-development/application-forms-fees/building-toronto-together-a-development-guide/committee-of-adjustment/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const REZONING: RequiredPermit = {
  id: "zoning-bylaw-amendment",
  name: "Zoning By-law Amendment (rezoning)",
  authority: "City of Toronto — City Planning",
  why: "Surfaced only when the proposed use is fundamentally not permitted in the current zone — typically a full Council-approved rezoning is needed.",
  blocker: true,
  typicalWeeks: [40, 78],
  applyUrl: "https://www.toronto.ca/city-government/planning-development/application-forms-fees/building-toronto-together-a-development-guide/official-plan-and-zoning-by-law-amendment/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

// ───────────────────────────────────────────────────────────────────────────
// Business / occupancy permits — apply across modes.
// ───────────────────────────────────────────────────────────────────────────

const SIGN_PERMIT: RequiredPermit = {
  id: "sign-permit",
  name: "Sign permit (exterior signage)",
  authority: "City of Toronto — Toronto Building",
  why: "Any exterior sign (storefront, projecting, awning, illuminated) needs a sign permit under the Toronto Sign By-law (Chapter 694).",
  blocker: false,
  typicalWeeks: [3, 6],
  applyUrl: "https://www.toronto.ca/services-payments/building-construction/sign-permits-information/making-a-sign-application/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const BL_BIZLICENSE_GENERAL: RequiredPermit = {
  id: "business-license-general",
  name: "Municipal business licence",
  authority: "City of Toronto — Municipal Licensing & Standards",
  why: "Most retail, service, and food businesses operating in Toronto require a category-specific business licence under Chapter 545.",
  blocker: true,
  typicalWeeks: [2, 6],
  applyUrl: "https://www.toronto.ca/business-economy/new-businesses-startups/business-regulations/business-licences-permits-application-portal/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const FIRE_INSPECTION: RequiredPermit = {
  id: "fire-inspection",
  name: "Toronto Fire Services inspection (occupancy)",
  authority: "Toronto Fire Services",
  why: "Required before occupancy for any space serving the public; verifies egress, alarm system, suppression, and assembly capacity.",
  blocker: true,
  typicalWeeks: [1, 3],
  applyUrl: "https://www.toronto.ca/community-people/public-safety-alerts/fire-prevention-inspection-enforcement/request-a-fire-inspection-or-service/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const FOOD_PREMISES: RequiredPermit = {
  id: "food-premises-toronto-public-health",
  name: "Food premises notification + pre-opening inspection",
  authority: "Toronto Public Health",
  why: "Any establishment preparing or serving food must notify TPH 14+ days before opening and pass a pre-opening inspection under O. Reg. 493/17.",
  blocker: true,
  typicalWeeks: [2, 4],
  applyUrl: "https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/food-safety/food-safety-for-businesses/starting-a-food-business/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const SMART_SERVE: RequiredPermit = {
  id: "smart-serve-staff",
  name: "Smart Serve certification (all alcohol-serving staff)",
  authority: "AGCO (Province of Ontario)",
  why: "Every staff member who serves, sells, or handles alcohol must hold Smart Serve before their first shift.",
  blocker: true,
  typicalWeeks: [0, 1],
  applyUrl: "https://www.smartserve.ca/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const LIQUOR_LICENCE: RequiredPermit = {
  id: "liquor-sales-licence",
  name: "Liquor sales licence (with capacity assessment)",
  authority: "AGCO (Province of Ontario)",
  why: "Required for any premises selling alcohol for on-premise consumption. AGCO does its own capacity + floorplan assessment; coordinate with the city building permit.",
  blocker: true,
  typicalWeeks: [10, 20],
  applyUrl: "https://www.agco.ca/en/alcohol/apply-liquor-sales-licence",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const PATIO_BOULEVARD: RequiredPermit = {
  id: "boulevard-cafe-patio",
  name: "Boulevard café / patio permit",
  authority: "City of Toronto — Municipal Licensing & Standards",
  why: "Any seating on the public right-of-way (sidewalk, curb-lane) needs a CaféTO / boulevard café permit each season.",
  blocker: false,
  typicalWeeks: [2, 8],
  applyUrl: "https://www.toronto.ca/services-payments/permits-licences-bylaws/sidewalk-cafe/sidewalk-cafe-permit/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const PERSONAL_SERVICE_INSPECTION: RequiredPermit = {
  id: "personal-service-settings-inspection",
  name: "Personal Service Settings inspection",
  authority: "Toronto Public Health",
  why: "Hair, nail, body-art, tattoo, and skin-treatment settings need a TPH inspection under the Personal Service Settings regulation.",
  blocker: true,
  typicalWeeks: [1, 3],
  applyUrl: "https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/bodysafe/about-bodysafe/",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

const MEDICAL_CPSO: RequiredPermit = {
  id: "cpso-clinic-registration",
  name: "Out-of-Hospital Premises (OHP) / clinic registration",
  authority: "Ontario — Ministry of Health",
  why: "Most clinical premises require the operating practitioner to register the location with their college and (for procedures) the CPSO OHP program.",
  blocker: true,
  typicalWeeks: [4, 16],
  applyUrl: "https://www.cpso.on.ca/physicians/your-practice/accreditation-programs/out-of-hospital-premises-inspection-program",
  appliesTo: ["new-build", "demolish-rebuild", "move-in"],
};

// ───────────────────────────────────────────────────────────────────────────
// Category × build-mode catalog.
// ───────────────────────────────────────────────────────────────────────────

interface CategoryPermitSet {
  /** Use-specific permits (food, alcohol, personal-service, etc.). */
  use: RequiredPermit[];
  /** Whether the category typically has a street-front patio option. */
  hasPatio: boolean;
}

const USE_PERMITS_BY_CATEGORY: Record<BusinessCategory, CategoryPermitSet> = {
  cafe: { use: [FOOD_PREMISES], hasPatio: true },
  "full-service-restaurant": {
    use: [FOOD_PREMISES, LIQUOR_LICENCE, SMART_SERVE],
    hasPatio: true,
  },
  "quick-serve-restaurant": { use: [FOOD_PREMISES], hasPatio: false },
  bar: { use: [FOOD_PREMISES, LIQUOR_LICENCE, SMART_SERVE], hasPatio: false },
  "retail-apparel": { use: [], hasPatio: false },
  "retail-grocery": { use: [FOOD_PREMISES], hasPatio: false },
  "salon-spa": { use: [PERSONAL_SERVICE_INSPECTION], hasPatio: false },
  "gym-fitness": { use: [], hasPatio: false },
  "medical-clinic": { use: [MEDICAL_CPSO], hasPatio: false },
  "office-coworking": { use: [], hasPatio: false },
  bakery: { use: [FOOD_PREMISES], hasPatio: false },
  bookstore: { use: [], hasPatio: false },
};

/** Verdict from comparing the proposed use against the Official Plan zone. */
export type UseCompatibility =
  | "as-of-right"
  | "minor-variance"
  | "rezoning"
  | "unknown";

interface CatalogOptions {
  category: BusinessCategory;
  buildMode: BuildMode;
  /** Result of the OP-zone vs. business-use compatibility check. */
  useCompatibility?: UseCompatibility;
}

/**
 * Build the list of required permits for a (category, buildMode) pair. The
 * caller passes the use-compatibility verdict so we can inject Committee-of-
 * Adjustment or rezoning entries only when warranted.
 */
export function getRequiredPermits(opts: CatalogOptions): RequiredPermit[] {
  const { category, buildMode, useCompatibility = "unknown" } = opts;
  const out: RequiredPermit[] = [];

  // Construction-track permits, in roughly the order they're filed.
  if (buildMode === "new-build" || buildMode === "demolish-rebuild") {
    out.push(ZONING_REVIEW);
    if (useCompatibility === "minor-variance") out.push(MINOR_VARIANCE);
    if (useCompatibility === "rezoning") out.push(REZONING);
    if (buildMode === "demolish-rebuild") out.push(DEMOLITION_PERMIT);
    out.push(SITE_PLAN_APPROVAL);
    out.push(NEW_BUILDING_PERMIT);
    out.push(DEVELOPMENT_CHARGES);
  } else {
    // move-in: only need zoning compliance + a tenant-improvement permit, and
    // only escalate to CoA / rezoning if the use isn't allowed in this zone.
    out.push(ZONING_REVIEW);
    if (useCompatibility === "minor-variance") out.push(MINOR_VARIANCE);
    if (useCompatibility === "rezoning") out.push(REZONING);
    out.push(TENANT_IMPROVEMENT);
  }

  // Storefront / occupancy permits — these apply regardless of how you took
  // the site, as long as the use needs them.
  out.push(SIGN_PERMIT);
  out.push(BL_BIZLICENSE_GENERAL);

  const cat = USE_PERMITS_BY_CATEGORY[category];
  for (const p of cat.use) out.push(p);

  out.push(FIRE_INSPECTION);
  if (cat.hasPatio) out.push(PATIO_BOULEVARD);

  // De-dupe by id (safety net if we ever add the same permit from two paths).
  const seen = new Set<string>();
  return out.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}
