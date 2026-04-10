import { Mesh, SkinnedMesh, type Object3D } from "three";
import { bakeRayAmbientOcclusion } from "./rayAoBake";
import type { BakeProgress, BakeResult, BakeSettings } from "./types";

interface BakeInput {
  root: Object3D;
  targetMesh: Mesh | SkinnedMesh;
  occluderMeshIds: string[];
  settings: BakeSettings;
  fileStem: string;
  onProgress?: (progress: BakeProgress) => void;
}

export async function bakeAmbientOcclusion(input: BakeInput): Promise<BakeResult> {
  return bakeRayAmbientOcclusion(input);
}
