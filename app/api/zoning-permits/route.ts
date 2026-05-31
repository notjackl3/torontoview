/**
 * Toronto Open Data proxy for permit applications.
 *
 * CKAN dataset: building-permits-applications-active
 * (https://open.toronto.ca/dataset/building-permits-applications-active/)
 *
 * We hit CKAN server-side to avoid CORS, and to filter down to permits whose
 * geographic centroid sits inside a small bbox around the user's anchor lat/lng.
 *
 * Query: /api/zoning-permits?lat=43.6532&lng=-79.3832&radiusM=400
 */

import { NextRequest, NextResponse } from "next/server";

const CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const PACKAGE_ID = "building-permits-applications-active";

// Cache resource id resolution for the life of the server process — CKAN
// resource ids only change on dataset re-publish.
let cachedResourceId: string | null = null;
let cachedAt = 0;
const RESOURCE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

async function resolveResourceId(): Promise<string | null> {
  const now = Date.now();
  if (cachedResourceId && now - cachedAt < RESOURCE_TTL_MS) {
    return cachedResourceId;
  }
  const url = `${CKAN_BASE}/package_show?id=${PACKAGE_ID}`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    result?: { resources?: Array<{ id: string; datastore_active?: boolean; format?: string }> };
  };
  // Prefer a datastore-active resource so we can query it directly.
  const active = body.result?.resources?.find((r) => r.datastore_active);
  const fallback = body.result?.resources?.find((r) =>
    /csv|json/i.test(r.format ?? ""),
  );
  const picked = active?.id ?? fallback?.id ?? null;
  if (picked) {
    cachedResourceId = picked;
    cachedAt = now;
  }
  return picked;
}

interface PermitRecord {
  _id?: number;
  PERMIT_NUM?: string | null;
  REVISION_NUM?: string | null;
  PERMIT_TYPE?: string | null;
  STRUCTURE_TYPE?: string | null;
  WORK?: string | null;
  STREET_NUM?: string | null;
  STREET_NAME?: string | null;
  STREET_TYPE?: string | null;
  STREET_DIRECTION?: string | null;
  POSTAL?: string | null;
  GEO_ID?: number | null;
  WARD?: string | null;
  APPLICATION_DATE?: string | null;
  ISSUED_DATE?: string | null;
  COMPLETED_DATE?: string | null;
  STATUS?: string | null;
  DESCRIPTION?: string | null;
  // The dataset includes LATITUDE / LONGITUDE on most rows
  LATITUDE?: number | string | null;
  LONGITUDE?: number | string | null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const c =
    s1 * s1 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(c)));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusM = Number(searchParams.get("radiusM") ?? "400");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat / lng required" }, { status: 400 });
  }

  const resourceId = await resolveResourceId();
  if (!resourceId) {
    return NextResponse.json(
      { error: "Toronto Open Data is currently unavailable.", permits: [] },
      { status: 502 },
    );
  }

  // datastore_search returns paginated rows. We pull a larger page and filter
  // by bbox client-side because CKAN's SQL endpoint requires URL-encoded SQL
  // and not every field is geo-indexed.
  const limit = 1000;
  const url = `${CKAN_BASE}/datastore_search?id=${encodeURIComponent(
    resourceId,
  )}&limit=${limit}`;

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 30 } }); // 30-min cache
    if (!res.ok) {
      return NextResponse.json(
        { error: `CKAN datastore_search returned ${res.status}`, permits: [] },
        { status: 502 },
      );
    }
    const body = (await res.json()) as {
      result?: { records?: PermitRecord[]; total?: number };
    };
    const records = body.result?.records ?? [];

    const anchor = { lat, lng };
    const nearby = records
      .map((r) => {
        const rLat = toNumber(r.LATITUDE);
        const rLng = toNumber(r.LONGITUDE);
        if (rLat == null || rLng == null) return null;
        const dist = haversineM(anchor, { lat: rLat, lng: rLng });
        if (dist > radiusM) return null;
        return {
          id: r.PERMIT_NUM ?? r._id?.toString() ?? "",
          permitType: r.PERMIT_TYPE ?? "Permit",
          structureType: r.STRUCTURE_TYPE ?? null,
          work: r.WORK ?? r.DESCRIPTION ?? null,
          address: [
            r.STREET_NUM,
            r.STREET_NAME,
            r.STREET_TYPE,
            r.STREET_DIRECTION,
          ]
            .filter(Boolean)
            .join(" "),
          status: r.STATUS ?? null,
          applicationDate: r.APPLICATION_DATE ?? null,
          issuedDate: r.ISSUED_DATE ?? null,
          distanceM: Math.round(dist),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 25);

    return NextResponse.json({
      anchor,
      radiusM,
      totalScanned: records.length,
      nearbyCount: nearby.length,
      permits: nearby,
      attribution:
        "City of Toronto · Toronto Open Data · Building Permits — Applications: Active",
      sourceUrl:
        "https://open.toronto.ca/dataset/building-permits-applications-active/",
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        permits: [],
      },
      { status: 502 },
    );
  }
}
