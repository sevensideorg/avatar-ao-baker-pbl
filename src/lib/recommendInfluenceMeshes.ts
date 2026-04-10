import { Box3, Vector3 } from "three";
import type { MeshOption } from "./types";

interface RecommendInfluenceMeshesInput {
  targetMesh: MeshOption | null;
  meshOptions: MeshOption[];
  maxDistance: number;
}

const tempTargetBounds = new Box3();
const tempTargetSize = new Vector3();
const tempMeshBounds = new Box3();

export function recommendInfluenceMeshIds(
  input: RecommendInfluenceMeshesInput,
): string[] {
  const { maxDistance, meshOptions, targetMesh } = input;

  if (!targetMesh) {
    return [];
  }

  const targetBounds = tempTargetBounds.setFromObject(targetMesh.object);
  targetBounds.getSize(tempTargetSize);

  const targetMaxDimension = Math.max(tempTargetSize.x, tempTargetSize.y, tempTargetSize.z);
  const searchRadius = Math.max(maxDistance * 4, targetMaxDimension * 0.06, 0.015);
  const recommendedIds: string[] = [];

  for (const mesh of meshOptions) {
    if (mesh.id === targetMesh.id) {
      recommendedIds.push(mesh.id);
      continue;
    }

    const meshBounds = tempMeshBounds.setFromObject(mesh.object);
    if (meshBounds.isEmpty()) {
      continue;
    }

    if (boxDistance(targetBounds, meshBounds) <= searchRadius) {
      recommendedIds.push(mesh.id);
    }
  }

  return recommendedIds;
}

function boxDistance(a: Box3, b: Box3): number {
  const dx = axisGap(a.min.x, a.max.x, b.min.x, b.max.x);
  const dy = axisGap(a.min.y, a.max.y, b.min.y, b.max.y);
  const dz = axisGap(a.min.z, a.max.z, b.min.z, b.max.z);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function axisGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) {
    return bMin - aMax;
  }

  if (bMax < aMin) {
    return aMin - bMax;
  }

  return 0;
}
