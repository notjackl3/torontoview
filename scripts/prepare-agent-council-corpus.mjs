#!/usr/bin/env node
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const SOURCE_DIR = path.resolve(process.env.TORONTO_DATA_DIR || "data/official-toronto");
const OUT_DIR = path.resolve(process.env.AGENT_COUNCIL_DATA_DIR || "data/agent-council");
const MAX_CHARS = Number(process.env.AGENT_COUNCIL_CHUNK_CHARS || 1800);
const ROWS_PER_CHUNK = Number(process.env.AGENT_COUNCIL_ROWS_PER_CHUNK || 20);
const MAX_ZIP_FILES = Number(process.env.AGENT_COUNCIL_MAX_ZIP_FILES || 16);

const AGENT_BY_GROUP = {
  "building-regulations": "building-regulations",
  "business-bursaries": "business-bursaries",
  "lot-business-history": "business-bursaries",
  "civil-infrastructure": "civil-infrastructure",
  "population": "civil-infrastructure",
  "commercial-recreation-hotspots": "civil-infrastructure",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => String(item).trim()));
}

function rowsToRecords(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((header, index) => cleanText(header) || `column_${index + 1}`);
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      const value = cleanText(row[index] ?? "");
      if (value) record[header] = value;
    });
    return record;
  });
}

function summarizeRecord(record) {
  return Object.entries(record)
    .filter(([, value]) => value !== "")
    .slice(0, 24)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function chunkText(text, maxChars = MAX_CHARS) {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  const chunks = [];
  for (let start = 0; start < cleaned.length; start += maxChars) {
    chunks.push(cleaned.slice(start, start + maxChars));
  }
  return chunks;
}

function groupFromFile(file) {
  return file.split("__")[0] || "unknown";
}

function agentFromGroup(group) {
  return AGENT_BY_GROUP[group] || "civil-infrastructure";
}

function citationForFile(manifest, relativeFile) {
  for (const dataset of manifest.datasets ?? []) {
    for (const resource of dataset.resources ?? []) {
      if (resource.file === relativeFile) {
        return {
          title: `${dataset.package}: ${resource.name}`,
          publisher: "City of Toronto Open Data",
          url: resource.url,
          package: dataset.package,
          resourceId: resource.id,
          group: dataset.group,
          sha256: resource.sha256,
        };
      }
    }
  }

  for (const page of manifest.pages ?? []) {
    if (page.file === relativeFile) {
      return {
        title: page.title,
        publisher: page.url.includes("ontario.ca")
          ? "Government of Ontario"
          : page.url.includes("ttc.ca")
            ? "Toronto Transit Commission"
            : page.url.includes("metrolinx.com")
              ? "Metrolinx"
              : "City of Toronto",
        url: page.url,
        group: page.group,
        sha256: page.sha256,
      };
    }
  }

  return {
    title: relativeFile,
    publisher: "Official source cache",
    url: "",
    group: groupFromFile(path.basename(relativeFile)),
  };
}

function makeChunk({ agent, group, text, citation, sourceFile, recordIndex, kind }) {
  const normalized = cleanText(text);
  if (!normalized) return null;
  const id = sha256(`${agent}|${sourceFile}|${recordIndex ?? ""}|${normalized}`).slice(0, 24);
  return {
    id,
    agent,
    group,
    kind,
    sourceFile,
    recordIndex,
    text: normalized,
    citation,
  };
}

function chunksFromRecords({ records, citation, sourceFile, group, kind }) {
  const agent = agentFromGroup(group);
  const chunks = [];
  for (let i = 0; i < records.length; i += ROWS_PER_CHUNK) {
    const slice = records.slice(i, i + ROWS_PER_CHUNK);
    const text = slice.map((record, offset) => `Record ${i + offset + 1}: ${summarizeRecord(record)}`).join("\n");
    const chunk = makeChunk({
      agent,
      group,
      text,
      citation,
      sourceFile,
      recordIndex: i + 1,
      kind,
    });
    if (chunk) chunks.push(chunk);
  }
  return chunks;
}

function chunksFromWorkbook(buffer, context) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const chunks = [];
  for (const sheetName of workbook.SheetNames.slice(0, 8)) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", raw: false });
    const sheetChunks = chunksFromRecords({
      ...context,
      records: rows,
      kind: `workbook:${sheetName}`,
    });
    chunks.push(...sheetChunks);
  }
  return chunks;
}

function chunksFromJson(buffer, context) {
  const parsed = JSON.parse(buffer.toString("utf8"));
  if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
    const records = parsed.features.map((feature) => ({
      geometryType: feature.geometry?.type,
      ...feature.properties,
    }));
    return chunksFromRecords({ ...context, records, kind: "geojson" });
  }

  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.result?.records)
      ? parsed.result.records
      : Array.isArray(parsed?.records)
        ? parsed.records
        : null;

  if (records) return chunksFromRecords({ ...context, records, kind: "json" });
  return chunkText(JSON.stringify(parsed, null, 2)).map((text, index) =>
    makeChunk({ ...context, text, recordIndex: index + 1, kind: "json-document" })
  ).filter(Boolean);
}

function chunksFromZip(buffer, context) {
  const zip = new AdmZip(buffer);
  const chunks = [];
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .filter((entry) => /\.(csv|json|geojson|txt)$/i.test(entry.entryName))
    .slice(0, MAX_ZIP_FILES);

  for (const entry of entries) {
    const entryBuffer = entry.getData();
    const entryContext = {
      ...context,
      sourceFile: `${context.sourceFile}#${entry.entryName}`,
    };
    if (/\.csv$/i.test(entry.entryName)) {
      chunks.push(...chunksFromRecords({
        ...entryContext,
        records: rowsToRecords(parseCsv(entryBuffer.toString("utf8"))),
        kind: "zip-csv",
      }));
    } else if (/\.(json|geojson)$/i.test(entry.entryName)) {
      try {
        chunks.push(...chunksFromJson(entryBuffer, entryContext));
      } catch {
        chunks.push(...chunkText(entryBuffer.toString("utf8")).map((text, index) =>
          makeChunk({ ...entryContext, text, recordIndex: index + 1, kind: "zip-text" })
        ).filter(Boolean));
      }
    } else {
      chunks.push(...chunkText(entryBuffer.toString("utf8")).map((text, index) =>
        makeChunk({ ...entryContext, text, recordIndex: index + 1, kind: "zip-text" })
      ).filter(Boolean));
    }
  }

  if (chunks.length === 0) {
    const names = zip.getEntries().filter((entry) => !entry.isDirectory).map((entry) => entry.entryName).join(", ");
    const chunk = makeChunk({
      ...context,
      text: `Archive contents: ${names}`,
      recordIndex: 1,
      kind: "zip-manifest",
    });
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

async function chunksFromFile(filePath, relativeFile, manifest) {
  const fileName = path.basename(filePath);
  const group = groupFromFile(fileName);
  const citation = citationForFile(manifest, relativeFile);
  const buffer = await readFile(filePath);
  const context = { citation, sourceFile: relativeFile, group };
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv")) {
    return chunksFromRecords({
      ...context,
      records: rowsToRecords(parseCsv(buffer.toString("utf8"))),
      kind: "csv",
    });
  }
  if (lower.endsWith(".json") || lower.endsWith(".geojson")) return chunksFromJson(buffer, context);
  if (lower.endsWith(".html") || lower.endsWith(".txt")) {
    return chunkText(buffer.toString("utf8")).map((text, index) =>
      makeChunk({ ...context, text, recordIndex: index + 1, kind: lower.endsWith(".html") ? "html" : "text" })
    ).filter(Boolean);
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return chunksFromWorkbook(buffer, context);
  if (lower.endsWith(".zip")) return chunksFromZip(buffer, context);

  const chunk = makeChunk({
    ...context,
    text: `Binary official source file. Filename: ${fileName}. Size: ${buffer.byteLength} bytes.`,
    recordIndex: 1,
    kind: "binary-metadata",
  });
  return chunk ? [chunk] : [];
}

async function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const items = await readdir(dir);
  const files = [];
  for (const item of items) {
    const filePath = path.join(dir, item);
    if ((await stat(filePath)).isFile()) files.push(filePath);
  }
  return files;
}

function trainingExamples() {
  const examples = [
    {
      agent: "building-regulations",
      messages: [
        { role: "system", content: "You are the Toronto Building Regulations Agent. Use official citations and identify missing permit, zoning, code, and safety facts." },
        { role: "user", content: "Review a six-storey mixed-use building in Toronto with unknown zoning overlays." },
        { role: "assistant", content: JSON.stringify({
          vote: "needs_revision",
          recommendation: "Confirm zoning, overlays, permit pathway, and Ontario Building Code requirements before treating the proposal as compliant.",
          risks: ["Unknown zoning overlays can change allowed use, height, setbacks, parking, and review requirements."],
          missingInformation: ["Municipal address or parcel ID", "Applicable zoning overlays", "Permit class and required professional drawings"],
          suggestedActions: ["Retrieve zoning and permit records from official City of Toronto sources", "Ask qualified professionals to review code, fire, accessibility, and structural requirements"],
        }) },
      ],
    },
    {
      agent: "business-bursaries",
      messages: [
        { role: "system", content: "You are the Ontario Business Bursaries Agent. Use only official funding, business support, licence, and grant sources." },
        { role: "user", content: "Find growth support for a small Ontario business opening in a former commercial lot." },
        { role: "assistant", content: JSON.stringify({
          vote: "approve_with_conditions",
          recommendation: "Use official funding and business-support sources to shortlist programs, then verify current intake windows and eligibility.",
          risks: ["Program availability and deadlines change frequently.", "Business licence records do not prove land ownership."],
          missingInformation: ["Applicant legal structure", "Sector", "Employee count", "Project budget", "Current official intake dates"],
          suggestedActions: ["Check Ontario business grants and City of Toronto business support pages", "Use municipal licence data only as business activity context, not ownership proof"],
        }) },
      ],
    },
    {
      agent: "civil-infrastructure",
      messages: [
        { role: "system", content: "You are the Civil Infrastructure Agent. Use official population, road, transit, recreation, and open data sources." },
        { role: "user", content: "Assess whether a proposed retail development is in a shopping and recreation hot zone." },
        { role: "assistant", content: JSON.stringify({
          vote: "approve_with_conditions",
          recommendation: "Compare nearby BIAs, attractions, parks, recreation facilities, employment survey records, population density, TTC access, and road restrictions before scoring the site.",
          risks: ["High attraction or BIA density can increase pedestrian, curbside, transit, and traffic pressure."],
          missingInformation: ["Exact coordinates", "Nearby transit stops", "Construction staging timeline", "Expected daily trips"],
          suggestedActions: ["Build a radius-based hotspot score from official BIA, attraction, recreation, employment, population, and transit datasets"],
        }) },
      ],
    },
  ];

  return examples;
}

async function writeJsonl(filePath, rows) {
  await writeFile(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

async function main() {
  const manifestPath = path.join(SOURCE_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing source manifest: ${manifestPath}. Run npm run fetch:toronto-data first.`);
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chunksDir = path.join(OUT_DIR, "chunks");
  const corpusDir = path.join(OUT_DIR, "corpus");
  const trainingDir = path.join(OUT_DIR, "training");
  await mkdir(chunksDir, { recursive: true });
  await mkdir(corpusDir, { recursive: true });
  await mkdir(trainingDir, { recursive: true });

  const files = [
    ...(await listFiles(path.join(SOURCE_DIR, "raw"))).map((file) => ({ file, root: SOURCE_DIR })),
    ...(await listFiles(path.join(SOURCE_DIR, "pages"))).map((file) => ({ file, root: SOURCE_DIR })),
  ];

  const chunks = [];
  const errors = [];
  for (const item of files) {
    const relativeFile = path.relative(item.root, item.file).replaceAll("\\", "/");
    try {
      chunks.push(...await chunksFromFile(item.file, relativeFile, manifest));
    } catch (error) {
      errors.push({
        file: relativeFile,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const byAgent = new Map();
  for (const chunk of chunks) {
    if (!byAgent.has(chunk.agent)) byAgent.set(chunk.agent, []);
    byAgent.get(chunk.agent).push(chunk);
  }

  for (const [agent, rows] of byAgent.entries()) {
    await writeJsonl(path.join(chunksDir, `${agent}.jsonl`), rows);
  }
  await writeJsonl(path.join(corpusDir, "all.jsonl"), chunks);

  const examples = trainingExamples();
  for (const agent of new Set(examples.map((example) => example.agent))) {
    await writeJsonl(path.join(trainingDir, `${agent}.jsonl`), examples.filter((example) => example.agent === agent));
  }
  await writeJsonl(path.join(trainingDir, "all.jsonl"), examples);

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceManifestGeneratedAt: manifest.generatedAt,
    sourceDir: SOURCE_DIR,
    outputDir: OUT_DIR,
    chunkCount: chunks.length,
    trainingExampleCount: examples.length,
    chunksByAgent: Object.fromEntries([...byAgent.entries()].map(([agent, rows]) => [agent, rows.length])),
    chunksByGroup: chunks.reduce((acc, chunk) => {
      acc[chunk.group] = (acc[chunk.group] || 0) + 1;
      return acc;
    }, {}),
    errors,
  };

  await writeFile(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
