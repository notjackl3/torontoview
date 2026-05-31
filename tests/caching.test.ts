import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const CANDIDATE_PORTS = [3000, 3001, 3002, 3015];
let BASE = "http://localhost:3000";

async function probeForServer(): Promise<string | null> {
  for (const port of CANDIDATE_PORTS) {
    try {
      const res = await fetch(`http://localhost:${port}/api/editor/building`);
      if (res.ok || res.status < 500) return `http://localhost:${port}`;
    } catch {
      // continue
    }
  }
  return null;
}

beforeAll(async () => {
  const found = await probeForServer();
  if (!found) throw new Error("Dev server not running on 3000/3001/3002/3015");
  BASE = found;
});

describe("caching: static demo glTF gets long-lived Cache-Control", () => {
  it("/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf carries immutable max-age", async () => {
    const res = await fetch(
      `${BASE}/let_me_sleeeeeeep/let_me_sleeeeeeep.gltf`,
    );
    expect(res.status).toBe(200);
    const cc = res.headers.get("cache-control") ?? "";
    expect(cc).toMatch(/max-age=\d+/);
    expect(cc).toMatch(/immutable|public/);
  });
});

describe("caching: uploaded GLB API route", () => {
  let uploadedId = "";

  it("upload and verify Cache-Control + ETag are present on first GET", async () => {
    const buf = readFileSync(
      path.join(
        process.cwd(),
        "public",
        "let_me_sleeeeeeep",
        "let_me_sleeeeeeep.gltf",
      ),
    );
    const upload = await fetch(`${BASE}/api/editor/building-with-materials`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: buf,
    });
    expect(upload.status).toBe(200);
    const body = (await upload.json()) as { id: string };
    uploadedId = body.id;

    const first = await fetch(`${BASE}/api/editor/building/${uploadedId}`);
    expect(first.status).toBe(200);
    const cc = first.headers.get("cache-control") ?? "";
    expect(cc).toMatch(/immutable/);
    expect(cc).toMatch(/max-age=\d+/);
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    expect(etag).toMatch(/^"[a-f0-9]+"$/);
  });

  it("conditional GET with matching ETag returns 304 with no body", async () => {
    expect(uploadedId).toBeTruthy();
    const probe = await fetch(`${BASE}/api/editor/building/${uploadedId}`);
    const etag = probe.headers.get("etag")!;

    const revalidated = await fetch(
      `${BASE}/api/editor/building/${uploadedId}`,
      {
        headers: { "if-none-match": etag },
      },
    );
    expect(revalidated.status).toBe(304);
    const text = await revalidated.text();
    expect(text).toBe("");
  });

  it("repeated GETs return identical ETag (cache stable)", async () => {
    expect(uploadedId).toBeTruthy();
    const [a, b] = await Promise.all([
      fetch(`${BASE}/api/editor/building/${uploadedId}`),
      fetch(`${BASE}/api/editor/building/${uploadedId}`),
    ]);
    expect(a.headers.get("etag")).toBe(b.headers.get("etag"));
  });

  it("404 for an unknown building", async () => {
    const res = await fetch(`${BASE}/api/editor/building/bld_does_not_exist`);
    expect(res.status).toBe(404);
  });
});
