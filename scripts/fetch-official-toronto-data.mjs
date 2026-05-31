#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const OUT_DIR = process.env.TORONTO_DATA_DIR || "data/official-toronto";
const MAX_BYTES = Number(process.env.TORONTO_DATA_MAX_BYTES || 80 * 1024 * 1024);

const DATASETS = [
  {
    group: "building-regulations",
    package: "building-permits-active-permits",
    prefer: ["CSV", "JSON"],
  },
  {
    group: "building-regulations",
    package: "zoning-by-law",
    resources: [
      "Zoning Area - 4326.geojson",
      "Zoning Height Overlay - 4326.geojson",
      "Zoning Lot Coverage Overlay - 4326.geojson",
      "Parking Zone Overlay",
    ],
  },
  {
    group: "building-regulations",
    package: "preliminary-zoning-reviews",
    prefer: ["CSV", "JSON"],
  },
  {
    group: "building-regulations",
    package: "development-applications",
    prefer: ["CSV", "JSON", "GeoJSON"],
  },
  {
    group: "civil-infrastructure",
    package: "road-restrictions",
    prefer: ["CSV", "JSON", "GeoJSON"],
  },
  {
    group: "civil-infrastructure",
    package: "traffic-signals-tabular",
    prefer: ["CSV", "JSON"],
  },
  {
    group: "civil-infrastructure",
    package: "traffic-signal-timing",
    prefer: ["CSV", "JSON"],
  },
  {
    group: "civil-infrastructure",
    package: "ttc-routes-and-schedules",
    prefer: ["ZIP", "CSV", "JSON"],
  },
  {
    group: "civil-infrastructure",
    package: "ttc-streetcar-delay-data",
    resources: ["TTC Streetcar Delay Data since 2025", "Code Descriptions"],
  },
  {
    group: "civil-infrastructure",
    package: "311-service-requests-customer-initiated",
    resources: ["311 Service Requests 2026", "311 Service Requests 2025"],
  },
  {
    group: "business-bursaries",
    package: "community-grants-allocations",
    resources: ["Community Grants Programs since 2022", "Community Grants Allocations since 2022"],
  },
  {
    group: "business-bursaries",
    package: "imagination-manufacturing-innovation-and-technology-imit-program-recipients",
    prefer: ["CSV", "JSON"],
  },
];

const OFFICIAL_PAGES = [
  {
    group: "building-regulations",
    title: "City of Toronto building permits",
    url: "https://www.toronto.ca/services-payments/building-construction/apply-for-a-building-permit/",
  },
  {
    group: "building-regulations",
    title: "City of Toronto zoning information",
    url: "https://www.toronto.ca/city-government/planning-development/zoning-by-law-preliminary-zoning-reviews/",
  },
  {
    group: "building-regulations",
    title: "Ontario Building Code",
    url: "https://www.ontario.ca/page/ontarios-building-code",
  },
  {
    group: "business-bursaries",
    title: "Ontario business grants and financing",
    url: "https://www.ontario.ca/page/business-grants-and-financing",
  },
  {
    group: "business-bursaries",
    title: "City of Toronto business support",
    url: "https://www.toronto.ca/business-economy/business-operation-growth/business-support/",
  },
  {
    group: "civil-infrastructure",
    title: "City of Toronto road restrictions and closures",
    url: "https://www.toronto.ca/services-payments/streets-parking-transportation/road-restrictions-closures/",
  },
  {
    group: "civil-infrastructure",
    title: "TTC service information",
    url: "https://www.ttc.ca/",
  },
  {
    group: "civil-infrastructure",
    title: "Metrolinx regional transit",
    url: "https://www.metrolinx.com/",
  },
];

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function chooseResources(dataset, resources) {
  const usable = resources.filter((resource) => resource.url && resource.format);
  if (dataset.resources?.length) {
    const wanted = new Set(dataset.resources.map((name) => name.toLowerCase()));
    return usable.filter((resource) => wanted.has(String(resource.name).toLowerCase()));
  }

  const preferredFormats = new Set((dataset.prefer || ["CSV", "JSON"]).map((format) => format.toLowerCase()));
  const byName = new Map();
  for (const resource of usable) {
    const format = String(resource.format).toLowerCase();
    if (!preferredFormats.has(format)) continue;
    const key = slug(resource.name || resource.id);
    if (!byName.has(key)) byName.set(key, resource);
  }

  return [...byName.values()].slice(0, 4);
}

async function downloadResource(resource, filePath) {
  const response = await fetch(resource.url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_BYTES) {
    throw new Error(`resource too large: ${contentLength} bytes exceeds ${MAX_BYTES}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`resource too large: ${buffer.byteLength} bytes exceeds ${MAX_BYTES}`);
  }

  await writeFile(filePath, buffer);
  return {
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
  };
}

async function main() {
  const root = path.resolve(OUT_DIR);
  const catalogDir = path.join(root, "catalog");
  const rawDir = path.join(root, "raw");
  const pagesDir = path.join(root, "pages");
  await mkdir(catalogDir, { recursive: true });
  await mkdir(rawDir, { recursive: true });
  await mkdir(pagesDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourcePolicy: "official_sources_only",
    ckanBaseUrl: CKAN,
    outputDir: root,
    maxBytesPerResource: MAX_BYTES,
    datasets: [],
    pages: [],
  };

  for (const dataset of DATASETS) {
    const packageUrl = `${CKAN}/package_show?id=${encodeURIComponent(dataset.package)}`;
    const entry = {
      group: dataset.group,
      package: dataset.package,
      packageUrl,
      resources: [],
      errors: [],
    };

    try {
      const payload = await fetchJson(packageUrl);
      const packageFile = path.join(catalogDir, `${dataset.group}__${dataset.package}.json`);
      await writeFile(packageFile, JSON.stringify(payload.result, null, 2));
      entry.catalogFile = path.relative(root, packageFile);

      const resources = chooseResources(dataset, payload.result.resources || []);
      for (const resource of resources) {
        const extension = path.extname(new URL(resource.url).pathname) || `.${String(resource.format).toLowerCase()}`;
        const fileName = `${dataset.group}__${dataset.package}__${slug(resource.name || resource.id)}${extension}`;
        const filePath = path.join(rawDir, fileName);
        const resourceEntry = {
          id: resource.id,
          name: resource.name,
          format: resource.format,
          url: resource.url,
          file: path.relative(root, filePath),
        };

        try {
          Object.assign(resourceEntry, await downloadResource(resource, filePath));
        } catch (error) {
          resourceEntry.error = error instanceof Error ? error.message : String(error);
        }

        entry.resources.push(resourceEntry);
      }
    } catch (error) {
      entry.errors.push(error instanceof Error ? error.message : String(error));
    }

    manifest.datasets.push(entry);
  }

  for (const page of OFFICIAL_PAGES) {
    const fileName = `${page.group}__${slug(page.title)}.html`;
    const filePath = path.join(pagesDir, fileName);
    const entry = {
      ...page,
      file: path.relative(root, filePath),
    };

    try {
      Object.assign(entry, await downloadResource({ url: page.url }, filePath));
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }

    manifest.pages.push(entry);
  }

  const manifestPath = path.join(root, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  const downloaded = manifest.datasets.reduce(
    (count, dataset) => count + dataset.resources.filter((resource) => !resource.error).length,
    0
  );
  const pageCount = manifest.pages.filter((page) => !page.error).length;
  console.log(`Wrote ${manifestPath}`);
  console.log(`Downloaded ${downloaded} resources and ${pageCount} official pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
