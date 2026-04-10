import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Ray,
  Vector2,
  Vector3,
} from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { BakeProgress, BakeSettings } from "./types";

export interface SerializedGeometry {
  position: Float32Array;
  normal?: Float32Array;
  uv?: Float32Array;
  uv2?: Float32Array;
  index?: Uint16Array | Uint32Array;
}

export interface RayAoBakeRequest {
  targetGeometry: SerializedGeometry;
  occluderGeometry: SerializedGeometry;
  settings: BakeSettings;
  occluderCount: number;
}

export interface RayAoBakeResult {
  pixels: Uint8ClampedArray;
  size: number;
  note: string;
}

interface UvSampleBuffer {
  finalAo: Float32Array;
  coverage: Uint8Array;
  layerCounts: Uint8Array;
  layerWeights: Float32Array;
  worldNormals: Float32Array;
  worldPositions: Float32Array;
  layerWorldNormals: Float32Array;
  layerWorldPositions: Float32Array;
}

const tempUvA = new Vector2();
const tempUvB = new Vector2();
const tempUvC = new Vector2();
const tempVec2 = new Vector2();
const tempPositionA = new Vector3();
const tempPositionB = new Vector3();
const tempPositionC = new Vector3();
const tempNormalA = new Vector3();
const tempNormalB = new Vector3();
const tempNormalC = new Vector3();
const tempNormal = new Vector3();
const tempTangent = new Vector3();
const tempBitangent = new Vector3();
const tempDirection = new Vector3();
const tempLocalDirection = new Vector3();
const tempPixelPosition = new Vector3();
const tempPixelNormal = new Vector3();
const tempSampleNormal = new Vector3();
const tempSamplePosition = new Vector3();
const tempLayerNormal = new Vector3();
const tempLayerPosition = new Vector3();
const workingRay = new Ray();
const BLUR_KERNEL: Array<[offset: number, weight: number]> = [
  [0, 0.34],
  [1, 0.22],
  [-1, 0.22],
  [2, 0.11],
  [-2, 0.11],
];
const MAX_UV_LAYERS = 5;
const UV_LAYER_NORMAL_MERGE_DOT = 0.985;
const MIN_UV_MERGE_DISTANCE = 0.00005;
const MAX_UV_MERGE_DISTANCE = 0.00035;
const tempBounds = new Box3();
const tempBoundsSize = new Vector3();

export function serializeBufferGeometry(geometry: BufferGeometry): SerializedGeometry {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const uv2 = geometry.getAttribute("uv2");

  if (!position) {
    throw new Error("Geometry is missing position data.");
  }

  const serialized: SerializedGeometry = {
    position: cloneFloat32(position.array as Float32Array),
  };

  if (normal) {
    serialized.normal = cloneFloat32(normal.array as Float32Array);
  }
  if (uv) {
    serialized.uv = cloneFloat32(uv.array as Float32Array);
  }
  if (uv2) {
    serialized.uv2 = cloneFloat32(uv2.array as Float32Array);
  }

  const index = geometry.index;
  if (index) {
    serialized.index =
      index.array instanceof Uint32Array
        ? index.array.slice(0)
        : new Uint16Array(index.array as Uint16Array);
  }

  return serialized;
}

export function cloneSerializedGeometry(serialized: SerializedGeometry): SerializedGeometry {
  return {
    position: serialized.position.slice(0),
    normal: serialized.normal?.slice(0),
    uv: serialized.uv?.slice(0),
    uv2: serialized.uv2?.slice(0),
    index: serialized.index?.slice(0) as Uint16Array | Uint32Array | undefined,
  };
}

export function mergeSerializedGeometries(geometries: SerializedGeometry[]): SerializedGeometry {
  if (geometries.length === 0) {
    throw new Error("No geometry was provided for merge.");
  }

  let totalVertexCount = 0;
  let totalIndexCount = 0;
  let includeNormal = true;
  let includeUv = true;
  let includeUv2 = true;

  for (const geometry of geometries) {
    const vertexCount = geometry.position.length / 3;
    totalVertexCount += vertexCount;
    totalIndexCount += geometry.index ? geometry.index.length : vertexCount;
    includeNormal &&= Boolean(geometry.normal);
    includeUv &&= Boolean(geometry.uv);
    includeUv2 &&= Boolean(geometry.uv2);
  }

  const position = new Float32Array(totalVertexCount * 3);
  const normal = includeNormal ? new Float32Array(totalVertexCount * 3) : undefined;
  const uv = includeUv ? new Float32Array(totalVertexCount * 2) : undefined;
  const uv2 = includeUv2 ? new Float32Array(totalVertexCount * 2) : undefined;
  const index =
    totalVertexCount > 65535
      ? new Uint32Array(totalIndexCount)
      : new Uint16Array(totalIndexCount);

  let positionOffset = 0;
  let normalOffset = 0;
  let uvOffset = 0;
  let uv2Offset = 0;
  let indexOffset = 0;
  let vertexOffset = 0;

  for (const geometry of geometries) {
    position.set(geometry.position, positionOffset);
    positionOffset += geometry.position.length;

    if (normal && geometry.normal) {
      normal.set(geometry.normal, normalOffset);
      normalOffset += geometry.normal.length;
    }

    if (uv && geometry.uv) {
      uv.set(geometry.uv, uvOffset);
      uvOffset += geometry.uv.length;
    }

    if (uv2 && geometry.uv2) {
      uv2.set(geometry.uv2, uv2Offset);
      uv2Offset += geometry.uv2.length;
    }

    const vertexCount = geometry.position.length / 3;
    if (geometry.index) {
      for (let i = 0; i < geometry.index.length; i += 1) {
        index[indexOffset + i] = geometry.index[i] + vertexOffset;
      }
      indexOffset += geometry.index.length;
    } else {
      for (let i = 0; i < vertexCount; i += 1) {
        index[indexOffset + i] = vertexOffset + i;
      }
      indexOffset += vertexCount;
    }

    vertexOffset += vertexCount;
  }

  return {
    position,
    normal,
    uv,
    uv2,
    index,
  };
}

export async function executeRayAoBake(
  request: RayAoBakeRequest,
  onProgress?: (progress: BakeProgress) => void,
): Promise<RayAoBakeResult> {
  const { occluderCount, occluderGeometry: occluderGeometryData, settings, targetGeometry: targetGeometryData } =
    request;
  const bakeMapSize = resolveBakeMapSize(settings);

  const targetGeometry = deserializeBufferGeometry(targetGeometryData);
  let occluderGeometry: BufferGeometry | null = null;

  try {
    const targetUvAttribute = targetGeometry.getAttribute(settings.uvChannel);
    if (!targetUvAttribute) {
      throw new Error(`The selected mesh does not contain ${settings.uvChannel}.`);
    }

    if (!targetGeometry.getAttribute("normal")) {
      targetGeometry.computeVertexNormals();
    }

    onProgress?.({
      stage: "Preparing UV samples",
      completed: 0,
      total: 1,
    });

    const mergeDistance = estimateUvMergeDistance(targetGeometry, bakeMapSize, settings);
    const sampleBuffer = rasterizeTargetToUvBuffer(
      targetGeometry,
      bakeMapSize,
      settings.uvChannel,
      mergeDistance,
    );
    if (!hasCoverage(sampleBuffer.coverage)) {
      throw new Error("The selected mesh produced no valid UV coverage for AO baking.");
    }

    onProgress?.({
      stage: "Preparing UV samples",
      completed: 1,
      total: 1,
    });

    onProgress?.({
      stage: "Building BVH",
      completed: 0,
      total: 1,
    });

    occluderGeometry = deserializeBufferGeometry(occluderGeometryData);
    if (!occluderGeometry.getAttribute("normal")) {
      occluderGeometry.computeVertexNormals();
    }
    const bvh = new MeshBVH(occluderGeometry);

    onProgress?.({
      stage: "Building BVH",
      completed: 1,
      total: 1,
    });

    await computeAmbientOcclusion(sampleBuffer, bvh, settings, onProgress);

    onProgress?.({
      stage: "Filtering AO",
      completed: 0,
      total: 1,
    });

    const blurredAo = blurAmbientOcclusion(sampleBuffer, settings);
    const lowResolutionPixels = createAoPixels(blurredAo, sampleBuffer.coverage, bakeMapSize);
    const pixels = upscaleAoPixels(lowResolutionPixels, bakeMapSize, settings.textureSize);
    applyUvPaddingToPixels(pixels, settings.textureSize, settings.paddingPx);

    onProgress?.({
      stage: "Filtering AO",
      completed: 1,
      total: 1,
    });

    return {
      pixels,
      size: settings.textureSize,
      note: `Ray AO used ${occluderCount} influence mesh${occluderCount === 1 ? "" : "es"}, ${bakeMapSize}px internal sampling, ${settings.samples} rays, ${settings.cageExtrusion}m cage, ${settings.backfaceMode === "ignore" ? "ignored" : "counted"} backfaces, and ${settings.paddingPx}px padding for ${settings.textureSize}px export.`,
    };
  } finally {
    targetGeometry.dispose();
    occluderGeometry?.dispose();
  }
}

function deserializeBufferGeometry(serialized: SerializedGeometry): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(serialized.position, 3));

  if (serialized.normal) {
    geometry.setAttribute("normal", new BufferAttribute(serialized.normal, 3));
  }
  if (serialized.uv) {
    geometry.setAttribute("uv", new BufferAttribute(serialized.uv, 2));
  }
  if (serialized.uv2) {
    geometry.setAttribute("uv2", new BufferAttribute(serialized.uv2, 2));
  }
  if (serialized.index) {
    geometry.setIndex(new BufferAttribute(serialized.index, 1));
  }

  return geometry;
}

function rasterizeTargetToUvBuffer(
  geometry: BufferGeometry,
  size: number,
  uvChannel: BakeSettings["uvChannel"],
  mergeDistance: number,
): UvSampleBuffer {
  const positionAttribute = geometry.getAttribute("position");
  const normalAttribute = geometry.getAttribute("normal");
  const uvAttribute = geometry.getAttribute(uvChannel);
  const index = geometry.index;

  if (!positionAttribute || !normalAttribute || !uvAttribute) {
    throw new Error("Target geometry is missing position, normal, or UV data.");
  }

  const pixelCount = size * size;
  const finalAo = new Float32Array(pixelCount);
  const coverage = new Uint8Array(pixelCount);
  const layerCounts = new Uint8Array(pixelCount);
  const layerWeights = new Float32Array(pixelCount * MAX_UV_LAYERS);
  const worldPositions = new Float32Array(pixelCount * 3);
  const worldNormals = new Float32Array(pixelCount * 3);
  const layerWorldPositions = new Float32Array(pixelCount * MAX_UV_LAYERS * 3);
  const layerWorldNormals = new Float32Array(pixelCount * MAX_UV_LAYERS * 3);

  const triangleCount = index ? index.count / 3 : positionAttribute.count / 3;
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const indexOffset = triangleIndex * 3;
    const a = index ? index.getX(indexOffset) : indexOffset;
    const b = index ? index.getX(indexOffset + 1) : indexOffset + 1;
    const c = index ? index.getX(indexOffset + 2) : indexOffset + 2;

    readUv(uvAttribute, a, size, tempUvA);
    readUv(uvAttribute, b, size, tempUvB);
    readUv(uvAttribute, c, size, tempUvC);

    const area = edgeFunction(tempUvA, tempUvB, tempUvC);
    if (Math.abs(area) < 0.0001) {
      continue;
    }

    const minX = clampInt(Math.floor(Math.min(tempUvA.x, tempUvB.x, tempUvC.x)), 0, size - 1);
    const maxX = clampInt(Math.ceil(Math.max(tempUvA.x, tempUvB.x, tempUvC.x)), 0, size - 1);
    const minY = clampInt(Math.floor(Math.min(tempUvA.y, tempUvB.y, tempUvC.y)), 0, size - 1);
    const maxY = clampInt(Math.ceil(Math.max(tempUvA.y, tempUvB.y, tempUvC.y)), 0, size - 1);

    tempPositionA.fromBufferAttribute(positionAttribute, a);
    tempPositionB.fromBufferAttribute(positionAttribute, b);
    tempPositionC.fromBufferAttribute(positionAttribute, c);
    tempNormalA.fromBufferAttribute(normalAttribute, a).normalize();
    tempNormalB.fromBufferAttribute(normalAttribute, b).normalize();
    tempNormalC.fromBufferAttribute(normalAttribute, c).normalize();

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        tempVec2.set(x + 0.5, y + 0.5);

        const baryA = edgeFunction(tempUvB, tempUvC, tempVec2) / area;
        const baryB = edgeFunction(tempUvC, tempUvA, tempVec2) / area;
        const baryC = edgeFunction(tempUvA, tempUvB, tempVec2) / area;

        if (
          baryA < -0.0001 ||
          baryB < -0.0001 ||
          baryC < -0.0001 ||
          baryA > 1.0001 ||
          baryB > 1.0001 ||
          baryC > 1.0001
        ) {
          continue;
        }

        const pixelIndex = y * size + x;

        tempSamplePosition.set(
          tempPositionA.x * baryA + tempPositionB.x * baryB + tempPositionC.x * baryC,
          tempPositionA.y * baryA + tempPositionB.y * baryB + tempPositionC.y * baryC,
          tempPositionA.z * baryA + tempPositionB.z * baryB + tempPositionC.z * baryC,
        );

        tempNormal
          .copy(tempNormalA)
          .multiplyScalar(baryA)
          .addScaledVector(tempNormalB, baryB)
          .addScaledVector(tempNormalC, baryC)
          .normalize();

        storeUvSample(
          {
            finalAo,
            coverage,
            layerCounts,
            layerWeights,
            worldNormals,
            worldPositions,
            layerWorldNormals,
            layerWorldPositions,
          },
          pixelIndex,
          tempSamplePosition,
          tempNormal,
          mergeDistance,
        );
      }
    }
  }

  return {
    finalAo,
    coverage,
    layerCounts,
    layerWeights,
    worldNormals,
    worldPositions,
    layerWorldNormals,
    layerWorldPositions,
  };
}

function resolveBakeMapSize(settings: BakeSettings): number {
  return settings.sampleMapSize;
}

async function computeAmbientOcclusion(
  sampleBuffer: UvSampleBuffer,
  bvh: MeshBVH,
  settings: BakeSettings,
  onProgress?: (progress: BakeProgress) => void,
): Promise<void> {
  const { coverage, finalAo, layerCounts, layerWeights, layerWorldNormals, layerWorldPositions } =
    sampleBuffer;
  const hemisphereSamples = generateHemisphereSamples(settings.samples);
  const pixelCount = coverage.length;
  const coverageCount = countCoverage(coverage);
  let processed = 0;

  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    if (coverage[pixelIndex] === 0) {
      continue;
    }

    const layerOffset = pixelIndex * MAX_UV_LAYERS;
    const layerCount = layerCounts[pixelIndex];
    let aoSum = 0;
    let weightSum = 0;

    for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
      const layerWeight = layerWeights[layerOffset + layerIndex];
      if (layerWeight <= 0) {
        continue;
      }

      const vectorIndex = (layerOffset + layerIndex) * 3;
      tempPixelPosition.set(
        layerWorldPositions[vectorIndex],
        layerWorldPositions[vectorIndex + 1],
        layerWorldPositions[vectorIndex + 2],
      );
      tempPixelNormal
        .set(
          layerWorldNormals[vectorIndex],
          layerWorldNormals[vectorIndex + 1],
          layerWorldNormals[vectorIndex + 2],
        )
        .normalize();

      buildOrthonormalBasis(tempPixelNormal, tempTangent, tempBitangent);

      const pixelHash = wangHash(pixelIndex * MAX_UV_LAYERS + layerIndex + 1);
      const randomRotation = (pixelHash / 4294967295) * Math.PI * 2;
      const originOffset = Math.max(
        settings.cageExtrusion,
        settings.rayBias * 1.5,
        settings.maxDistance * 0.02,
        0.0005,
      );
      const minHitDistance = Math.max(settings.rayBias * 0.5, originOffset * 0.25, 0.00005);

      let occludedSamples = 0;
      for (let sampleIndex = 0; sampleIndex < hemisphereSamples.length; sampleIndex += 1) {
        tempLocalDirection.copy(hemisphereSamples[sampleIndex]);
        rotateAroundNormal(tempLocalDirection, randomRotation);
        tempDirection
          .copy(tempTangent)
          .multiplyScalar(tempLocalDirection.x)
          .addScaledVector(tempBitangent, tempLocalDirection.y)
          .addScaledVector(tempPixelNormal, tempLocalDirection.z)
          .normalize();

        workingRay.origin.copy(tempPixelPosition).addScaledVector(tempPixelNormal, originOffset);
        workingRay.direction.copy(tempDirection);
        const hit = bvh.raycastFirst(
          workingRay,
          DoubleSide,
          minHitDistance,
          settings.maxDistance,
        );

        if (
          hit &&
          hit.distance < settings.maxDistance &&
          shouldCountHit(hit, tempDirection, settings.backfaceMode)
        ) {
          occludedSamples += 1;
        }
      }

      aoSum += (1 - occludedSamples / hemisphereSamples.length) * layerWeight;
      weightSum += layerWeight;
    }

    finalAo[pixelIndex] = weightSum > 0 ? aoSum / weightSum : 1;
    processed += 1;

    if (processed % 256 === 0 || processed === coverageCount) {
      onProgress?.({
        stage: "Ray AO",
        completed: processed,
        total: coverageCount,
      });
      await yieldToHost();
    }
  }
}

function blurAmbientOcclusion(sampleBuffer: UvSampleBuffer, settings: BakeSettings): Float32Array {
  const { finalAo, coverage, worldNormals, worldPositions } = sampleBuffer;
  const horizontalPass = new Float32Array(finalAo.length);
  const verticalPass = new Float32Array(finalAo.length);
  const mapSize = settings.sampleMapSize;
  const positionThreshold = Math.max(settings.maxDistance * 0.5, settings.rayBias * 8);

  applyBlurPass(
    finalAo,
    horizontalPass,
    coverage,
    worldNormals,
    worldPositions,
    mapSize,
    positionThreshold,
    1,
    0,
  );
  applyBlurPass(
    horizontalPass,
    verticalPass,
    coverage,
    worldNormals,
    worldPositions,
    mapSize,
    positionThreshold,
    0,
    1,
  );

  return verticalPass;
}

function applyBlurPass(
  sourceAo: Float32Array,
  targetAo: Float32Array,
  coverage: Uint8Array,
  worldNormals: Float32Array,
  worldPositions: Float32Array,
  size: number,
  positionThreshold: number,
  stepX: number,
  stepY: number,
): void {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixelIndex = y * size + x;
      if (coverage[pixelIndex] === 0) {
        targetAo[pixelIndex] = 1;
        continue;
      }

      const vectorIndex = pixelIndex * 3;
      tempPixelNormal
        .set(
          worldNormals[vectorIndex],
          worldNormals[vectorIndex + 1],
          worldNormals[vectorIndex + 2],
        )
        .normalize();
      tempPixelPosition.set(
        worldPositions[vectorIndex],
        worldPositions[vectorIndex + 1],
        worldPositions[vectorIndex + 2],
      );

      let aoSum = 0;
      let weightSum = 0;

      for (const [offset, baseWeight] of BLUR_KERNEL) {
        const sampleX = x + stepX * offset;
        const sampleY = y + stepY * offset;
        if (sampleX < 0 || sampleX >= size || sampleY < 0 || sampleY >= size) {
          continue;
        }

        const sampleIndex = sampleY * size + sampleX;
        if (coverage[sampleIndex] === 0) {
          continue;
        }

        const sampleVectorIndex = sampleIndex * 3;
        tempSampleNormal
          .set(
            worldNormals[sampleVectorIndex],
            worldNormals[sampleVectorIndex + 1],
            worldNormals[sampleVectorIndex + 2],
          )
          .normalize();
        tempSamplePosition.set(
          worldPositions[sampleVectorIndex],
          worldPositions[sampleVectorIndex + 1],
          worldPositions[sampleVectorIndex + 2],
        );

        const normalWeight = Math.pow(Math.max(tempPixelNormal.dot(tempSampleNormal), 0), 24);
        const positionDistance = tempPixelPosition.distanceTo(tempSamplePosition);
        const positionWeight =
          1 - smoothstep(positionThreshold, positionThreshold * 4, positionDistance);
        const combinedWeight = baseWeight * normalWeight * positionWeight;

        aoSum += sourceAo[sampleIndex] * combinedWeight;
        weightSum += combinedWeight;
      }

      targetAo[pixelIndex] = weightSum > 0.0001 ? aoSum / weightSum : sourceAo[pixelIndex];
    }
  }
}

function createAoPixels(
  aoValues: Float32Array,
  coverage: Uint8Array,
  size: number,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let index = 0; index < coverage.length; index += 1) {
    const colorIndex = index * 4;
    if (coverage[index] === 0) {
      data[colorIndex] = 255;
      data[colorIndex + 1] = 255;
      data[colorIndex + 2] = 255;
      data[colorIndex + 3] = 0;
      continue;
    }

    const colorValue = clampInt(Math.round(aoValues[index] * 255), 0, 255);
    data[colorIndex] = colorValue;
    data[colorIndex + 1] = colorValue;
    data[colorIndex + 2] = colorValue;
    data[colorIndex + 3] = 255;
  }

  return data;
}

function upscaleAoPixels(
  source: Uint8ClampedArray,
  sourceSize: number,
  targetSize: number,
): Uint8ClampedArray {
  if (sourceSize === targetSize) {
    return source.slice(0);
  }

  const target = new Uint8ClampedArray(targetSize * targetSize * 4);
  const scale = sourceSize / targetSize;

  for (let y = 0; y < targetSize; y += 1) {
    const sampleY = (y + 0.5) * scale - 0.5;
    const y0 = clampInt(Math.floor(sampleY), 0, sourceSize - 1);
    const y1 = clampInt(y0 + 1, 0, sourceSize - 1);
    const fy = sampleY - y0;

    for (let x = 0; x < targetSize; x += 1) {
      const sampleX = (x + 0.5) * scale - 0.5;
      const x0 = clampInt(Math.floor(sampleX), 0, sourceSize - 1);
      const x1 = clampInt(x0 + 1, 0, sourceSize - 1);
      const fx = sampleX - x0;
      const targetIndex = (y * targetSize + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const topLeft = source[(y0 * sourceSize + x0) * 4 + channel];
        const topRight = source[(y0 * sourceSize + x1) * 4 + channel];
        const bottomLeft = source[(y1 * sourceSize + x0) * 4 + channel];
        const bottomRight = source[(y1 * sourceSize + x1) * 4 + channel];
        const top = topLeft + (topRight - topLeft) * fx;
        const bottom = bottomLeft + (bottomRight - bottomLeft) * fx;
        target[targetIndex + channel] = clampInt(Math.round(top + (bottom - top) * fy), 0, 255);
      }
    }
  }

  return target;
}

function applyUvPaddingToPixels(
  pixels: Uint8ClampedArray,
  size: number,
  iterations: number,
): void {
  let source = new Uint8ClampedArray(pixels);
  let target = new Uint8ClampedArray(source.length);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    target.set(source);
    let expanded = false;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const pixelIndex = (y * size + x) * 4;
        if (source[pixelIndex + 3] > 0) {
          continue;
        }

        const sampleIndex = findNearestFilledNeighbor(source, size, x, y);
        if (sampleIndex === -1) {
          continue;
        }

        target[pixelIndex] = source[sampleIndex];
        target[pixelIndex + 1] = source[sampleIndex + 1];
        target[pixelIndex + 2] = source[sampleIndex + 2];
        target[pixelIndex + 3] = 255;
        expanded = true;
      }
    }

    source = target;
    target = new Uint8ClampedArray(source.length);

    if (!expanded) {
      break;
    }
  }

  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = source[index];
    pixels[index + 1] = source[index + 1];
    pixels[index + 2] = source[index + 2];
    pixels[index + 3] = 255;
  }
}

function storeUvSample(
  sampleBuffer: UvSampleBuffer,
  pixelIndex: number,
  position: Vector3,
  normal: Vector3,
  mergeDistance: number,
): void {
  const {
    coverage,
    layerCounts,
    layerWeights,
    layerWorldNormals,
    layerWorldPositions,
  } = sampleBuffer;

  coverage[pixelIndex] = 255;
  const mergeDistanceSq = mergeDistance * mergeDistance;
  const layerOffset = pixelIndex * MAX_UV_LAYERS;
  const previousLayerCount = layerCounts[pixelIndex];
  let targetLayer = -1;
  let closestLayer = 0;
  let closestDistanceSq = Number.POSITIVE_INFINITY;

  for (let layerIndex = 0; layerIndex < previousLayerCount; layerIndex += 1) {
    const vectorIndex = (layerOffset + layerIndex) * 3;
    tempLayerPosition.set(
      layerWorldPositions[vectorIndex],
      layerWorldPositions[vectorIndex + 1],
      layerWorldPositions[vectorIndex + 2],
    );
    tempLayerNormal
      .set(
        layerWorldNormals[vectorIndex],
        layerWorldNormals[vectorIndex + 1],
        layerWorldNormals[vectorIndex + 2],
      )
      .normalize();

    const distanceSq = tempLayerPosition.distanceToSquared(position);
    if (distanceSq < closestDistanceSq) {
      closestDistanceSq = distanceSq;
      closestLayer = layerIndex;
    }

    if (distanceSq <= mergeDistanceSq && tempLayerNormal.dot(normal) >= UV_LAYER_NORMAL_MERGE_DOT) {
      targetLayer = layerIndex;
      break;
    }
  }

  if (targetLayer === -1) {
    if (previousLayerCount < MAX_UV_LAYERS) {
      targetLayer = previousLayerCount;
      layerCounts[pixelIndex] = previousLayerCount + 1;
    } else {
      targetLayer = closestLayer;
    }
  }

  const layerWeightIndex = layerOffset + targetLayer;
  const vectorIndex = layerWeightIndex * 3;
  const previousWeight = layerWeights[layerWeightIndex];
  const nextWeight = previousWeight + 1;
  layerWeights[layerWeightIndex] = nextWeight;

  if (previousWeight === 0) {
    layerWorldPositions[vectorIndex] = position.x;
    layerWorldPositions[vectorIndex + 1] = position.y;
    layerWorldPositions[vectorIndex + 2] = position.z;
    layerWorldNormals[vectorIndex] = normal.x;
    layerWorldNormals[vectorIndex + 1] = normal.y;
    layerWorldNormals[vectorIndex + 2] = normal.z;
  } else {
    layerWorldPositions[vectorIndex] =
      (layerWorldPositions[vectorIndex] * previousWeight + position.x) / nextWeight;
    layerWorldPositions[vectorIndex + 1] =
      (layerWorldPositions[vectorIndex + 1] * previousWeight + position.y) / nextWeight;
    layerWorldPositions[vectorIndex + 2] =
      (layerWorldPositions[vectorIndex + 2] * previousWeight + position.z) / nextWeight;

    tempLayerNormal
      .set(
        layerWorldNormals[vectorIndex] * previousWeight + normal.x,
        layerWorldNormals[vectorIndex + 1] * previousWeight + normal.y,
        layerWorldNormals[vectorIndex + 2] * previousWeight + normal.z,
      )
      .normalize();

    layerWorldNormals[vectorIndex] = tempLayerNormal.x;
    layerWorldNormals[vectorIndex + 1] = tempLayerNormal.y;
    layerWorldNormals[vectorIndex + 2] = tempLayerNormal.z;
  }

  updateBlurGuidance(sampleBuffer, pixelIndex);
}

function estimateUvMergeDistance(
  geometry: BufferGeometry,
  sampleSize: number,
  settings: BakeSettings,
): number {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }

  const bounds = geometry.boundingBox ?? tempBounds.makeEmpty();
  bounds.getSize(tempBoundsSize);
  const maxExtent = Math.max(tempBoundsSize.x, tempBoundsSize.y, tempBoundsSize.z, 0.001);
  const texelFootprint = maxExtent / Math.max(sampleSize, 1);
  const footprintMergeDistance = texelFootprint * 0.08;
  const biasMergeDistance = settings.rayBias * 0.12;

  return clampScalar(
    Math.max(footprintMergeDistance, biasMergeDistance, MIN_UV_MERGE_DISTANCE),
    MIN_UV_MERGE_DISTANCE,
    MAX_UV_MERGE_DISTANCE,
  );
}

function generateHemisphereSamples(count: number): Vector3[] {
  const result: Vector3[] = [];

  for (let index = 0; index < count; index += 1) {
    const u = radicalInverseVdC(index);
    const v = (index + 0.5) / count;
    const radius = Math.sqrt(u);
    const theta = Math.PI * 2 * v;
    const x = Math.cos(theta) * radius;
    const y = Math.sin(theta) * radius;
    const z = Math.sqrt(Math.max(0, 1 - u));
    result.push(new Vector3(x, y, z).normalize());
  }

  return result;
}

function buildOrthonormalBasis(normal: Vector3, tangent: Vector3, bitangent: Vector3): void {
  if (Math.abs(normal.z) < 0.999) {
    tangent.set(0, 0, 1).cross(normal).normalize();
  } else {
    tangent.set(0, 1, 0).cross(normal).normalize();
  }

  bitangent.copy(normal).cross(tangent).normalize();
}

function rotateAroundNormal(direction: Vector3, angle: number): void {
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const x = direction.x * cosAngle - direction.y * sinAngle;
  const y = direction.x * sinAngle + direction.y * cosAngle;
  direction.set(x, y, direction.z);
}

function edgeFunction(a: Vector2, b: Vector2, c: Vector2): number {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function readUv(
  uvAttribute: Pick<BufferAttribute, "getX" | "getY">,
  index: number,
  size: number,
  target: Vector2,
): void {
  target.set(uvAttribute.getX(index) * (size - 1), (1 - uvAttribute.getY(index)) * (size - 1));
}

function countCoverage(coverage: Uint8Array): number {
  let covered = 0;
  for (let index = 0; index < coverage.length; index += 1) {
    if (coverage[index] !== 0) {
      covered += 1;
    }
  }
  return covered;
}

function hasCoverage(coverage: Uint8Array): boolean {
  return coverage.some((value) => value !== 0);
}

function shouldCountHit(
  hit: NonNullable<ReturnType<MeshBVH["raycastFirst"]>>,
  rayDirection: Vector3,
  backfaceMode: BakeSettings["backfaceMode"],
): boolean {
  if (backfaceMode === "count" || !hit.face) {
    return true;
  }

  return hit.face.normal.dot(rayDirection) < -0.0001;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampScalar(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(min: number, max: number, value: number): number {
  const t = Math.min(Math.max((value - min) / Math.max(max - min, 0.000001), 0), 1);
  return t * t * (3 - 2 * t);
}

function radicalInverseVdC(bits: number): number {
  let value = bits;
  value = ((value << 16) | (value >>> 16)) >>> 0;
  value = (((value & 0x55555555) << 1) | ((value & 0xaaaaaaaa) >>> 1)) >>> 0;
  value = (((value & 0x33333333) << 2) | ((value & 0xcccccccc) >>> 2)) >>> 0;
  value = (((value & 0x0f0f0f0f) << 4) | ((value & 0xf0f0f0f0) >>> 4)) >>> 0;
  value = (((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8)) >>> 0;
  return value * 2.3283064365386963e-10;
}

function wangHash(seed: number): number {
  let value = seed >>> 0;
  value = (value ^ 61) ^ (value >>> 16);
  value = Math.imul(value, 9);
  value = value ^ (value >>> 4);
  value = Math.imul(value, 0x27d4eb2d);
  value = value ^ (value >>> 15);
  return value >>> 0;
}

function cloneFloat32(source: Float32Array): Float32Array {
  return source.slice(0);
}

function updateBlurGuidance(sampleBuffer: UvSampleBuffer, pixelIndex: number): void {
  const {
    layerCounts,
    layerWeights,
    layerWorldNormals,
    layerWorldPositions,
    worldNormals,
    worldPositions,
  } = sampleBuffer;
  const layerOffset = pixelIndex * MAX_UV_LAYERS;
  const pixelVectorIndex = pixelIndex * 3;
  const layerCount = layerCounts[pixelIndex];

  let positionWeightSum = 0;
  let normalWeightSum = 0;
  let positionX = 0;
  let positionY = 0;
  let positionZ = 0;
  let normalX = 0;
  let normalY = 0;
  let normalZ = 0;

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const weight = layerWeights[layerOffset + layerIndex];
    if (weight <= 0) {
      continue;
    }

    const vectorIndex = (layerOffset + layerIndex) * 3;
    positionX += layerWorldPositions[vectorIndex] * weight;
    positionY += layerWorldPositions[vectorIndex + 1] * weight;
    positionZ += layerWorldPositions[vectorIndex + 2] * weight;
    normalX += layerWorldNormals[vectorIndex] * weight;
    normalY += layerWorldNormals[vectorIndex + 1] * weight;
    normalZ += layerWorldNormals[vectorIndex + 2] * weight;
    positionWeightSum += weight;
    normalWeightSum += weight;
  }

  if (positionWeightSum > 0) {
    worldPositions[pixelVectorIndex] = positionX / positionWeightSum;
    worldPositions[pixelVectorIndex + 1] = positionY / positionWeightSum;
    worldPositions[pixelVectorIndex + 2] = positionZ / positionWeightSum;
  }

  if (normalWeightSum > 0) {
    tempLayerNormal.set(normalX / normalWeightSum, normalY / normalWeightSum, normalZ / normalWeightSum);
    if (tempLayerNormal.lengthSq() > 0.000001) {
      tempLayerNormal.normalize();
      worldNormals[pixelVectorIndex] = tempLayerNormal.x;
      worldNormals[pixelVectorIndex + 1] = tempLayerNormal.y;
      worldNormals[pixelVectorIndex + 2] = tempLayerNormal.z;
    }
  }
}

function yieldToHost(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function findNearestFilledNeighbor(
  pixels: Uint8ClampedArray,
  size: number,
  x: number,
  y: number,
): number {
  for (let radius = 1; radius <= 2; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) {
          continue;
        }

        const sampleX = x + offsetX;
        const sampleY = y + offsetY;
        if (sampleX < 0 || sampleX >= size || sampleY < 0 || sampleY >= size) {
          continue;
        }

        const sampleIndex = (sampleY * size + sampleX) * 4;
        if (pixels[sampleIndex + 3] > 0) {
          return sampleIndex;
        }
      }
    }
  }

  return -1;
}
