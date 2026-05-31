#!/usr/bin/env node
import { createReadStream, createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const DATA_DIR = path.resolve(process.env.AGENT_COUNCIL_DATA_DIR || "data/agent-council");
const CHUNKS_DIR = path.join(DATA_DIR, "chunks");
const INDEX_DIR = path.join(DATA_DIR, "index");
const MAX_TEXT_CHARS = Number(process.env.AGENT_COUNCIL_INDEX_TEXT_CHARS || 1600);
const MAX_TERMS = Number(process.env.AGENT_COUNCIL_INDEX_TERMS || 120);

const STOP_WORDS = new Set([
  "about", "after", "again", "against", "also", "and", "are", "because", "been", "before", "being", "between",
  "both", "but", "can", "city", "could", "data", "does", "for", "from", "has", "have", "into", "its",
  "may", "more", "not", "official", "only", "ontario", "other", "our", "over", "record", "should", "source",
  "than", "that", "the", "their", "there", "these", "this", "through", "toronto", "under", "use", "using",
  "was", "were", "when", "where", "which", "while", "with", "would", "your",
]);

function tokenize(text) {
  const counts = new Map();
  const matches = String(text ?? "").toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? [];
  for (const token of matches) {
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_TERMS)
    .map(([term, count]) => [term, count]);
}

function compactChunk(chunk) {
  const citation = chunk.citation && typeof chunk.citation === "object" ? chunk.citation : {};
  const text = String(chunk.text ?? "").slice(0, MAX_TEXT_CHARS);
  const termText = [
    chunk.group,
    chunk.kind,
    chunk.sourceFile,
    citation.title,
    citation.publisher,
    text,
  ].filter(Boolean).join(" ");

  return {
    id: chunk.id,
    agent: chunk.agent,
    group: chunk.group,
    kind: chunk.kind,
    sourceFile: chunk.sourceFile,
    recordIndex: chunk.recordIndex,
    text,
    citation: {
      title: citation.title ?? chunk.sourceFile,
      publisher: citation.publisher ?? "Official source cache",
      url: citation.url ?? "",
      package: citation.package,
      resourceId: citation.resourceId,
      sha256: citation.sha256,
    },
    terms: tokenize(termText),
  };
}

async function buildAgentIndex(filePath) {
  const agent = path.basename(filePath, ".jsonl");
  const outPath = path.join(INDEX_DIR, `${agent}.jsonl`);
  const stream = createWriteStream(outPath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let count = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const chunk = JSON.parse(line);
    stream.write(`${JSON.stringify(compactChunk(chunk))}\n`);
    count += 1;
  }

  await new Promise((resolve, reject) => {
    stream.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { agent, file: path.relative(DATA_DIR, outPath).replaceAll("\\", "/"), count };
}

async function main() {
  if (!existsSync(CHUNKS_DIR)) {
    throw new Error(`Missing chunks directory: ${CHUNKS_DIR}. Run npm run prepare:agent-council-corpus first.`);
  }

  await mkdir(INDEX_DIR, { recursive: true });
  const chunkFiles = ["building-regulations", "business-bursaries", "business-viability", "civil-infrastructure"]
    .map((agent) => path.join(CHUNKS_DIR, `${agent}.jsonl`))
    .filter((file) => existsSync(file));

  const agents = [];
  for (const file of chunkFiles) {
    agents.push(await buildAgentIndex(file));
  }

  const summaryPath = path.join(DATA_DIR, "summary.json");
  const corpusSummary = existsSync(summaryPath) ? JSON.parse(await readFile(summaryPath, "utf8")) : null;
  const manifest = {
    generatedAt: new Date().toISOString(),
    dataDir: DATA_DIR,
    sourceSummaryGeneratedAt: corpusSummary?.generatedAt,
    chunkCount: agents.reduce((total, agent) => total + agent.count, 0),
    agents,
    scorer: "lexical-term-frequency-v1",
    maxTextChars: MAX_TEXT_CHARS,
    maxTerms: MAX_TERMS,
  };

  await writeFile(path.join(INDEX_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
