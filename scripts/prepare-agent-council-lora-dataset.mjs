#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const DATA_DIR = path.resolve(process.env.AGENT_COUNCIL_DATA_DIR || "data/agent-council");
const INDEX_DIR = path.join(DATA_DIR, "index");
const OUT_DIR = path.join(DATA_DIR, "lora");
const EXAMPLES_PER_AGENT = Number(process.env.AGENT_COUNCIL_LORA_EXAMPLES_PER_AGENT || 800);
const MAX_EVIDENCE_CHARS = Number(process.env.AGENT_COUNCIL_LORA_EVIDENCE_CHARS || 1400);

const AGENTS = {
  "building-regulations": {
    system: "You are the Toronto Building Regulations Agent. Use official evidence, identify zoning/permit/code/safety gaps, and avoid legal certification.",
    userTask: "Review this development proposal for Toronto building regulation readiness.",
    focus: ["zoning", "permit", "building code", "safety", "accessibility", "professional review"],
  },
  "business-bursaries": {
    system: "You are the Ontario Business Bursaries Agent. Use official evidence, identify non-dilutive support paths, and avoid inventing deadlines or active programs.",
    userTask: "Review this business proposal for public funding and business support readiness.",
    focus: ["grant eligibility", "applicant structure", "sector", "budget", "intake deadline", "documents"],
  },
  "business-viability": {
    system: "You are the Local Business Viability Agent. Use official evidence to assess nearby businesses, business type fit, staffing, product pricing, parking, accessibility, and customer access.",
    userTask: "Review this business concept for local market and operating-model viability.",
    focus: ["nearby businesses", "business type", "staff quantity", "pricing", "parking", "accessibility"],
  },
  "civil-infrastructure": {
    system: "You are the Civil Infrastructure Agent. Use official evidence to assess traffic, transit, public realm, access, staging, drainage, and safety impacts.",
    userTask: "Review this development proposal for civil infrastructure and mobility readiness.",
    focus: ["traffic", "transit", "road restrictions", "accessibility", "construction staging", "public realm"],
  },
};

function jsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function truncate(value, maxChars) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars - 3)}...` : text;
}

function voteForIndex(index) {
  return index % 5 === 0 ? "needs_revision" : "approve_with_conditions";
}

function buildPrompt(agentId, chunk, agent) {
  const focus = agent.focus.join(", ");
  return `${agent.userTask}

PROJECT CONTEXT:
{
  "projectDescription": "Toronto mixed-use or business proposal requiring council review",
  "location": { "address": "Toronto, Ontario" },
  "businessContext": {
    "businessType": "to be verified",
    "staffQuantity": "to be verified",
    "averageProductPriceCad": "to be verified",
    "parkingSpaces": "to be verified",
    "accessibilityFeatures": []
  }
}

OFFICIAL EVIDENCE:
Title: ${chunk.citation?.title ?? chunk.sourceFile}
Publisher: ${chunk.citation?.publisher ?? "Official source cache"}
Source file: ${chunk.sourceFile}
Excerpt: ${truncate(chunk.text, MAX_EVIDENCE_CHARS)}

TASK:
Return only JSON. Focus on: ${focus}.`;
}

function buildAssistant(agentId, chunk, index, agent) {
  const vote = voteForIndex(index);
  const evidenceLabel = chunk.citation?.title ?? chunk.sourceFile;
  const base = {
    vote,
    recommendation: `Use the cited official evidence from ${evidenceLabel} as context, but verify current applicability before approval.`,
    risks: [
      `The evidence is relevant to ${agent.focus[0]}, but may not prove site-specific compliance or market readiness by itself.`,
      "Missing project-specific facts can change the council recommendation.",
    ],
    missingInformation: agent.focus.slice(0, 4).map((item) => `Project-specific ${item} details`),
    suggestedActions: [
      "Cross-check the cited evidence against current official source pages.",
      "Collect site-specific facts before treating the project as approval-ready.",
      `Ask the ${agentId} reviewer to cite the exact official record used.`,
    ],
    confidence: vote === "needs_revision" ? 0.58 : 0.66,
  };
  return JSON.stringify(base);
}

async function readIndexedChunks(agentId, limit) {
  const filePath = path.join(INDEX_DIR, `${agentId}.jsonl`);
  if (!existsSync(filePath)) return [];

  const chunks = [];
  const stride = Math.max(1, Math.floor((await approximateLineCount(filePath)) / limit));
  let index = 0;
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (index % stride === 0) chunks.push(JSON.parse(line));
    index += 1;
    if (chunks.length >= limit) break;
  }
  return chunks;
}

async function approximateLineCount(filePath) {
  const manifestPath = path.join(INDEX_DIR, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const agent = manifest.agents?.find((item) => path.basename(item.file, ".jsonl") === path.basename(filePath, ".jsonl"));
    if (agent?.count) return agent.count;
  }
  return EXAMPLES_PER_AGENT;
}

async function writeJsonl(filePath, rows) {
  const stream = createWriteStream(filePath, { encoding: "utf8" });
  for (const row of rows) {
    if (!stream.write(jsonLine(row))) {
      await new Promise((resolve) => stream.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => {
    stream.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function main() {
  if (!existsSync(INDEX_DIR)) {
    throw new Error(`Missing index directory: ${INDEX_DIR}. Run npm run build:agent-council-index first.`);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const allRows = [];
  const summary = {
    generatedAt: new Date().toISOString(),
    dataDir: DATA_DIR,
    outputDir: OUT_DIR,
    examplesPerAgentTarget: EXAMPLES_PER_AGENT,
    agents: [],
  };

  for (const [agentId, agent] of Object.entries(AGENTS)) {
    const chunks = await readIndexedChunks(agentId, EXAMPLES_PER_AGENT);
    const rows = chunks.map((chunk, index) => ({
      agent: agentId,
      sourceChunkId: chunk.id,
      messages: [
        { role: "system", content: agent.system },
        { role: "user", content: buildPrompt(agentId, chunk, agent) },
        { role: "assistant", content: buildAssistant(agentId, chunk, index, agent) },
      ],
    }));
    await writeJsonl(path.join(OUT_DIR, `${agentId}.jsonl`), rows);
    allRows.push(...rows);
    summary.agents.push({ agent: agentId, examples: rows.length });
  }

  await writeJsonl(path.join(OUT_DIR, "all.jsonl"), allRows);
  summary.totalExamples = allRows.length;
  await writeFile(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
