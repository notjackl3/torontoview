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

function generateId(): string {
  return `bld_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

export async function POST(request: NextRequest) {
  try {
    await mkdir(BUILDINGS_DIR, { recursive: true });

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/octet-stream")) {
      return NextResponse.json(
        { error: "Expected application/octet-stream upload" },
        { status: 400 },
      );
    }

    const arrayBuffer = await request.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const name = request.headers.get("x-building-name") || "uploaded-building";

    // Parse materials before persisting so we fail fast on broken GLBs.
    let parsed;
    try {
      parsed = parseGltfMaterials(buffer);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Unable to parse GLB/glTF",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 400 },
      );
    }

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "GLB contains no mesh primitives with POSITION bounds" },
        { status: 400 },
      );
    }

    const breakdown = buildBreakdown(parsed, "glb-parsed");

    const id = generateId();
    const filename = `${id}.glb`;
    await writeFile(path.join(BUILDINGS_DIR, filename), buffer);

    return NextResponse.json({
      id,
      name,
      publicPath: `/map-data/buildings/${filename}`,
      breakdown,
    });
  } catch (error) {
    console.error("Material-aware upload failed:", error);
    return NextResponse.json(
      { error: "Failed to store building" },
      { status: 500 },
    );
  }
}
