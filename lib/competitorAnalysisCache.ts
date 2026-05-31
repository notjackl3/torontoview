/**
 * Per-(plan, competitor) localStorage cache for the AI-generated competitor
 * analysis. Keeps repeat clicks free of LLM cost and lets the map render
 * green pins for analyses that already exist locally.
 */

import type { CompetitorAnalysisResponse } from "@/app/api/competitor-analysis/route";

export interface CachedCompetitorAnalysis extends CompetitorAnalysisResponse {
  /** When the analysis was generated (ms epoch). */
  createdAt: number;
}

const KEY_PREFIX = "tv:competitor-analysis:";

/**
 * Build a stable cache key. We hash the location to 6 decimal places (~10 cm)
 * so floating-point drift between renders doesn't miss the cache, and
 * include the plan id so the same competitor analysed under two different
 * plans gets distinct cached takes.
 */
export function cacheKey(args: {
  planId: string | null | undefined;
  competitorName: string;
  lat: number;
  lng: number;
}): string {
  const plan = args.planId ?? "_no-plan";
  const name = args.competitorName.trim().toLowerCase();
  const lat = args.lat.toFixed(6);
  const lng = args.lng.toFixed(6);
  return `${KEY_PREFIX}${plan}|${name}|${lat},${lng}`;
}

export function readAnalysis(
  key: string,
): CachedCompetitorAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedCompetitorAnalysis;
  } catch {
    return null;
  }
}

export function writeAnalysis(
  key: string,
  value: CompetitorAnalysisResponse,
): void {
  if (typeof window === "undefined") return;
  const payload: CachedCompetitorAnalysis = { ...value, createdAt: Date.now() };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota full, ignore */
  }
}

/**
 * For a list of markers, return the subset whose analyses are already cached
 * locally. Used to color those pins green without re-fetching.
 */
export function listCachedKeys(
  planId: string | null | undefined,
  markers: Array<{ name: string; lat: number; lng: number }>,
): Set<string> {
  if (typeof window === "undefined") return new Set();
  const out = new Set<string>();
  for (const m of markers) {
    const k = cacheKey({
      planId,
      competitorName: m.name,
      lat: m.lat,
      lng: m.lng,
    });
    if (window.localStorage.getItem(k) !== null) out.add(k);
  }
  return out;
}
