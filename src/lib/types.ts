import type { Mesh, Object3D, SkinnedMesh } from "three";

export type UVChannel = "uv" | "uv2";
export type BackfaceMode = "ignore" | "count";

export interface MeshOption {
  id: string;
  name: string;
  uvChannels: UVChannel[];
  canBake: boolean;
  vertexCount: number;
  triangleCount: number;
  isSkinned: boolean;
  object: Mesh | SkinnedMesh;
}

export interface BakeSettings {
  textureSize: 2048 | 4096;
  sampleMapSize: 128 | 1024 | 2048;
  samples: 64;
  maxDistance: number;
  rayBias: number;
  cageExtrusion: number;
  backfaceMode: BackfaceMode;
  paddingPx: 8 | 16 | 24;
  uvChannel: UVChannel;
}

export interface BakeProgress {
  stage: string;
  completed: number;
  total: number;
}

export type BakeResultKind = "preview" | "final";

export interface BakeResult {
  kind: BakeResultKind;
  width: number;
  height: number;
  pngBuffer: ArrayBuffer;
  defaultFileName: string;
  note?: string;
}

export interface LoadedScene {
  fileName: string;
  root: Object3D;
  meshes: MeshOption[];
}
