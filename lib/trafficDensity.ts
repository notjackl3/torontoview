/**
 * Synthetic traffic-density model for the geospatial Road Traffic layer.
 *
 * No live data — we use a deterministic 24-hour curve modulated by road class
 * and a per-edge hash so the network reads as "busier on the arterials at
 * 8 AM, quiet at 3 AM" without looking uniform. Values are in 0..1, where 0
 * is free-flow and 1 is gridlock.
 */

import type { RoadEdge } from "./roadNetwork";

/**
 * Two-hump curve in 0..1 over hour ∈ [0, 24). Peaks at the morning rush
 * (~8 AM) and the evening rush (~5–6 PM), with a small lunchtime bump and a
 * deep overnight trough.
 */
function timeOfDayLoad(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const gauss = (mu: number, sigma: number, amp: number) =>
    amp * Math.exp(-((h - mu) ** 2) / (2 * sigma * sigma));

  const morning = gauss(8.0, 1.1, 0.92);
  const lunch = gauss(12.5, 1.4, 0.45);
  const evening = gauss(17.5, 1.3, 1.0);
  // Light daytime baseline so midday isn't dead between peaks.
  const baseline = 0.18 + 0.12 * Math.exp(-((h - 13) ** 2) / 28);
  // Suppress everything overnight so 2–4 AM is genuinely empty.
  const night = h < 5 || h > 22 ? 0.0 : 1.0;

  return Math.min(1, (morning + lunch + evening + baseline) * night);
}

/** Road-class weighting: arterials carry the rush, locals barely move. */
function classWeight(speedLimit: number): number {
  if (speedLimit >= 60) return 1.0;
  if (speedLimit >= 50) return 0.85;
  if (speedLimit >= 40) return 0.55;
  return 0.32;
}

/**
 * Stable per-edge pseudo-random offset in [-0.18, 0.18]. Deterministic on the
 * edge id so the same road stays consistently busy/quiet across re-renders
 * and as the user scrubs the time slider.
 */
function edgeVariance(edgeId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < edgeId.length; i++) {
    h ^= edgeId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const u = (h % 10000) / 10000; // 0..1
  return (u - 0.5) * 0.36;
}

/**
 * Density for a single edge at a given hour.
 *   level = clamp01(classWeight * timeCurve + variance)
 * variance is small and edge-stable, so neighbouring streets vary without
 * the network flickering as the hour ticks.
 */
export function trafficLevelForEdge(edge: RoadEdge, hour: number): number {
  const t = timeOfDayLoad(hour);
  const w = classWeight(edge.speedLimit);
  const v = edgeVariance(edge.id);
  return Math.max(0, Math.min(1, w * t + v));
}

/**
 * Green → yellow → red gradient used by the heatmap renderer. Matches the
 * tone of the existing congestion overlay so the two read as the same
 * "traffic" visual language.
 */
export function trafficLevelToColor(level: number): number {
  const t = Math.max(0, Math.min(1, level));
  let r: number, g: number;
  if (t < 0.5) {
    r = Math.round(t * 2 * 255);
    g = 255;
  } else {
    r = 255;
    g = Math.round((1 - (t - 0.5) * 2) * 255);
  }
  return (r << 16) | (g << 8) | 0;
}
