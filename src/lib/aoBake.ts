import { Mesh, SkinnedMesh, type Object3D } from "three";
import { bakeRayAmbientOcclusion } from "./rayAoBake";
import type { BakeCancellation, BakeProgress, BakeResult, BakeSettings } from "./types";

interface BakeInput {
  root: Object3D;
  targetMesh: Mesh | SkinnedMesh;
  occluderMeshIds: string[];
  settings: BakeSettings;
  fileStem: string;
  onProgress?: (progress: BakeProgress) => void;
  cancellation?: BakeCancellation;
}

export async function bakeAmbientOcclusion(input: BakeInput): Promise<BakeResult> {
  return bakeRayAmbientOcclusion(input);
}
