import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseGltfMaterials } from "./glbMaterialParser";

const DEFAULT_GLTF = path.join(
  process.cwd(),
  "public",
  "let_me_sleeeeeeep",
  "let_me_sleeeeeeep.gltf",
);

describe("parseGltfMaterials", () => {
  it("extracts at least one primitive with positive volume from the default Toronto model", () => {
    const buf = readFileSync(DEFAULT_GLTF);
    const parsed = parseGltfMaterials(buf);
    expect(parsed.length).toBeGreaterThan(0);
    for (const p of parsed) {
      expect(p.volumeM3).toBeGreaterThan(0);
      expect(typeof p.materialName).toBe("string");
      expect(p.materialName.length).toBeGreaterThan(0);
    }
  });

  it("returns an empty list when the JSON has no meshes", () => {
    const fakeGltf = JSON.stringify({ meshes: [], accessors: [], materials: [] });
    const parsed = parseGltfMaterials(Buffer.from(fakeGltf));
    expect(parsed).toEqual([]);
  });

  it("falls back to 'generic' when a primitive has no material index", () => {
    const fakeGltf = JSON.stringify({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ min: [0, 0, 0], max: [2, 3, 4] }],
      materials: [],
    });
    const parsed = parseGltfMaterials(Buffer.from(fakeGltf));
    expect(parsed).toEqual([{ materialName: "generic", volumeM3: 24 }]);
  });

  it("uses the material name when both index and name are present", () => {
    const fakeGltf = JSON.stringify({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
      accessors: [{ min: [0, 0, 0], max: [1, 2, 3] }],
      materials: [{ name: "concrete_wall" }],
    });
    const parsed = parseGltfMaterials(Buffer.from(fakeGltf));
    expect(parsed).toEqual([{ materialName: "concrete_wall", volumeM3: 6 }]);
  });

  it("throws on a GLB whose first chunk is not JSON", () => {
    // 12-byte header with GLB magic, but the chunk type is BIN, not JSON.
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0); // "glTF"
    header.writeUInt32LE(2, 4); // version
    header.writeUInt32LE(20, 8); // length
    const chunkLen = Buffer.alloc(4);
    chunkLen.writeUInt32LE(0, 0);
    const chunkType = Buffer.alloc(4);
    chunkType.writeUInt32LE(0x004e4942, 0); // "BIN\0"
    const bogus = Buffer.concat([header, chunkLen, chunkType]);
    expect(() => parseGltfMaterials(bogus)).toThrow(/JSON/i);
  });
});
