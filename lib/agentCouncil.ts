import { formatEvidenceForPrompt, retrieveCouncilEvidence, type RetrievedCouncilChunk } from "@/lib/agentCouncilRetrieval";
import { generateCompletion } from "@/lib/llm/client";
import { extractJsonObject } from "@/lib/llm/json";
import {
  defaultProviderId,
  getProvider,
  isProviderConfigured,
  resolveDefaultModel,
  type LlmProviderId,
} from "@/lib/llm/providers";

export interface CouncilLlmPreferences {
  provider: LlmProviderId;
  model: string;
}

export type CouncilVote = "approve" | "approve_with_conditions" | "needs_revision" | "blocker";

export interface CouncilLocation {
  address?: string;
  lat?: number;
  lng?: number;
  ward?: string;
}

export interface CouncilBuilding {
  id?: string;
  description?: string;
  zoneType?: string;
  floors?: number;
  heightM?: number;
  footprintM2?: number;
  grossFloorAreaM2?: number;
  intendedUse?: string;
}

export interface BusinessContext {
  applicantType?: string;
  sector?: string;
  businessType?: string;
  projectStage?: string;
  budgetCad?: number;
  fundingGoal?: string;
  employeeCount?: number;
  staffQuantity?: number;
  averageProductPriceCad?: number;
  priceRangeCad?: { min?: number; max?: number };
  expectedDailyCustomers?: number;
  nearbyCompetitors?: string[];
  parkingSpaces?: number;
  accessibilityFeatures?: string[];
}

export interface TransportContext {
  affectedRoads?: string[];
  nearbyTransit?: string[];
  dailyTripsEstimate?: number;
  constructionStartDate?: string;
  constructionDurationDays?: number;
  accessibilityConcerns?: string[];
}

export interface CouncilReviewRequest {
  projectDescription: string;
  location?: CouncilLocation;
  buildings?: CouncilBuilding[];
  businessContext?: BusinessContext;
  transportContext?: TransportContext;
  constraints?: string[];
}

export interface SourceCitation {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

export interface AgentReview {
  id: CouncilAgentId;
  name: string;
  role: string;
  vote: CouncilVote;
  recommendation: string;
  risks: string[];
  missingInformation: string[];
  suggestedActions: string[];
  citedSources: SourceCitation[];
  confidence: number;
  evidence: RetrievedEvidenceSummary[];
}

export interface RetrievedEvidenceSummary {
  id: string;
  title: string;
  publisher: string;
  url: string;
  sourceFile: string;
  score: number;
}

export interface CouncilDecision {
  vote: CouncilVote;
  summary: string;
  blockers: string[];
  conditions: string[];
  growthOpportunities: string[];
  nextSteps: string[];
  confidence: number;
}

export interface CouncilAudit {
  runtime: LlmProviderId | "deterministic-fallback" | "mixed";
  model: string;
  endpoint?: string;
  nvidiaStack: string[];
  adapterIds: string[];
  retrievalPolicy: "official_sources_only";
  retrieval: {
    enabled: boolean;
    indexDir: string;
    chunksRetrieved: number;
  };
  corpusVersion: string;
  generatedAt: string;
}

export interface CouncilReviewResponse {
  agents: AgentReview[];
  councilDecision: CouncilDecision;
  audit: CouncilAudit;
}

export type CouncilAgentId =
  | "building-regulations"
  | "business-bursaries"
  | "civil-infrastructure"
  | "business-viability";

interface CouncilAgentDefinition {
  id: CouncilAgentId;
  name: string;
  role: string;
  adapterId: string;
  systemPrompt: string;
  sourceIds: string[];
}

interface NimChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const CORPUS_VERSION = "official-toronto-ontario-v1";

const OFFICIAL_SOURCES: Record<string, SourceCitation> = {
  torontoZoning: {
    id: "toronto-zoning",
    title: "City of Toronto Zoning By-law and zoning information",
    publisher: "City of Toronto",
    url: "https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/",
  },
  torontoBuildingPermits: {
    id: "toronto-building-permits",
    title: "Building permits and inspections",
    publisher: "City of Toronto",
    url: "https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/",
  },
  ontarioBuildingCode: {
    id: "ontario-building-code",
    title: "Ontario Building Code",
    publisher: "Government of Ontario",
    url: "https://www.ontario.ca/page/ontarios-building-code",
  },
  ontarioBusinessGrants: {
    id: "ontario-business-grants",
    title: "Business grants and financing",
    publisher: "Government of Ontario",
    url: "https://www.ontario.ca/page/business-grants-and-financing",
  },
  torontoBusinessSupport: {
    id: "toronto-business-support",
    title: "Business support and resources",
    publisher: "City of Toronto",
    url: "https://www.toronto.ca/business-economy/business-operation-growth/business-support/",
  },
  ttcService: {
    id: "ttc-service",
    title: "TTC service information",
    publisher: "Toronto Transit Commission",
    url: "https://www.ttc.ca/",
  },
  metrolinx: {
    id: "metrolinx",
    title: "Regional transit planning and projects",
    publisher: "Metrolinx",
    url: "https://www.metrolinx.com/",
  },
  torontoRoadRestrictions: {
    id: "toronto-road-restrictions",
    title: "Road restrictions, closures, and permits",
    publisher: "City of Toronto",
    url: "https://www.toronto.ca/services-payments/streets-parking-transportation/road-restrictions-closures/",
  },
  torontoOpenData: {
    id: "toronto-open-data",
    title: "Open Data Catalogue",
    publisher: "City of Toronto",
    url: "https://open.toronto.ca/",
  },
  torontoBusinessLicences: {
    id: "toronto-business-licences",
    title: "Municipal Licensing and Standards business licences and permits",
    publisher: "City of Toronto Open Data",
    url: "https://open.toronto.ca/",
  },
  torontoEmploymentSurvey: {
    id: "toronto-employment-survey",
    title: "Toronto Employment Survey summary tables",
    publisher: "City of Toronto Open Data",
    url: "https://open.toronto.ca/",
  },
  torontoBusinessImprovementAreas: {
    id: "toronto-business-improvement-areas",
    title: "Business Improvement Areas",
    publisher: "City of Toronto Open Data",
    url: "https://open.toronto.ca/",
  },
};

const AGENTS: CouncilAgentDefinition[] = [
  {
    id: "building-regulations",
    name: "Toronto Building Regulations Agent",
    role: "Legal and safety reviewer for Toronto development, zoning, permits, and Ontario Building Code awareness.",
    adapterId: "toronto-building-regulations-lora",
    sourceIds: ["torontoZoning", "torontoBuildingPermits", "ontarioBuildingCode"],
    systemPrompt:
      "You are a Toronto building regulation reviewer. Review only against official City of Toronto and Government of Ontario sources supplied in context. Identify zoning, permit, safety, and missing-professional-review issues. You provide decision support, not legal certification.",
  },
  {
    id: "business-bursaries",
    name: "Ontario Business Bursaries Agent",
    role: "Growth reviewer for Ontario and City of Toronto business grants, bursaries, financing, and eligibility paths.",
    adapterId: "ontario-business-bursaries-lora",
    sourceIds: ["ontarioBusinessGrants", "torontoBusinessSupport"],
    systemPrompt:
      "You are an Ontario business support reviewer. Use only official Ontario and City of Toronto sources supplied in context. Identify likely funding paths, eligibility questions, deadlines to verify, and non-dilutive growth opportunities. Do not invent active programs or deadlines.",
  },
  {
    id: "civil-infrastructure",
    name: "Civil Infrastructure Agent",
    role: "Civil engineering reviewer for traffic, transit, public realm, access, construction disruption, and infrastructure impacts.",
    adapterId: "civil-infrastructure-toronto-lora",
    sourceIds: ["ttcService", "metrolinx", "torontoRoadRestrictions", "torontoOpenData"],
    systemPrompt:
      "You are a civil infrastructure reviewer for Toronto. Use only official municipal, TTC, Metrolinx, and open data sources supplied in context. Review traffic, transit, accessibility, construction staging, drainage, public realm, and safety concerns. You provide planning support, not a stamped engineering report.",
  },
  {
    id: "business-viability",
    name: "Local Business Viability Agent",
    role: "Market and operating-model reviewer for nearby businesses, business type fit, staffing, product pricing, parking, and accessibility.",
    adapterId: "local-business-viability-toronto-lora",
    sourceIds: [
      "torontoBusinessLicences",
      "torontoEmploymentSurvey",
      "torontoBusinessImprovementAreas",
      "torontoOpenData",
      "torontoRoadRestrictions",
    ],
    systemPrompt:
      "You are a local business viability reviewer for Toronto. Use official municipal open data and supplied project context to assess nearby business activity, business type fit, staffing assumptions, product pricing, parking, accessibility, customer access, and operational risks. Do not invent competitor counts, prices, or demand; flag missing market research when official or supplied evidence is insufficient.",
  },
];

function getAgentSources(agent: CouncilAgentDefinition): SourceCitation[] {
  return agent.sourceIds.map((id) => OFFICIAL_SOURCES[id]).filter(Boolean);
}

function clampConfidence(value: unknown, fallback = 0.68): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(1, Math.max(0, numberValue));
}

function parseVote(value: unknown): CouncilVote {
  if (
    value === "approve" ||
    value === "approve_with_conditions" ||
    value === "needs_revision" ||
    value === "blocker"
  ) {
    return value;
  }
  return "needs_revision";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function evidenceToSummary(evidence: RetrievedCouncilChunk[]): RetrievedEvidenceSummary[] {
  return evidence.map((chunk) => ({
    id: chunk.id,
    title: chunk.citation.title,
    publisher: chunk.citation.publisher,
    url: chunk.citation.url,
    sourceFile: chunk.sourceFile,
    score: Number(chunk.score.toFixed(2)),
  }));
}

function uniqueCitations(sources: SourceCitation[], evidence: RetrievedCouncilChunk[]): SourceCitation[] {
  const byId = new Map<string, SourceCitation>();
  for (const source of sources) byId.set(source.id, source);
  for (const chunk of evidence) {
    const id = chunk.citation.id || chunk.id;
    if (!byId.has(id)) byId.set(id, { ...chunk.citation, id });
  }
  return [...byId.values()].slice(0, 12);
}

function normalizeAgentReview(
  agent: CouncilAgentDefinition,
  raw: unknown,
  fallback: AgentReview,
  evidence: RetrievedCouncilChunk[]
): AgentReview {
  if (!raw || typeof raw !== "object") return fallback;
  const record = raw as Record<string, unknown>;
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    vote: parseVote(record.vote),
    recommendation:
      typeof record.recommendation === "string" && record.recommendation.trim()
        ? record.recommendation
        : fallback.recommendation,
    risks: toStringArray(record.risks),
    missingInformation: toStringArray(record.missingInformation),
    suggestedActions: toStringArray(record.suggestedActions),
    citedSources: uniqueCitations(getAgentSources(agent), evidence),
    confidence: clampConfidence(record.confidence, fallback.confidence),
    evidence: evidenceToSummary(evidence),
  };
}

function buildUserPrompt(agent: CouncilAgentDefinition, request: CouncilReviewRequest, evidence: RetrievedCouncilChunk[]): string {
  const sources = getAgentSources(agent)
    .map((source) => `- ${source.id}: ${source.title} (${source.publisher}) ${source.url}`)
    .join("\n");

  return `Review this TorontoView project as ${agent.name}.

OFFICIAL SOURCE ALLOWLIST:
${sources}

LOCAL OFFICIAL CORPUS EVIDENCE:
${formatEvidenceForPrompt(evidence)}

PROJECT CONTEXT:
${JSON.stringify(request, null, 2)}

Return only valid JSON with this exact shape:
{
  "vote": "approve|approve_with_conditions|needs_revision|blocker",
  "recommendation": "brief decision-support recommendation",
  "risks": ["risk"],
  "missingInformation": ["missing item"],
  "suggestedActions": ["action"],
  "confidence": 0.0
}

Rules:
- Use only the official source allowlist for factual legal, funding, transit, or infrastructure claims.
- Use the local corpus evidence when relevant, but do not overstate what an excerpt proves.
- If a fact needs verification from live official pages, put it in missingInformation or suggestedActions.
- Do not claim professional certification.
- Prefer conservative review when information is missing.`;
}

async function callNimJson(
  messages: NimChatMessage[],
  adapterId: string,
  providerId: LlmProviderId,
  fallbackModel: string,
): Promise<unknown> {
  // DGX routing follows the plan in docs/NVIDIA_STACK.md:
  //   - If DGX_INFERENCE_MODEL is explicitly set, we treat the DGX as serving
  //     a single shared LoRA under that name (Phase 1 Option B). Every agent
  //     sends the same model string.
  //   - Otherwise we send the agent's adapterId, which matches the multi-LoRA
  //     PEFT layout (Phase 1 Option A) — NIM routes per-adapter from there.
  // For hosted providers we always send the catalog/header-selected model.
  let model: string;
  if (providerId === "nvidia-dgx") {
    const sharedOverride = process.env.DGX_INFERENCE_MODEL;
    model = sharedOverride && sharedOverride.trim().length > 0 ? sharedOverride : adapterId;
  } else {
    model = fallbackModel;
  }

  const { text } = await generateCompletion({
    provider: providerId,
    model,
    messages,
    temperature: 0.2,
    maxTokens: 900,
  });

  const parsed = extractJsonObject(text);
  if (parsed === null) {
    throw new Error(`Agent ${adapterId} returned unparseable JSON: ${text.slice(0, 200)}`);
  }
  return parsed;
}

function fallbackAgentReview(agent: CouncilAgentDefinition, request: CouncilReviewRequest, evidence: RetrievedCouncilChunk[] = []): AgentReview {
  const sources = uniqueCitations(getAgentSources(agent), evidence);
  const buildings = request.buildings ?? [];
  const evidenceSummary = evidence.length > 0
    ? ` Retrieved ${evidence.length} relevant official corpus chunks for this review.`
    : " No local corpus evidence was retrieved, so official-source verification is required.";

  if (agent.id === "building-regulations") {
    const tallBuilding = buildings.some((building) => (building.heightM ?? 0) >= 30 || (building.floors ?? 0) >= 10);
    const missingZone = buildings.length === 0 || buildings.some((building) => !building.zoneType);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      vote: missingZone || tallBuilding ? "needs_revision" : "approve_with_conditions",
      recommendation:
        `Proceed only after confirming zoning, permit pathway, and Ontario Building Code implications with official City/Ontario review.${evidenceSummary}`,
      risks: [
        ...(missingZone ? ["Zoning designation is missing for at least one proposed building."] : []),
        ...(tallBuilding ? ["Tall-building scale may trigger additional code, planning, shadow, wind, and safety review."] : []),
      ],
      missingInformation: [
        "Confirmed municipal address or parcel identifier.",
        "Applicable zoning by-law designation and overlays.",
        "Permit class and required drawings or professional sign-offs.",
      ],
      suggestedActions: [
        "Verify zoning and permit requirements on official City of Toronto pages.",
        "Have qualified professionals review code, fire safety, accessibility, and structural requirements.",
      ],
      citedSources: sources,
      confidence: 0.64,
      evidence: evidenceToSummary(evidence),
    };
  }

  if (agent.id === "business-bursaries") {
    const hasBusinessContext = Boolean(request.businessContext?.applicantType || request.businessContext?.sector);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      vote: hasBusinessContext ? "approve_with_conditions" : "needs_revision",
      recommendation:
        `There may be Ontario or Toronto business-support paths, but eligibility should be checked against official program pages before relying on funding.${evidenceSummary}`,
      risks: ["Grant and bursary availability, intake windows, and eligibility can change without notice."],
      missingInformation: [
        "Applicant legal structure and location.",
        "Sector, employee count, project budget, and funding objective.",
        "Current official program intake dates.",
      ],
      suggestedActions: [
        "Match the project against Ontario business grants and City of Toronto business support programs.",
        "Capture program URL, eligibility criteria, deadline, and required documents for each candidate.",
      ],
      citedSources: sources,
      confidence: hasBusinessContext ? 0.62 : 0.48,
      evidence: evidenceToSummary(evidence),
    };
  }

  if (agent.id === "civil-infrastructure") {
    const highTrips = (request.transportContext?.dailyTripsEstimate ?? 0) > 100;
    const roadImpacts = Boolean(request.transportContext?.affectedRoads?.length);
    return {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      vote: highTrips || roadImpacts ? "needs_revision" : "approve_with_conditions",
      recommendation:
        `Treat traffic, transit, pedestrian access, and construction staging as approval conditions until official road and transit impacts are checked.${evidenceSummary}`,
      risks: [
        ...(highTrips ? ["Daily trip estimate suggests potential local congestion or curbside pressure."] : []),
        ...(roadImpacts ? ["Affected roads may require closure, staging, or right-of-way permits."] : []),
        "Construction could disrupt sidewalks, accessibility routes, deliveries, TTC access, or emergency access.",
      ],
      missingInformation: [
        "Nearest TTC and regional transit stops or routes.",
        "Construction staging plan and right-of-way occupancy needs.",
        "Accessibility, pedestrian, cycling, loading, and emergency access impacts.",
      ],
      suggestedActions: [
        "Check official road restriction and TTC/Metrolinx service information for the project area.",
        "Run a traffic and access review before public consultation or permit submission.",
      ],
      citedSources: sources,
      confidence: 0.6,
      evidence: evidenceToSummary(evidence),
    };
  }

  const staffCount = request.businessContext?.staffQuantity ?? request.businessContext?.employeeCount ?? 0;
  const hasPricing = Boolean(request.businessContext?.averageProductPriceCad || request.businessContext?.priceRangeCad);
  const hasParking = typeof request.businessContext?.parkingSpaces === "number";
  const hasBusinessType = Boolean(request.businessContext?.businessType || request.businessContext?.sector);
  const accessibilityFeatures = request.businessContext?.accessibilityFeatures ?? request.transportContext?.accessibilityConcerns ?? [];
  const missingOperationalInfo = !hasBusinessType || staffCount <= 0 || !hasPricing || !hasParking || accessibilityFeatures.length === 0;

  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    vote: missingOperationalInfo ? "needs_revision" : "approve_with_conditions",
    recommendation:
      `Validate business fit against nearby commercial activity, staffing, pricing, parking, accessibility, and expected customer access before treating the concept as market-ready.${evidenceSummary}`,
    risks: [
      ...(!hasBusinessType ? ["Business type or sector is missing, so local fit cannot be evaluated."] : []),
      ...(staffCount <= 0 ? ["Staffing quantity is missing, so operating capacity and payroll exposure are unknown."] : []),
      ...(!hasPricing ? ["Product pricing is missing, so affordability and revenue assumptions cannot be tested."] : []),
      ...(!hasParking ? ["Parking supply is missing, so customer and staff access risk cannot be evaluated."] : []),
      ...(accessibilityFeatures.length === 0 ? ["Accessibility features are missing, which can limit customer access and compliance planning."] : []),
    ],
    missingInformation: [
      "Nearby comparable businesses and business improvement area context.",
      "Business type, target customer, expected daily customers, staff quantity, and operating hours.",
      "Product or service price range and affordability assumptions.",
      "Parking, loading, transit access, and accessible entrance/washroom/service details.",
    ],
    suggestedActions: [
      "Compare the proposal against nearby business licence, BIA, and employment survey records.",
      "Create a simple staffing, pricing, parking, and accessibility operating checklist before launch.",
      "Use customer access findings to refine hours, staffing levels, product mix, and pricing assumptions.",
    ],
    citedSources: sources,
    confidence: missingOperationalInfo ? 0.52 : 0.66,
    evidence: evidenceToSummary(evidence),
  };
}

interface AgentReviewResult {
  review: AgentReview;
  runtime: LlmProviderId | "deterministic-fallback";
  model: string;
}

function buildProviderChain(prefs: CouncilLlmPreferences): Array<{ provider: LlmProviderId; model: string }> {
  // Walk through providers in preference order, skipping any not configured.
  // This is what makes the Mac demo robust: if DGX_INFERENCE_BASE_URL is unset
  // or unreachable, we transparently fall through to the hosted NIM (or any
  // other provider with an API key set) before giving up to the deterministic
  // fallback. The audit reports the runtime that actually answered.
  const ordered: LlmProviderId[] = [];
  ordered.push(prefs.provider);
  for (const candidate of ["nvidia-dgx", "nvidia-nim", "openai", "local"] as LlmProviderId[]) {
    if (!ordered.includes(candidate)) ordered.push(candidate);
  }
  return ordered
    .filter((providerId) => isProviderConfigured(getProvider(providerId)))
    .map((providerId) => ({
      provider: providerId,
      model: providerId === prefs.provider ? prefs.model : resolveDefaultModel(getProvider(providerId)),
    }));
}

async function reviewWithAgent(
  agent: CouncilAgentDefinition,
  request: CouncilReviewRequest,
  prefs: CouncilLlmPreferences,
): Promise<AgentReviewResult> {
  const evidence = await retrieveCouncilEvidence(agent.id, request);
  const deterministic = fallbackAgentReview(agent, request, evidence);
  const chain = buildProviderChain(prefs);

  if (chain.length === 0) {
    return { review: deterministic, runtime: "deterministic-fallback", model: prefs.model };
  }

  let lastError: unknown;
  for (const attempt of chain) {
    try {
      const raw = await callNimJson(
        [
          { role: "system", content: agent.systemPrompt },
          { role: "user", content: buildUserPrompt(agent, request, evidence) },
        ],
        agent.adapterId,
        attempt.provider,
        attempt.model,
      );
      return {
        review: normalizeAgentReview(agent, raw, deterministic, evidence),
        runtime: attempt.provider,
        model: attempt.provider === "nvidia-dgx" && !process.env.DGX_INFERENCE_MODEL ? agent.adapterId : attempt.model,
      };
    } catch (error) {
      lastError = error;
      console.error(`${agent.id} review via ${attempt.provider} failed; trying next provider in chain:`, error);
    }
  }

  if (lastError) console.error(`${agent.id} fell through to deterministic fallback after chain exhausted.`);
  return { review: deterministic, runtime: "deterministic-fallback", model: prefs.model };
}

function voteRank(vote: CouncilVote): number {
  return {
    approve: 0,
    approve_with_conditions: 1,
    needs_revision: 2,
    blocker: 3,
  }[vote];
}

function decideCouncil(agents: AgentReview[]): CouncilDecision {
  const finalVote = agents.reduce<CouncilVote>(
    (current, agent) => (voteRank(agent.vote) > voteRank(current) ? agent.vote : current),
    "approve"
  );
  const blockers = agents
    .filter((agent) => agent.vote === "blocker")
    .flatMap((agent) => agent.risks);
  const conditions = agents
    .filter((agent) => agent.vote !== "approve")
    .flatMap((agent) => agent.suggestedActions)
    .slice(0, 8);
  const missing = agents.flatMap((agent) => agent.missingInformation).slice(0, 8);
  const confidence = agents.reduce((total, agent) => total + agent.confidence, 0) / Math.max(agents.length, 1);

  return {
    vote: finalVote,
    summary:
      finalVote === "approve"
        ? "The council found no major blockers in the supplied context, while preserving source verification requirements."
        : "The council recommends revision or conditional review before this project is treated as legally, financially, or infrastructure-ready.",
    blockers,
    conditions,
    growthOpportunities: [
      "Use the bursaries agent output to create a live official-source funding checklist.",
      "Use the business viability agent output to tune product mix, pricing, staffing, parking, and accessibility assumptions.",
      "Package the regulatory and infrastructure findings into a consultation-ready project brief.",
    ],
    nextSteps: [
      ...missing,
      "Run the same request against DGX Spark NIM once NVIDIA_NIM_BASE_URL and LoRA adapters are configured.",
    ].slice(0, 10),
    confidence: clampConfidence(confidence),
  };
}

function resolveCouncilPreferences(prefs?: Partial<CouncilLlmPreferences>): CouncilLlmPreferences {
  // The council prefers the DGX-served LoRA when available (that's the
  // toronto-council-lora trained in training/agent-council-lora). Otherwise
  // it falls back to NIM, then to whatever the user has configured.
  if (prefs?.provider) {
    const providerId = prefs.provider;
    const provider = getProvider(providerId);
    return {
      provider: providerId,
      model: prefs.model ?? resolveDefaultModel(provider),
    };
  }

  if (isProviderConfigured(getProvider("nvidia-dgx"))) {
    return {
      provider: "nvidia-dgx",
      model: resolveDefaultModel(getProvider("nvidia-dgx")),
    };
  }
  if (isProviderConfigured(getProvider("nvidia-nim"))) {
    return {
      provider: "nvidia-nim",
      model: resolveDefaultModel(getProvider("nvidia-nim")),
    };
  }
  const fallbackProviderId = defaultProviderId();
  return {
    provider: fallbackProviderId,
    model: resolveDefaultModel(getProvider(fallbackProviderId)),
  };
}

export async function reviewCouncil(
  request: CouncilReviewRequest,
  prefsOverride?: Partial<CouncilLlmPreferences>,
): Promise<CouncilReviewResponse> {
  const prefs = resolveCouncilPreferences(prefsOverride);
  const results = await Promise.all(AGENTS.map((agent) => reviewWithAgent(agent, request, prefs)));
  const agents = results.map((result) => result.review);

  // Audit reports the runtime that actually answered. If all four agents went
  // through the same provider we name it; if the chain split (e.g. DGX answered
  // some agents and NIM answered others, or some fell through to deterministic)
  // we mark it "mixed" so the demo doesn't claim a single source of truth.
  const runtimes = new Set(results.map((result) => result.runtime));
  const runtime: LlmProviderId | "deterministic-fallback" | "mixed" =
    runtimes.size === 1 ? (results[0]?.runtime ?? "deterministic-fallback") : "mixed";

  // Endpoint comes from whichever provider actually answered (best-effort —
  // for "mixed" we just report the requested provider's endpoint).
  const endpointProviderId = runtimes.size === 1 && results[0]?.runtime !== "deterministic-fallback"
    ? (results[0]!.runtime as LlmProviderId)
    : prefs.provider;
  const endpointProvider = getProvider(endpointProviderId);
  const auditModel = runtimes.size === 1 ? (results[0]?.model ?? prefs.model) : prefs.model;
  const chunksRetrieved = agents.reduce((total, agent) => total + agent.evidence.length, 0);

  return {
    agents,
    councilDecision: decideCouncil(agents),
    audit: {
      runtime,
      model: auditModel,
      endpoint: process.env[endpointProvider.baseUrlEnv] ?? endpointProvider.defaultBaseUrl ?? undefined,
      nvidiaStack: ["NVIDIA DGX Spark", "NVIDIA NIM", "NVIDIA NeMo LoRA", "official-source RAG"],
      adapterIds: AGENTS.map((agent) => agent.adapterId),
      retrievalPolicy: "official_sources_only",
      retrieval: {
        enabled: chunksRetrieved > 0,
        indexDir: process.env.AGENT_COUNCIL_DATA_DIR
          ? `${process.env.AGENT_COUNCIL_DATA_DIR.replace(/\/$/, "")}/index`
          : "data/agent-council/index",
        chunksRetrieved,
      },
      corpusVersion: CORPUS_VERSION,
      generatedAt: new Date().toISOString(),
    },
  };
}
