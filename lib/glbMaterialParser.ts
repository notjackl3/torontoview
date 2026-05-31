/**
 * Parse a GLB or glTF file buffer and return per-material volume estimates.
 *
 * For each mesh primitive we look up the POSITION accessor's bounding box
 * (POSITION min/max are required by the glTF spec) and treat the box volume
 * as the primitive's volume. Volumes are then summed per material name.
 *
 * This is a rough proxy — real triangle-mesh volume would require streaming
 * the binary chunk and running the divergence theorem on every triangle.
 * The bbox approach is consistent across files and good enough for the
 * material cost panel.
 */

interface GltfJson {
  materials?: Array<{ name?: string }>;
  meshes?: Array<{
    primitives?: Array<{
      attributes?: Record<string, number>;
      material?: number;
    }>;
  }>;
  accessors?: Array<{
    min?: number[];
    max?: number[];
  }>;
}

export interface ParsedMaterial {
  materialName: string;
  volumeM3: number;
}

const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const JSON_CHUNK_TYPE = 0x4e4f534a; // "JSON" little-endian

function extractJson(buffer: Buffer): GltfJson {
  // Detect format: GLB binary vs raw glTF JSON
  if (buffer.length >= 12 && buffer.readUInt32LE(0) === GLB_MAGIC) {
    // GLB binary container
    const chunkLength = buffer.readUInt32LE(12);
    const chunkType = buffer.readUInt32LE(16);
    if (chunkType !== JSON_CHUNK_TYPE) {
      throw new Error("First GLB chunk is not JSON");
    }
    const jsonBytes = buffer.slice(20, 20 + chunkLength);
    return JSON.parse(jsonBytes.toString("utf-8")) as GltfJson;
  }
  // Assume raw .gltf JSON
  return JSON.parse(buffer.toString("utf-8")) as GltfJson;
}

export function parseGltfMaterials(buffer: Buffer): ParsedMaterial[] {
  const json = extractJson(buffer);

  const results: ParsedMaterial[] = [];
  const meshes = json.meshes ?? [];
  const accessors = json.accessors ?? [];
  const materials = json.materials ?? [];

  for (const mesh of meshes) {
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessorIdx = primitive.attributes?.POSITION;
      if (positionAccessorIdx == null) continue;
      const accessor = accessors[positionAccessorIdx];
      if (!accessor?.min || !accessor.max) continue;
      const dx = (accessor.max[0] ?? 0) - (accessor.min[0] ?? 0);
      const dy = (accessor.max[1] ?? 0) - (accessor.min[1] ?? 0);
      const dz = (accessor.max[2] ?? 0) - (accessor.min[2] ?? 0);
      const volumeM3 = Math.max(0, dx * dy * dz);
      if (volumeM3 <= 0) continue;

      const materialIdx = primitive.material;
      const materialName =
        materialIdx != null && materials[materialIdx]?.name
          ? materials[materialIdx].name!
          : "generic";

      results.push({ materialName, volumeM3 });
    }
  }

  return results;
}
