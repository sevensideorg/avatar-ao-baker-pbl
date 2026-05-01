import { describe, expect, it } from "vitest";
import { executeRayAoBake, type RayAoBakeRequest, type SerializedGeometry } from "./rayAoCore";
import type { BakeSettings } from "./types";

const baseSettings: BakeSettings = {
  textureSize: 2048,
  sampleMapSize: 128,
  samples: 32,
  maxDistance: 0.5,
  rayBias: 0.001,
  cageExtrusion: 0.0012,
  backfaceMode: "count",
  paddingPx: 8,
  uvChannel: "uv",
};

describe("executeRayAoBake", () => {
  it("darkens texels under nearby occluders and keeps open texels brighter", async () => {
    const result = await executeRayAoBake({
      targetGeometry: createTargetPlane(),
      occluderGeometry: createOccluderPlane(0.24),
      settings: baseSettings,
      occluderCount: 1,
    });

    const center = readGray(result.pixels, result.size, 0.5, 0.5);
    const corner = readGray(result.pixels, result.size, 0.1, 0.1);

    expect(center).toBeLessThan(corner);
    expect(corner).toBeGreaterThan(220);
  });

  it("keeps exported alpha opaque after padding and upscale", async () => {
    const result = await executeRayAoBake({
      targetGeometry: createTargetPlane(),
      occluderGeometry: createOccluderPlane(0.24),
      settings: baseSettings,
      occluderCount: 1,
    });

    for (let index = 3; index < result.pixels.length; index += 4096) {
      expect(result.pixels[index]).toBe(255);
    }
  });

  it("rejects target geometry with no valid UV coverage", async () => {
    const request: RayAoBakeRequest = {
      targetGeometry: createDegenerateUvTarget(),
      occluderGeometry: createOccluderPlane(0.24),
      settings: baseSettings,
      occluderCount: 1,
    };

    await expect(executeRayAoBake(request)).rejects.toThrow(/no valid UV coverage/i);
  });
});

function createTargetPlane(): SerializedGeometry {
  return {
    position: new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    index: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}

function createDegenerateUvTarget(): SerializedGeometry {
  return {
    position: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
    normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uv: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
    index: new Uint16Array([0, 1, 2]),
  };
}

function createOccluderPlane(size: number): SerializedGeometry {
  return {
    position: new Float32Array([
      -size,
      -size,
      0.18,
      size,
      -size,
      0.18,
      size,
      size,
      0.18,
      -size,
      size,
      0.18,
    ]),
    normal: new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]),
    index: new Uint16Array([0, 1, 2, 0, 2, 3]),
  };
}

function readGray(pixels: Uint8ClampedArray, size: number, u: number, v: number): number {
  const x = Math.round(u * (size - 1));
  const y = Math.round((1 - v) * (size - 1));
  return pixels[(y * size + x) * 4];
}
