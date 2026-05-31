export type BusinessCategory =
  | "cafe"
  | "full-service-restaurant"
  | "quick-serve-restaurant"
  | "bar"
  | "retail-apparel"
  | "retail-grocery"
  | "salon-spa"
  | "gym-fitness"
  | "medical-clinic"
  | "office-coworking"
  | "bakery"
  | "bookstore";

export const CATEGORY_LABELS: Record<BusinessCategory, string> = {
  cafe: "Café",
  "full-service-restaurant": "Full-service restaurant",
  "quick-serve-restaurant": "Quick-serve restaurant",
  bar: "Bar / pub",
  "retail-apparel": "Apparel retail",
  "retail-grocery": "Grocery / convenience",
  "salon-spa": "Salon / spa",
  "gym-fitness": "Gym / fitness",
  "medical-clinic": "Medical / clinic",
  "office-coworking": "Office / coworking",
  bakery: "Bakery",
  bookstore: "Bookstore",
};

export type PriceTier = "$" | "$$" | "$$$" | "$$$$";
export type ServiceModel = "counter" | "table" | "quick-serve" | "self-serve" | "ecommerce" | "hybrid";
export type MarketingTier = "low" | "medium" | "high";

export interface Product {
  id: string;
  name: string;
  price: number;
  cogsPct: number;
  dailyVolume: number;
}

export interface StaffRole {
  id: string;
  title: string;
  headcount: number;
  hourlyWage: number;
  fullTime: boolean;
}

export interface DayHours {
  open: boolean;
  start: string;
  end: string;
}

export interface BusinessPlan {
  id: string;
  buildingId?: string;
  updatedAt: number;

  concept: {
    name: string;
    category: BusinessCategory | "";
    valueProp: string;
    targetAgeMin: number;
    targetAgeMax: number;
    targetIncomeTier: PriceTier;
    chain: boolean;
  };

  products: Product[];

  operations: {
    hours: Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DayHours>;
    serviceModel: ServiceModel;
    customerAreaSqft: number;
    backOfHouseSqft: number;
    seatingCapacity: number;
    peakTurnRate: number;
    alcoholLicense: boolean;
    liveEntertainment: boolean;
  };

  staffing: {
    roles: StaffRole[];
    founderDraw: number;
    benefitsPct: number;
  };

  financials: {
    capitalOwn: number;
    capitalLoan: number;
    capitalGrants: number;
    loanRatePct: number;
    loanTermMonths: number;
    rent: number;
    utilities: number;
    insurance: number;
    softwarePos: number;
    accounting: number;
    other: number;
    marketingTier: MarketingTier;
    inventoryFloat: number;
    breakEvenMonth: number;
  };
}

const EMPTY_DAY: DayHours = { open: true, start: "09:00", end: "17:00" };

export function emptyPlan(id: string, buildingId?: string): BusinessPlan {
  return {
    id,
    buildingId,
    updatedAt: Date.now(),
    concept: {
      name: "",
      category: "",
      valueProp: "",
      targetAgeMin: 25,
      targetAgeMax: 54,
      targetIncomeTier: "$$",
      chain: false,
    },
    products: [],
    operations: {
      hours: {
        mon: { ...EMPTY_DAY },
        tue: { ...EMPTY_DAY },
        wed: { ...EMPTY_DAY },
        thu: { ...EMPTY_DAY },
        fri: { ...EMPTY_DAY },
        sat: { ...EMPTY_DAY },
        sun: { ...EMPTY_DAY, open: false },
      },
      serviceModel: "counter",
      customerAreaSqft: 1000,
      backOfHouseSqft: 300,
      seatingCapacity: 20,
      peakTurnRate: 15,
      alcoholLicense: false,
      liveEntertainment: false,
    },
    staffing: {
      roles: [],
      founderDraw: 4000,
      benefitsPct: 15,
    },
    financials: {
      capitalOwn: 50000,
      capitalLoan: 100000,
      capitalGrants: 0,
      loanRatePct: 7.5,
      loanTermMonths: 60,
      rent: 6000,
      utilities: 800,
      insurance: 350,
      softwarePos: 250,
      accounting: 400,
      other: 500,
      marketingTier: "medium",
      inventoryFloat: 15000,
      breakEvenMonth: 18,
    },
  };
}

interface CategoryDefaults {
  products: Omit<Product, "id">[];
  serviceModel: ServiceModel;
  customerAreaSqft: number;
  backOfHouseSqft: number;
  seatingCapacity: number;
  peakTurnRate: number;
  alcoholLicense: boolean;
  roles: Omit<StaffRole, "id">[];
  rent: number;
  hoursTemplate: "early" | "standard" | "late" | "alldayfood";
}

export const CATEGORY_DEFAULTS: Record<BusinessCategory, CategoryDefaults> = {
  cafe: {
    products: [
      { name: "Drip coffee", price: 3.5, cogsPct: 18, dailyVolume: 120 },
      { name: "Latte / cappuccino", price: 5.25, cogsPct: 22, dailyVolume: 90 },
      { name: "Pastry", price: 4.25, cogsPct: 35, dailyVolume: 60 },
      { name: "Sandwich", price: 9.5, cogsPct: 40, dailyVolume: 40 },
    ],
    serviceModel: "counter",
    customerAreaSqft: 900,
    backOfHouseSqft: 250,
    seatingCapacity: 18,
    peakTurnRate: 35,
    alcoholLicense: false,
    roles: [
      { title: "Owner / manager", headcount: 1, hourlyWage: 30, fullTime: true },
      { title: "Barista", headcount: 3, hourlyWage: 17.2, fullTime: false },
      { title: "Kitchen prep", headcount: 1, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 5500,
    hoursTemplate: "early",
  },
  "full-service-restaurant": {
    products: [
      { name: "Appetizer (avg)", price: 14, cogsPct: 30, dailyVolume: 50 },
      { name: "Entree (avg)", price: 28, cogsPct: 32, dailyVolume: 80 },
      { name: "Dessert", price: 11, cogsPct: 25, dailyVolume: 30 },
      { name: "Wine / cocktails", price: 13, cogsPct: 22, dailyVolume: 60 },
    ],
    serviceModel: "table",
    customerAreaSqft: 1800,
    backOfHouseSqft: 700,
    seatingCapacity: 60,
    peakTurnRate: 20,
    alcoholLicense: true,
    roles: [
      { title: "General manager", headcount: 1, hourlyWage: 32, fullTime: true },
      { title: "Head chef", headcount: 1, hourlyWage: 30, fullTime: true },
      { title: "Line cook", headcount: 3, hourlyWage: 21, fullTime: true },
      { title: "Server", headcount: 5, hourlyWage: 17.2, fullTime: false },
      { title: "Dishwasher", headcount: 2, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 11000,
    hoursTemplate: "alldayfood",
  },
  "quick-serve-restaurant": {
    products: [
      { name: "Combo meal", price: 12.5, cogsPct: 35, dailyVolume: 180 },
      { name: "Side", price: 3.75, cogsPct: 22, dailyVolume: 200 },
      { name: "Beverage", price: 3, cogsPct: 18, dailyVolume: 220 },
    ],
    serviceModel: "quick-serve",
    customerAreaSqft: 1100,
    backOfHouseSqft: 500,
    seatingCapacity: 30,
    peakTurnRate: 45,
    alcoholLicense: false,
    roles: [
      { title: "Manager", headcount: 1, hourlyWage: 26, fullTime: true },
      { title: "Crew", headcount: 6, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 7500,
    hoursTemplate: "alldayfood",
  },
  bar: {
    products: [
      { name: "Draught beer", price: 9, cogsPct: 22, dailyVolume: 150 },
      { name: "Cocktail", price: 16, cogsPct: 20, dailyVolume: 90 },
      { name: "Wine (glass)", price: 13, cogsPct: 25, dailyVolume: 70 },
      { name: "Bar snacks", price: 12, cogsPct: 30, dailyVolume: 60 },
    ],
    serviceModel: "table",
    customerAreaSqft: 1600,
    backOfHouseSqft: 400,
    seatingCapacity: 50,
    peakTurnRate: 15,
    alcoholLicense: true,
    roles: [
      { title: "Manager", headcount: 1, hourlyWage: 30, fullTime: true },
      { title: "Bartender", headcount: 3, hourlyWage: 17.2, fullTime: false },
      { title: "Server", headcount: 3, hourlyWage: 17.2, fullTime: false },
      { title: "Kitchen", headcount: 2, hourlyWage: 19, fullTime: false },
    ],
    rent: 9500,
    hoursTemplate: "late",
  },
  "retail-apparel": {
    products: [
      { name: "Apparel (avg ticket)", price: 65, cogsPct: 45, dailyVolume: 30 },
      { name: "Accessories", price: 28, cogsPct: 40, dailyVolume: 20 },
    ],
    serviceModel: "self-serve",
    customerAreaSqft: 1400,
    backOfHouseSqft: 300,
    seatingCapacity: 0,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Store manager", headcount: 1, hourlyWage: 28, fullTime: true },
      { title: "Sales associate", headcount: 3, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 8000,
    hoursTemplate: "standard",
  },
  "retail-grocery": {
    products: [
      { name: "Average basket", price: 35, cogsPct: 72, dailyVolume: 200 },
    ],
    serviceModel: "self-serve",
    customerAreaSqft: 2500,
    backOfHouseSqft: 800,
    seatingCapacity: 0,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Store manager", headcount: 1, hourlyWage: 28, fullTime: true },
      { title: "Cashier", headcount: 4, hourlyWage: 17.2, fullTime: false },
      { title: "Stocker", headcount: 3, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 9500,
    hoursTemplate: "alldayfood",
  },
  "salon-spa": {
    products: [
      { name: "Haircut", price: 55, cogsPct: 8, dailyVolume: 18 },
      { name: "Colour", price: 130, cogsPct: 18, dailyVolume: 8 },
      { name: "Treatment", price: 80, cogsPct: 15, dailyVolume: 6 },
    ],
    serviceModel: "table",
    customerAreaSqft: 1100,
    backOfHouseSqft: 200,
    seatingCapacity: 8,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Owner / stylist", headcount: 1, hourlyWage: 35, fullTime: true },
      { title: "Stylist", headcount: 3, hourlyWage: 22, fullTime: false },
      { title: "Receptionist", headcount: 1, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 5800,
    hoursTemplate: "standard",
  },
  "gym-fitness": {
    products: [
      { name: "Monthly membership", price: 89, cogsPct: 5, dailyVolume: 12 },
      { name: "Drop-in class", price: 28, cogsPct: 8, dailyVolume: 20 },
      { name: "Personal training (hr)", price: 90, cogsPct: 55, dailyVolume: 8 },
    ],
    serviceModel: "self-serve",
    customerAreaSqft: 3500,
    backOfHouseSqft: 500,
    seatingCapacity: 0,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Owner / manager", headcount: 1, hourlyWage: 32, fullTime: true },
      { title: "Trainer", headcount: 3, hourlyWage: 28, fullTime: false },
      { title: "Front desk", headcount: 2, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 11500,
    hoursTemplate: "alldayfood",
  },
  "medical-clinic": {
    products: [
      { name: "Standard visit (OHIP)", price: 38, cogsPct: 5, dailyVolume: 40 },
      { name: "Uninsured / extras", price: 95, cogsPct: 10, dailyVolume: 6 },
    ],
    serviceModel: "table",
    customerAreaSqft: 1400,
    backOfHouseSqft: 400,
    seatingCapacity: 12,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Physician", headcount: 2, hourlyWage: 120, fullTime: true },
      { title: "Nurse", headcount: 2, hourlyWage: 42, fullTime: true },
      { title: "Receptionist", headcount: 2, hourlyWage: 22, fullTime: true },
    ],
    rent: 7500,
    hoursTemplate: "standard",
  },
  "office-coworking": {
    products: [
      { name: "Hot desk (monthly)", price: 350, cogsPct: 5, dailyVolume: 2 },
      { name: "Dedicated desk (monthly)", price: 650, cogsPct: 5, dailyVolume: 1 },
      { name: "Private office (monthly)", price: 1400, cogsPct: 5, dailyVolume: 0.5 },
    ],
    serviceModel: "self-serve",
    customerAreaSqft: 4500,
    backOfHouseSqft: 400,
    seatingCapacity: 60,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Community manager", headcount: 1, hourlyWage: 30, fullTime: true },
      { title: "Front desk", headcount: 1, hourlyWage: 20, fullTime: true },
    ],
    rent: 14000,
    hoursTemplate: "standard",
  },
  bakery: {
    products: [
      { name: "Loaf bread", price: 7.5, cogsPct: 28, dailyVolume: 60 },
      { name: "Pastry", price: 4.5, cogsPct: 32, dailyVolume: 120 },
      { name: "Custom cake", price: 65, cogsPct: 35, dailyVolume: 2 },
    ],
    serviceModel: "counter",
    customerAreaSqft: 800,
    backOfHouseSqft: 600,
    seatingCapacity: 8,
    peakTurnRate: 25,
    alcoholLicense: false,
    roles: [
      { title: "Owner / head baker", headcount: 1, hourlyWage: 32, fullTime: true },
      { title: "Baker", headcount: 2, hourlyWage: 22, fullTime: true },
      { title: "Counter staff", headcount: 2, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 5800,
    hoursTemplate: "early",
  },
  bookstore: {
    products: [
      { name: "Book (avg)", price: 22, cogsPct: 55, dailyVolume: 35 },
      { name: "Gifts / stationery", price: 18, cogsPct: 45, dailyVolume: 20 },
      { name: "Café drinks", price: 5, cogsPct: 22, dailyVolume: 40 },
    ],
    serviceModel: "self-serve",
    customerAreaSqft: 1500,
    backOfHouseSqft: 250,
    seatingCapacity: 10,
    peakTurnRate: 0,
    alcoholLicense: false,
    roles: [
      { title: "Owner / manager", headcount: 1, hourlyWage: 28, fullTime: true },
      { title: "Bookseller", headcount: 3, hourlyWage: 17.2, fullTime: false },
    ],
    rent: 6500,
    hoursTemplate: "standard",
  },
};

const HOURS_TEMPLATES: Record<CategoryDefaults["hoursTemplate"], BusinessPlan["operations"]["hours"]> = {
  early: {
    mon: { open: true, start: "06:30", end: "18:00" },
    tue: { open: true, start: "06:30", end: "18:00" },
    wed: { open: true, start: "06:30", end: "18:00" },
    thu: { open: true, start: "06:30", end: "18:00" },
    fri: { open: true, start: "06:30", end: "18:00" },
    sat: { open: true, start: "07:30", end: "18:00" },
    sun: { open: true, start: "07:30", end: "16:00" },
  },
  standard: {
    mon: { open: true, start: "10:00", end: "19:00" },
    tue: { open: true, start: "10:00", end: "19:00" },
    wed: { open: true, start: "10:00", end: "19:00" },
    thu: { open: true, start: "10:00", end: "20:00" },
    fri: { open: true, start: "10:00", end: "20:00" },
    sat: { open: true, start: "10:00", end: "19:00" },
    sun: { open: true, start: "11:00", end: "17:00" },
  },
  late: {
    mon: { open: false, start: "17:00", end: "00:00" },
    tue: { open: true, start: "17:00", end: "00:00" },
    wed: { open: true, start: "17:00", end: "00:00" },
    thu: { open: true, start: "17:00", end: "01:00" },
    fri: { open: true, start: "16:00", end: "02:00" },
    sat: { open: true, start: "16:00", end: "02:00" },
    sun: { open: true, start: "16:00", end: "23:00" },
  },
  alldayfood: {
    mon: { open: true, start: "11:00", end: "22:00" },
    tue: { open: true, start: "11:00", end: "22:00" },
    wed: { open: true, start: "11:00", end: "22:00" },
    thu: { open: true, start: "11:00", end: "22:00" },
    fri: { open: true, start: "11:00", end: "23:00" },
    sat: { open: true, start: "11:00", end: "23:00" },
    sun: { open: true, start: "11:00", end: "21:00" },
  },
};

export function applyCategoryDefaults(
  plan: BusinessPlan,
  category: BusinessCategory,
): BusinessPlan {
  const d = CATEGORY_DEFAULTS[category];
  return {
    ...plan,
    concept: { ...plan.concept, category },
    products: d.products.map((p, i) => ({ ...p, id: `${Date.now()}-${i}` })),
    operations: {
      ...plan.operations,
      hours: HOURS_TEMPLATES[d.hoursTemplate],
      serviceModel: d.serviceModel,
      customerAreaSqft: d.customerAreaSqft,
      backOfHouseSqft: d.backOfHouseSqft,
      seatingCapacity: d.seatingCapacity,
      peakTurnRate: d.peakTurnRate,
      alcoholLicense: d.alcoholLicense,
    },
    staffing: {
      ...plan.staffing,
      roles: d.roles.map((r, i) => ({ ...r, id: `${Date.now()}-${i}` })),
    },
    financials: { ...plan.financials, rent: d.rent },
  };
}

export const WEEKDAYS: { key: keyof BusinessPlan["operations"]["hours"]; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export interface PlanMetrics {
  dailyRevenue: number;
  monthlyRevenue: number;
  monthlyCogs: number;
  monthlyLabor: number;
  monthlyFixed: number;
  monthlyLoanPayment: number;
  monthlyOperatingCost: number;
  monthlyNet: number;
  grossMarginPct: number;
}

export function computePlanMetrics(plan: BusinessPlan): PlanMetrics {
  const dailyRevenue = plan.products.reduce(
    (sum, p) => sum + p.price * p.dailyVolume,
    0,
  );
  const monthlyRevenue = dailyRevenue * 30;
  const monthlyCogs = plan.products.reduce(
    (sum, p) => sum + p.price * p.dailyVolume * (p.cogsPct / 100) * 30,
    0,
  );

  const hoursOpenPerWeek = Object.values(plan.operations.hours).reduce((sum, d) => {
    if (!d.open) return sum;
    const [sh, sm] = d.start.split(":").map(Number);
    const [eh, em] = d.end.split(":").map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    return sum + mins / 60;
  }, 0);

  const monthlyLabor =
    plan.staffing.roles.reduce((sum, r) => {
      const weeklyHours = r.fullTime ? 40 : 24;
      return sum + r.headcount * r.hourlyWage * Math.min(weeklyHours, hoursOpenPerWeek) * 4.33;
    }, 0) * (1 + plan.staffing.benefitsPct / 100) +
    plan.staffing.founderDraw;

  const monthlyFixed =
    plan.financials.rent +
    plan.financials.utilities +
    plan.financials.insurance +
    plan.financials.softwarePos +
    plan.financials.accounting +
    plan.financials.other;

  const r = plan.financials.loanRatePct / 100 / 12;
  const n = plan.financials.loanTermMonths;
  const monthlyLoanPayment =
    plan.financials.capitalLoan > 0 && r > 0
      ? (plan.financials.capitalLoan * r) / (1 - Math.pow(1 + r, -n))
      : 0;

  const monthlyOperatingCost = monthlyCogs + monthlyLabor + monthlyFixed + monthlyLoanPayment;
  const monthlyNet = monthlyRevenue - monthlyOperatingCost;
  const grossMarginPct = monthlyRevenue > 0 ? ((monthlyRevenue - monthlyCogs) / monthlyRevenue) * 100 : 0;

  return {
    dailyRevenue,
    monthlyRevenue,
    monthlyCogs,
    monthlyLabor,
    monthlyFixed,
    monthlyLoanPayment,
    monthlyOperatingCost,
    monthlyNet,
    grossMarginPct,
  };
}
