import { Group, Mesh, SkinnedMesh } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";

export async function loadFbxFromBuffer(buffer: ArrayBuffer, fileName: string): Promise<Group> {
  const loader = new FBXLoader();
  const root = loader.parse(buffer, "") as Group;

  root.name = fileName.replace(/\.fbx$/i, "") || "Imported FBX";
  root.traverse((node) => {
    if (node instanceof Mesh || node instanceof SkinnedMesh) {
      node.frustumCulled = false;
      node.receiveShadow = true;
    }
  });

  return root;
}
