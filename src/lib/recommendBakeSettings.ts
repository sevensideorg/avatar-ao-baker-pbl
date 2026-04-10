import { Box3, Vector3 } from "three";
import type { BakeSettings, MeshOption } from "./types";

export type BakeRecommendationProfileId =
  | "auto"
  | "body"
  | "bodyDeep"
  | "clothing"
  | "hair"
  | "face"
  | "accessory";

type ResolvedBakeRecommendationProfileId = Exclude<BakeRecommendationProfileId, "auto">;

interface RecommendBakeSettingsInput {
  preferredUvChannel: BakeSettings["uvChannel"];
  targetMesh: MeshOption | null;
  influenceMeshes: MeshOption[];
  profileId: BakeRecommendationProfileId;
}

interface BakeRecommendationProfileDefinition {
  id: ResolvedBakeRecommendationProfileId;
  label: string;
  description: string;
  distanceFactor: number;
  minDistance: number;
  maxDistance: number;
  biasFactor: number;
  minBias: number;
  maxBias: number;
}

export interface BakeRecommendation {
  profileId: BakeRecommendationProfileId;
  resolvedProfileId: ResolvedBakeRecommendationProfileId;
  resolvedProfileLabel: string;
  summary: string;
  settings: BakeSettings;
}

export const bakeRecommendationProfiles: Array<{
  id: BakeRecommendationProfileId;
  label: string;
  description: string;
}> = [
  {
    id: "auto",
    label: "Auto Detect",
    description: "Pick a profile from the target mesh name and scale.",
  },
  {
    id: "hair",
    label: "Hair",
    description: "Short-range occlusion for bangs, strands, and scalp-adjacent shells.",
  },
  {
    id: "clothing",
    label: "Clothing",
    description: "Close-contact folds and layered cloth around the body.",
  },
  {
    id: "face",
    label: "Face",
    description: "Smaller AO radius for eyelids, lips, and facial detail.",
  },
  {
    id: "body",
    label: "Body",
    description: "Broader AO for torso, limbs, and the main skin mesh.",
  },
  {
    id: "bodyDeep",
    label: "Body Deep AO",
    description: "Stronger body occlusion with a wider reach for deeper cavities.",
  },
  {
    id: "accessory",
    label: "Accessory",
    description: "Compact AO for small props, horns, ribbons, and add-ons.",
  },
];

const profileDefinitions: Record<
  ResolvedBakeRecommendationProfileId,
  BakeRecommendationProfileDefinition
> = {
  body: {
    id: "body",
    label: "Body",
    description: "Broader AO for torso and limb surfaces.",
    distanceFactor: 0.013,
    minDistance: 0.014,
    maxDistance: 0.024,
    biasFactor: 0.07,
    minBias: 0.0011,
    maxBias: 0.0019,
  },
  bodyDeep: {
    id: "bodyDeep",
    label: "Body Deep AO",
    description: "Deeper body AO for armpits, fingers, knees, and torso cavities.",
    distanceFactor: 0.017,
    minDistance: 0.02,
    maxDistance: 0.03,
    biasFactor: 0.065,
    minBias: 0.0012,
    maxBias: 0.002,
  },
  clothing: {
    id: "clothing",
    label: "Clothing",
    description: "Tighter AO for layered cloth and close-contact folds.",
    distanceFactor: 0.01,
    minDistance: 0.01,
    maxDistance: 0.018,
    biasFactor: 0.08,
    minBias: 0.001,
    maxBias: 0.0016,
  },
  hair: {
    id: "hair",
    label: "Hair",
    description: "Short-distance AO for dense strands and scalp-adjacent shapes.",
    distanceFactor: 0.008,
    minDistance: 0.008,
    maxDistance: 0.014,
    biasFactor: 0.08,
    minBias: 0.0008,
    maxBias: 0.0014,
  },
  face: {
    id: "face",
    label: "Face",
    description: "Small-radius AO for facial detail and tight creases.",
    distanceFactor: 0.0065,
    minDistance: 0.006,
    maxDistance: 0.011,
    biasFactor: 0.075,
    minBias: 0.0006,
    maxBias: 0.0011,
  },
  accessory: {
    id: "accessory",
    label: "Accessory",
    description: "Compact AO for small add-on meshes.",
    distanceFactor: 0.0085,
    minDistance: 0.007,
    maxDistance: 0.013,
    biasFactor: 0.075,
    minBias: 0.0007,
    maxBias: 0.0012,
  },
};

const tempTargetBounds = new Box3();
const tempTargetSize = new Vector3();
const tempInfluenceBounds = new Box3();
const tempInfluenceSize = new Vector3();

export function recommendBakeSettings(input: RecommendBakeSettingsInput): BakeRecommendation {
  const { influenceMeshes, preferredUvChannel, profileId, targetMesh } = input;

  if (!targetMesh) {
    return {
      profileId,
      resolvedProfileId: "body",
      resolvedProfileLabel: "Body",
      summary: "Load a mesh to resolve the AO profile. The body profile is used as the fallback.",
      settings: {
        textureSize: 2048,
        sampleMapSize: 1024,
        samples: 64,
        maxDistance: 0.018,
        rayBias: 0.0014,
        cageExtrusion: 0.0021,
        backfaceMode: "ignore",
        paddingPx: 24,
        uvChannel: "uv",
      },
    };
  }

  const targetBounds = tempTargetBounds.setFromObject(targetMesh.object);
  targetBounds.getSize(tempTargetSize);

  const influenceBounds = tempInfluenceBounds.makeEmpty();
  for (const influenceMesh of influenceMeshes) {
    influenceBounds.expandByObject(influenceMesh.object);
  }
  influenceBounds.getSize(tempInfluenceSize);

  const targetScale = maxDimension(tempTargetSize);
  const influenceScale = influenceBounds.isEmpty() ? 0 : maxDimension(tempInfluenceSize);
  const referenceScale = clamp(Math.max(targetScale, influenceScale * 0.35), 0.3, 1.9);

  const resolvedProfileId =
    profileId === "auto"
      ? inferProfileId(targetMesh.name, targetScale, selectedInfluenceCount(influenceMeshes))
      : profileId;
  const profile = profileDefinitions[resolvedProfileId];
  const maxDistance = roundTo(
    clamp(referenceScale * profile.distanceFactor, profile.minDistance, profile.maxDistance),
    3,
  );
  const rayBias = roundTo(
    clamp(maxDistance * profile.biasFactor, profile.minBias, profile.maxBias),
    4,
  );
  const cageExtrusion = roundTo(resolveCageExtrusion(maxDistance, rayBias), 4);

  const summary =
    profileId === "auto"
      ? `Auto resolved to ${profile.label}. ${profile.description}`
      : `${profile.label} profile active. ${profile.description}`;

  return {
    profileId,
    resolvedProfileId,
    resolvedProfileLabel: profile.label,
    summary,
    settings: {
      textureSize: 2048,
      sampleMapSize: resolveSampleMapSize(profile),
      samples: 64,
      maxDistance,
      rayBias,
      cageExtrusion,
      backfaceMode: "ignore",
      paddingPx: resolvePadding(profile),
      uvChannel: targetMesh.uvChannels.includes(preferredUvChannel)
        ? preferredUvChannel
        : (targetMesh.uvChannels[0] ?? "uv"),
    },
  };
}

function inferProfileId(
  meshName: string,
  targetScale: number,
  influenceCount: number,
): ResolvedBakeRecommendationProfileId {
  const normalizedName = meshName.toLowerCase();

  if (containsAny(normalizedName, ["hair", "bang", "fringe", "ponytail", "twintail", "braid", "ahoge"])) {
    return "hair";
  }

  if (containsAny(normalizedName, ["face", "head", "eye", "brow", "eyelash", "mouth", "lip", "tooth", "teeth", "tongue"])) {
    return "face";
  }

  if (
    containsAny(normalizedName, [
      "cloth",
      "clothes",
      "dress",
      "shirt",
      "jacket",
      "coat",
      "hoodie",
      "skirt",
      "pants",
      "sock",
      "shoe",
      "glove",
      "uniform",
      "kimono",
      "sleeve",
      "cape",
      "armor",
      "apron",
      "bra",
      "panty",
      "underwear",
    ])
  ) {
    return "clothing";
  }

  if (containsAny(normalizedName, ["body", "skin", "torso", "arm", "leg", "hand", "foot", "neck"])) {
    return "body";
  }

  if (targetScale <= 0.16) {
    return "accessory";
  }

  if (targetScale <= 0.36 && influenceCount >= 3) {
    return "hair";
  }

  if (targetScale <= 0.4) {
    return "face";
  }

  return "body";
}

function resolveSampleMapSize(
  profile: BakeRecommendationProfileDefinition,
): BakeSettings["sampleMapSize"] {
  switch (profile.id) {
    case "hair":
    case "face":
    case "bodyDeep":
      return 2048;
    case "body":
    case "clothing":
    case "accessory":
    default:
      return 1024;
  }
}

function resolvePadding(
  profile: BakeRecommendationProfileDefinition,
): BakeSettings["paddingPx"] {
  switch (profile.id) {
    case "hair":
      return 24;
    case "clothing":
      return 24;
    case "face":
      return 16;
    case "accessory":
      return 16;
    case "body":
    case "bodyDeep":
    default:
      return 24;
  }
}

function resolveCageExtrusion(maxDistance: number, rayBias: number): number {
  return clamp(
    Math.max(maxDistance * 0.1, rayBias * 1.4),
    0.0012,
    Math.max(maxDistance * 0.16, 0.0018),
  );
}

function containsAny(source: string, tokens: string[]): boolean {
  return tokens.some((token) => source.includes(token));
}

function selectedInfluenceCount(influenceMeshes: MeshOption[]): number {
  return influenceMeshes.length;
}

function maxDimension(size: Vector3): number {
  return Math.max(size.x, size.y, size.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
