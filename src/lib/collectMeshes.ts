import { BufferGeometry, Mesh, type Object3D, SkinnedMesh } from "three";
import type { MeshOption, UVChannel } from "./types";

const SELECTION_ID_KEY = "selectionId";

function isBakeCandidate(object: Object3D): object is Mesh | SkinnedMesh {
  return object instanceof Mesh || object instanceof SkinnedMesh;
}

function ensureSelectionId(mesh: Mesh | SkinnedMesh): string {
  const existing = mesh.userData[SELECTION_ID_KEY];
  if (typeof existing === "string") {
    return existing;
  }

  mesh.userData[SELECTION_ID_KEY] = mesh.uuid;
  return mesh.uuid;
}

export function collectMeshes(root: Object3D): MeshOption[] {
  const meshes: MeshOption[] = [];

  root.traverse((node) => {
    if (!isBakeCandidate(node) || !(node.geometry instanceof BufferGeometry)) {
      return;
    }

    const uvChannels: UVChannel[] = [];
    if (node.geometry.getAttribute("uv")) {
      uvChannels.push("uv");
    }
    if (node.geometry.getAttribute("uv2")) {
      uvChannels.push("uv2");
    }

    const position = node.geometry.getAttribute("position");
    const vertexCount = position?.count ?? 0;
    const triangleCount = node.geometry.index ? node.geometry.index.count / 3 : vertexCount / 3;

    meshes.push({
      id: ensureSelectionId(node),
      name: node.name || `Mesh ${meshes.length + 1}`,
      uvChannels,
      canBake: uvChannels.length > 0,
      vertexCount,
      triangleCount,
      isSkinned: node instanceof SkinnedMesh,
      object: node,
    });
  });

  return meshes;
}

export function getMeshById(root: Object3D, id: string): Mesh | SkinnedMesh | null {
  let match: Mesh | SkinnedMesh | null = null;

  root.traverse((node) => {
    if (match || !isBakeCandidate(node)) {
      return;
    }

    if (node.userData[SELECTION_ID_KEY] === id) {
      match = node;
    }
  });

  return match;
}
