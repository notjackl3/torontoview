/**
 * Toronto Open Data proxy that searches CKAN for grant-related packages so we
 * can surface live City of Toronto funding programs alongside the static
 * catalog. CKAN is hit server-side to avoid CORS.
 *
 * Query: /api/grants
 */

import { NextResponse } from "next/server";

const CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";

interface CkanPackage {
  id: string;
  name: string;
  title: string;
  notes?: string;
  num_resources?: number;
  metadata_modified?: string;
}

export async function GET() {
  try {
    // CKAN's package_search supports a `q` parameter with a Solr-style query.
    const url = `${CKAN_BASE}/package_search?q=${encodeURIComponent(
      "grant OR funding OR subsidy",
    )}&rows=25`;
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 12 } }); // 12h cache
    if (!res.ok) {
      return NextResponse.json(
        { error: `CKAN package_search returned ${res.status}`, packages: [] },
        { status: 502 },
      );
    }
    const body = (await res.json()) as {
      result?: { results?: CkanPackage[]; count?: number };
    };
    const packages = (body.result?.results ?? []).map((p) => ({
      id: p.id,
      slug: p.name,
      title: p.title,
      notes: p.notes ? p.notes.slice(0, 240) : null,
      resources: p.num_resources ?? 0,
      updated: p.metadata_modified ?? null,
      url: `https://open.toronto.ca/dataset/${p.name}/`,
    }));
    return NextResponse.json({
      packages,
      total: body.result?.count ?? packages.length,
      attribution:
        "City of Toronto · Toronto Open Data · package_search (q=grant)",
      sourceUrl: "https://open.toronto.ca/",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        packages: [],
      },
      { status: 502 },
    );
  }
}
