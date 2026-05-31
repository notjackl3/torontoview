import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { parseGltfMaterials } from "@/lib/glbMaterialParser";
import { buildBreakdown } from "@/lib/materialCosts";

const BUILDINGS_DIR = path.join(
  process.cwd(),
  "public",
  "map-data",
  "buildings",
);

const MESHY_BASE = "https://api.meshy.ai/openapi/v1";
const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60_000; // 5 minutes

function generateId(): string {
  return `bld_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

async function meshyFetch(url: string, init?: RequestInit) {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    throw new Error("MESHY_API_KEY is not configured");
  }
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${apiKey}`,
    },
  });
}

async function uploadImageToDataUrl(image: File): Promise<string> {
  // Meshy's image-to-3D endpoint accepts either a public URL or a data URL.
  const buf = Buffer.from(await image.arrayBuffer());
  const mime = image.type || "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

interface MeshyTaskResponse {
  result: string; // task id
}

interface MeshyTaskStatus {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
  progress?: number;
  model_urls?: {
    glb?: string;
    fbx?: string;
    obj?: string;
  };
  task_error?: { message?: string };
}

async function pollUntilDone(taskId: string): Promise<MeshyTaskStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await meshyFetch(`${MESHY_BASE}/image-to-3d/${taskId}`);
    if (!res.ok) {
      throw new Error(`Meshy status poll failed: ${res.status}`);
    }
    const status = (await res.json()) as MeshyTaskStatus;
    if (status.status === "SUCCEEDED") return status;
    if (status.status === "FAILED" || status.status === "CANCELED") {
      throw new Error(
        status.task_error?.message ?? `Meshy task ${status.status}`,
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("Meshy task timed out");
}

export async function POST(request: NextRequest) {
  try {
    await mkdir(BUILDINGS_DIR, { recursive: true });

    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Expected 'image' file field" },
        { status: 400 },
      );
    }

    if (!process.env.MESHY_API_KEY) {
      return NextResponse.json(
        {
          error:
            "Blueprint-to-3D is not configured. Set MESHY_API_KEY in .env.local to enable.",
        },
        { status: 503 },
      );
    }

    const imageUrl = await uploadImageToDataUrl(image);

    // Kick off the Meshy image-to-3D task
    const createRes = await meshyFetch(`${MESHY_BASE}/image-to-3d`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        ai_model: "meshy-4",
        topology: "quad",
        target_polycount: 50000,
        should_remesh: true,
        enable_pbr: true,
      }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text();
      throw new Error(
        `Meshy image-to-3d create failed: ${createRes.status} ${detail}`,
      );
    }
    const { result: taskId } = (await createRes.json()) as MeshyTaskResponse;

    const final = await pollUntilDone(taskId);
    const glbUrl = final.model_urls?.glb;
    if (!glbUrl) {
      throw new Error("Meshy task succeeded without a GLB url");
    }

    // Download GLB, parse materials, save to public dir
    const glbRes = await fetch(glbUrl);
    if (!glbRes.ok) {
      throw new Error(`Failed to download Meshy GLB: ${glbRes.status}`);
    }
    const glbBuffer = Buffer.from(await glbRes.arrayBuffer());
    const parsed = parseGltfMaterials(glbBuffer);
    const breakdown = buildBreakdown(parsed, "glb-parsed");

    const id = generateId();
    const filename = `${id}.glb`;
    await writeFile(path.join(BUILDINGS_DIR, filename), glbBuffer);

    return NextResponse.json({
      id,
      name: image.name || "blueprint-model",
      publicPath: `/map-data/buildings/${filename}`,
      breakdown,
      meshyTaskId: taskId,
    });
  } catch (error) {
    console.error("Blueprint-to-3D failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Blueprint conversion failed",
      },
      { status: 500 },
    );
  }
}
