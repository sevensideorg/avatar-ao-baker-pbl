import { BufferGeometry, Material, Mesh, SkinnedMesh, Texture, type Object3D } from "three";

export function disposeLoadedScene(root: Object3D): void {
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  const disposedTextures = new Set<Texture>();

  root.traverse((node) => {
    if (!(node instanceof Mesh || node instanceof SkinnedMesh)) {
      return;
    }

    const geometry = node.geometry;
    if (geometry instanceof BufferGeometry && !disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry);
      geometry.dispose();
    }

    if (Array.isArray(node.material)) {
      node.material.forEach((material) =>
        disposeMaterial(material, disposedMaterials, disposedTextures),
      );
    } else if (node.material) {
      disposeMaterial(node.material, disposedMaterials, disposedTextures);
    }

    if (node instanceof SkinnedMesh) {
      const boneTexture = node.skeleton.boneTexture;
      if (boneTexture && !disposedTextures.has(boneTexture)) {
        disposedTextures.add(boneTexture);
        boneTexture.dispose();
      }
    }
  });

  root.clear();
}

function disposeMaterial(
  material: Material,
  disposedMaterials: Set<Material>,
  disposedTextures: Set<Texture>,
): void {
  if (disposedMaterials.has(material)) {
    return;
  }

  disposedMaterials.add(material);

  for (const value of Object.values(material)) {
    if (isTexture(value)) {
      disposeTexture(value, disposedTextures);
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (isTexture(entry)) {
          disposeTexture(entry, disposedTextures);
        }
      }
    }
  }

  material.dispose();
}

function disposeTexture(texture: Texture, disposedTextures: Set<Texture>): void {
  if (disposedTextures.has(texture)) {
    return;
  }

  disposedTextures.add(texture);
  texture.dispose();
}

function isTexture(value: unknown): value is Texture {
  return Boolean(
    value &&
    typeof value === "object" &&
    "isTexture" in value &&
    (value as { isTexture?: boolean }).isTexture === true,
  );
}
