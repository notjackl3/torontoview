import { z } from "zod";

export const RiskSchema = z.object({
  title: z.string(),
  severity: z.enum(["low", "moderate", "high", "critical"]),
  detail: z.string(),
});

export const RecommendationSchema = z.object({
  action: z.string(),
  rationale: z.string(),
  effort: z.enum(["low", "moderate", "high"]).optional(),
});

export const InsightResponseSchema = z.object({
  summary: z.string(),
  risks: z.array(RiskSchema).max(8),
  recommendations: z.array(RecommendationSchema).max(8),
  scores: z.record(z.string(), z.number()).default({}),
});

export type Risk = z.infer<typeof RiskSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type InsightResponse = z.infer<typeof InsightResponseSchema>;

export const ProjectBriefSchema = z.object({
  summary: z.string(),
  verdict: z.enum(["go", "conditional", "rework", "no-go"]),
  score: z.number().min(0).max(100),
  highlights: z.array(z.string()).max(8),
  concerns: z.array(z.string()).max(8),
  nextSteps: z.array(z.string()).max(8),
  bySection: z.object({
    water: z.string().optional(),
    traffic: z.string().optional(),
    shadow: z.string().optional(),
    windNoise: z.string().optional(),
  }),
});

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
