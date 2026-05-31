import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import type { CouncilAgentId, CouncilReviewRequest, SourceCitation } from "@/lib/agentCouncil";

export interface RetrievedCouncilChunk {
  id: string;
  agent: CouncilAgentId;
  group: string;
  kind: string;
  sourceFile: string;
  recordIndex?: number;
  text: string;
  citation: SourceCitation;
  score: number;
}

interface IndexedChunk {
  id: string;
  agent: CouncilAgentId;
  group: string;
  kind: string;
  sourceFile: string;
  recordIndex?: number;
  text: string;
  citation?: {
    title?: string;
    publisher?: string;
    url?: string;
    resourceId?: string;
    sha256?: string;
  };
  terms?: Array<[string, number]>;
}

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "and", "are", "because", "been", "before", "being", "between",
  "both", "but", "can", "city", "could", "data", "does", "for", "from", "has", "have", "into", "its",
  "may", "more", "not", "official", "only", "ontario", "other", "our", "over", "project", "should", "source",
  "than", "that", "the", "their", "there", "these", "this", "through", "toronto", "under", "use", "using",
  "was", "were", "when", "where", "which", "while", "with", "would", "your",
]);

const DEFAULT_DATA_DIR = path.join(process.cwd(), "data", "agent-council");

function indexDir() {
  return path.resolve(process.env.AGENT_COUNCIL_DATA_DIR || DEFAULT_DATA_DIR, "index");
}

function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  return new Set(tokens.filter((token) => !STOP_WORDS.has(token)));
}

function requestText(request: CouncilReviewRequest, agentId: CouncilAgentId): string {
  const base = [
    request.projectDescription,
    request.location?.address,
    request.location?.ward,
    JSON.stringify(request.buildings ?? []),
    JSON.stringify(request.constraints ?? []),
  ];

  if (agentId === "business-bursaries" || agentId === "business-viability") {
    base.push(JSON.stringify(request.businessContext ?? {}));
  }
  if (agentId === "civil-infrastructure" || agentId === "business-viability") {
    base.push(JSON.stringify(request.transportContext ?? {}));
  }

  return base.filter(Boolean).join(" ");
}

function scoreChunk(queryTerms: Set<string>, chunk: IndexedChunk): number {
  if (!chunk.terms?.length) return 0;
  let score = 0;
  for (const [term, count] of chunk.terms) {
    if (queryTerms.has(term)) score += 1 + Math.log1p(count);
  }
  return score;
}

function citationForChunk(chunk: IndexedChunk): SourceCitation {
  const id = chunk.citation?.resourceId || chunk.id;
  return {
    id,
    title: chunk.citation?.title || chunk.sourceFile,
    publisher: chunk.citation?.publisher || "Official source cache",
    url: chunk.citation?.url || "",
  };
}

function insertTopChunk(top: RetrievedCouncilChunk[], chunk: RetrievedCouncilChunk, limit: number) {
  if (chunk.score <= 0) return;
  top.push(chunk);
  top.sort((a, b) => b.score - a.score);
  if (top.length > limit) top.pop();
}

export async function retrieveCouncilEvidence(
  agentId: CouncilAgentId,
  request: CouncilReviewRequest,
  limit = Number(process.env.AGENT_COUNCIL_RETRIEVAL_LIMIT || 6)
): Promise<RetrievedCouncilChunk[]> {
  const filePath = path.join(indexDir(), `${agentId}.jsonl`);
  if (!existsSync(filePath)) return [];

  const queryTerms = tokenize(requestText(request, agentId));
  if (queryTerms.size === 0) return [];

  const top: RetrievedCouncilChunk[] = [];
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const indexed = JSON.parse(line) as IndexedChunk;
    const score = scoreChunk(queryTerms, indexed);
    insertTopChunk(top, {
      id: indexed.id,
      agent: indexed.agent,
      group: indexed.group,
      kind: indexed.kind,
      sourceFile: indexed.sourceFile,
      recordIndex: indexed.recordIndex,
      text: indexed.text,
      citation: citationForChunk(indexed),
      score,
    }, limit);
  }

  return top;
}

export function formatEvidenceForPrompt(evidence: RetrievedCouncilChunk[]): string {
  if (evidence.length === 0) {
    return "No local corpus evidence was retrieved. Treat this as a missing-information condition and request official-source verification.";
  }

  return evidence.map((chunk, index) => {
    const citation = chunk.citation;
    return `[${index + 1}] ${citation.title} (${citation.publisher})
Source file: ${chunk.sourceFile}${chunk.recordIndex ? ` record ${chunk.recordIndex}` : ""}
Score: ${chunk.score.toFixed(2)}
Excerpt: ${chunk.text}`;
  }).join("\n\n");
}
