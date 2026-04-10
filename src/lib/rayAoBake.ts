import { BufferGeometry, SkinnedMesh, type Mesh, type Object3D } from "three";
import { StaticGeometryGenerator } from "three-mesh-bvh";
import { getMeshById } from "./collectMeshes";
import { imageDataToPngBuffer } from "./imageExport";
import {
  cloneSerializedGeometry,
  executeRayAoBake,
  mergeSerializedGeometries,
  serializeBufferGeometry,
  type RayAoBakeRequest,
  type RayAoBakeResult,
  type SerializedGeometry,
} from "./rayAoCore";
import type { BakeProgress, BakeResult, BakeSettings } from "./types";

interface RayBakeInput {
  root: Object3D;
  targetMesh: Mesh | SkinnedMesh;
  occluderMeshIds: string[];
  settings: BakeSettings;
  fileStem: string;
  onProgress?: (progress: BakeProgress) => void;
}

type WorkerResultMessage = {
  type: "result";
  payload: RayAoBakeResult;
};

type WorkerProgressMessage = {
  type: "progress";
  payload: BakeProgress;
};

type WorkerErrorMessage = {
  type: "error";
  payload: string;
};

type WorkerResponseMessage =
  | WorkerResultMessage
  | WorkerProgressMessage
  | WorkerErrorMessage;

const sceneGeometryCache = new WeakMap<Object3D, SceneGeometryCache>();

interface SceneGeometryCache {
  target: Map<string, SerializedGeometry>;
  occluder: Map<string, SerializedGeometry>;
}

export async function bakeRayAmbientOcclusion(input: RayBakeInput): Promise<BakeResult> {
  const { fileStem, occluderMeshIds, onProgress, root, settings, targetMesh } = input;
  if (occluderMeshIds.length === 0) {
    throw new Error("Select at least one influence mesh for AO baking.");
  }

  const occluderMeshes = occluderMeshIds
    .map((meshId) => getMeshById(root, meshId))
    .filter((mesh): mesh is Mesh | SkinnedMesh => mesh !== null);

  if (occluderMeshes.length === 0) {
    throw new Error("Could not locate the selected influence meshes.");
  }

  onProgress?.({
    stage: "Preparing geometry",
    completed: 0,
    total: 3,
  });

  await yieldToMainThread();
  const geometryCache = getSceneGeometryCache(root);
  const targetCacheKey = `${getSelectionId(targetMesh)}:${settings.uvChannel}`;
  const cachedTargetGeometry = geometryCache.target.get(targetCacheKey);
  const targetGeometry = cachedTargetGeometry
    ? cloneSerializedGeometry(cachedTargetGeometry)
    : buildSerializedGeometry([targetMesh], {
        includeUv2: settings.uvChannel === "uv2",
      });

  if (!cachedTargetGeometry) {
    const targetUvAttribute = settings.uvChannel === "uv2" ? targetGeometry.uv2 : targetGeometry.uv;
    if (!targetUvAttribute) {
      throw new Error(`The selected mesh does not contain ${settings.uvChannel}.`);
    }
    geometryCache.target.set(targetCacheKey, cloneSerializedGeometry(targetGeometry));
  }

  onProgress?.({
    stage: "Preparing geometry",
    completed: 1,
    total: 3,
  });

  await yieldToMainThread();
  const occluderGeometryParts: SerializedGeometry[] = [];
  for (let index = 0; index < occluderMeshes.length; index += 1) {
    const occluderMesh = occluderMeshes[index];
    const occluderCacheKey = getSelectionId(occluderMesh);
    const cachedOccluderGeometry = geometryCache.occluder.get(occluderCacheKey);
    const occluderGeometryPart = cachedOccluderGeometry
      ? cloneSerializedGeometry(cachedOccluderGeometry)
      : buildSerializedGeometry([occluderMesh], {
          includeUv2: false,
        });

    if (!cachedOccluderGeometry) {
      geometryCache.occluder.set(occluderCacheKey, cloneSerializedGeometry(occluderGeometryPart));
    }

    occluderGeometryParts.push(occluderGeometryPart);

    if ((index + 1) % 4 === 0 && index + 1 < occluderMeshes.length) {
      await yieldToMainThread();
    }
  }
  const occluderGeometry = mergeSerializedGeometries(occluderGeometryParts);

  onProgress?.({
    stage: "Preparing geometry",
    completed: 2,
    total: 3,
  });

  onProgress?.({
    stage: "Preparing geometry",
    completed: 3,
    total: 3,
  });

  const request: RayAoBakeRequest = {
    targetGeometry,
    occluderGeometry,
    settings,
    occluderCount: occluderMeshes.length,
  };

  const bakedOutput = await runRayAoBake(request, onProgress);
  const outputImage = new ImageData(
    new Uint8ClampedArray(bakedOutput.pixels),
    bakedOutput.size,
    bakedOutput.size,
  );

  return {
    kind: "final",
    width: outputImage.width,
    height: outputImage.height,
    pngBuffer: await imageDataToPngBuffer(outputImage),
    defaultFileName: `${sanitizeFileStem(fileStem)}_ao.png`,
    note: bakedOutput.note,
  };
}

function bakeStaticGeometry(
  objects: Array<Object3D>,
  options: { includeUv2: boolean },
): BufferGeometry {
  const generator = new StaticGeometryGenerator(objects);
  generator.applyWorldTransforms = true;
  generator.attributes = options.includeUv2
    ? ["position", "normal", "uv", "uv2"]
    : ["position", "normal", "uv"];

  return generator.generate();
}

function buildSerializedGeometry(
  objects: Array<Object3D>,
  options: { includeUv2: boolean },
): SerializedGeometry {
  const geometry = bakeStaticGeometry(objects, options);
  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }
  const serialized = serializeBufferGeometry(geometry);
  geometry.dispose();
  return serialized;
}

function getSceneGeometryCache(root: Object3D): SceneGeometryCache {
  const cached = sceneGeometryCache.get(root);
  if (cached) {
    return cached;
  }

  const nextCache: SceneGeometryCache = {
    target: new Map(),
    occluder: new Map(),
  };
  sceneGeometryCache.set(root, nextCache);
  return nextCache;
}

async function runRayAoBake(
  request: RayAoBakeRequest,
  onProgress?: (progress: BakeProgress) => void,
): Promise<RayAoBakeResult> {
  if (typeof Worker === "undefined") {
    return executeRayAoBake(request, onProgress);
  }

  try {
    return await runRayAoBakeInWorker(cloneRayAoBakeRequest(request), onProgress);
  } catch {
    return executeRayAoBake(request, onProgress);
  }
}

function runRayAoBakeInWorker(
  request: RayAoBakeRequest,
  onProgress?: (progress: BakeProgress) => void,
): Promise<RayAoBakeResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./rayAoWorker.ts", import.meta.url), {
      type: "module",
    });

    const cleanup = () => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        onProgress?.(message.payload);
        return;
      }

      cleanup();

      if (message.type === "result") {
        resolve(message.payload);
        return;
      }

      reject(new Error(message.payload));
    };

    worker.onerror = (event) => {
      cleanup();
      reject(event.error instanceof Error ? event.error : new Error(event.message));
    };

    worker.postMessage(
      { type: "run", payload: request },
      [
        request.targetGeometry.position.buffer,
        ...(request.targetGeometry.normal ? [request.targetGeometry.normal.buffer] : []),
        ...(request.targetGeometry.uv ? [request.targetGeometry.uv.buffer] : []),
        ...(request.targetGeometry.uv2 ? [request.targetGeometry.uv2.buffer] : []),
        ...(request.targetGeometry.index ? [request.targetGeometry.index.buffer] : []),
        request.occluderGeometry.position.buffer,
        ...(request.occluderGeometry.normal ? [request.occluderGeometry.normal.buffer] : []),
        ...(request.occluderGeometry.uv ? [request.occluderGeometry.uv.buffer] : []),
        ...(request.occluderGeometry.uv2 ? [request.occluderGeometry.uv2.buffer] : []),
        ...(request.occluderGeometry.index ? [request.occluderGeometry.index.buffer] : []),
      ],
    );
  });
}

function sanitizeFileStem(name: string): string {
  const stripped = name.replace(/\.fbx$/i, "").trim() || "mesh";
  return stripped.replace(/[<>:\"/\\|?*]+/g, "_");
}

function cloneRayAoBakeRequest(request: RayAoBakeRequest): RayAoBakeRequest {
  return {
    ...request,
    targetGeometry: cloneSerializedGeometry(request.targetGeometry),
    occluderGeometry: cloneSerializedGeometry(request.occluderGeometry),
  };
}

function getSelectionId(mesh: Mesh | SkinnedMesh): string {
  const selectionId = mesh.userData.selectionId;
  if (typeof selectionId === "string" && selectionId.length > 0) {
    return selectionId;
  }

  return mesh.uuid;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}
