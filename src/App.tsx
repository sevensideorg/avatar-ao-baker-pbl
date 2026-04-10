import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { Group } from "three";
import { ControlPanel } from "./components/ControlPanel";
import { PreviewPane } from "./components/PreviewPane";
import { TexturePreview } from "./components/TexturePreview";
import { bakeAmbientOcclusion } from "./lib/aoBake";
import { collectMeshes, getMeshById } from "./lib/collectMeshes";
import { disposeLoadedScene } from "./lib/disposeScene";
import { loadFbxFromBuffer } from "./lib/loadFbx";
import { recommendInfluenceMeshIds } from "./lib/recommendInfluenceMeshes";
import {
  recommendBakeSettings,
  type BakeRecommendationProfileId,
} from "./lib/recommendBakeSettings";
import type { BakeResult, BakeSettings, MeshOption } from "./lib/types";

const defaultSettings: BakeSettings = {
  textureSize: 2048,
  sampleMapSize: 1024,
  samples: 64,
  maxDistance: 0.018,
  rayBias: 0.0014,
  cageExtrusion: 0.0021,
  backfaceMode: "ignore",
  paddingPx: 24,
  uvChannel: "uv",
};

type BakeAction = "preview" | "final";

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sceneRoot, setSceneRoot] = useState<Group | null>(null);
  const [meshOptions, setMeshOptions] = useState<MeshOption[]>([]);
  const [selectedMeshId, setSelectedMeshId] = useState<string | null>(null);
  const [selectedInfluenceMeshIds, setSelectedInfluenceMeshIds] = useState<string[]>([]);
  const [settings, setSettings] = useState<BakeSettings>(defaultSettings);
  const [settingsMode, setSettingsMode] = useState<"recommended" | "manual">("recommended");
  const [recommendationProfileId, setRecommendationProfileId] =
    useState<BakeRecommendationProfileId>("auto");
  const [bakedTexture, setBakedTexture] = useState<BakeResult | null>(null);
  const [status, setStatus] = useState("Open an FBX to begin.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedMesh = meshOptions.find((mesh) => mesh.id === selectedMeshId) ?? null;
  const bakeTargetOptions = meshOptions.filter((mesh) => mesh.canBake);
  const selectedInfluenceMeshes = meshOptions.filter((mesh) => selectedInfluenceMeshIds.includes(mesh.id));
  const recommendedBake = recommendBakeSettings({
    preferredUvChannel: settings.uvChannel,
    targetMesh: selectedMesh,
    influenceMeshes: selectedInfluenceMeshes,
    profileId: recommendationProfileId,
  });
  const recommendedSettings = recommendedBake.settings;

  useEffect(() => {
    if (!selectedMesh) {
      return;
    }

    if (!selectedMesh.uvChannels.includes(settings.uvChannel)) {
      setSettings((current) => ({
        ...current,
        uvChannel: selectedMesh.uvChannels[0] ?? "uv",
      }));
    }
  }, [selectedMesh, settings.uvChannel]);

  useEffect(() => {
    if (settingsMode !== "recommended" || !selectedMesh) {
      return;
    }

    setSettings((current) =>
      areBakeSettingsEqual(current, recommendedSettings) ? current : recommendedSettings,
    );
  }, [recommendedSettings, selectedMesh, settingsMode]);

  useEffect(() => {
    return () => {
      if (!sceneRoot) {
        return;
      }

      const staleRoot = sceneRoot;
      window.setTimeout(() => {
        disposeLoadedScene(staleRoot);
      }, 0);
    };
  }, [sceneRoot]);

  const updateSettings = (next: Partial<BakeSettings>) => {
    setSettingsMode("manual");
    setSettings((current) => ({ ...current, ...next }));
  };

  const loadSceneFromBuffer = async (buffer: ArrayBuffer, nextFileName: string) => {
    const nextScene = await loadFbxFromBuffer(buffer, nextFileName);
    const nextMeshes = collectMeshes(nextScene);
    const nextBakeTargets = nextMeshes.filter((mesh) => mesh.canBake);
    if (nextBakeTargets.length === 0) {
      throw new Error("No mesh with UV data was found in this FBX.");
    }

    const firstMesh = nextBakeTargets[0];
    const provisionalRecommendation = recommendBakeSettings({
      preferredUvChannel: settings.uvChannel,
      targetMesh: firstMesh,
      influenceMeshes: [firstMesh],
      profileId: "auto",
    });
    let nextInfluenceMeshIds = recommendInfluenceMeshIds({
      targetMesh: firstMesh,
      meshOptions: nextMeshes,
      maxDistance: provisionalRecommendation.settings.maxDistance,
    });
    let nextSelectedInfluenceMeshes = nextMeshes.filter((mesh) =>
      nextInfluenceMeshIds.includes(mesh.id),
    );
    let nextRecommendedBake = recommendBakeSettings({
      preferredUvChannel: settings.uvChannel,
      targetMesh: firstMesh,
      influenceMeshes: nextSelectedInfluenceMeshes,
      profileId: "auto",
    });
    const refinedInfluenceMeshIds = recommendInfluenceMeshIds({
      targetMesh: firstMesh,
      meshOptions: nextMeshes,
      maxDistance: nextRecommendedBake.settings.maxDistance,
    });

    if (!areMeshIdListsEqual(nextInfluenceMeshIds, refinedInfluenceMeshIds)) {
      nextInfluenceMeshIds = refinedInfluenceMeshIds;
      nextSelectedInfluenceMeshes = nextMeshes.filter((mesh) =>
        nextInfluenceMeshIds.includes(mesh.id),
      );
      nextRecommendedBake = recommendBakeSettings({
        preferredUvChannel: settings.uvChannel,
        targetMesh: firstMesh,
        influenceMeshes: nextSelectedInfluenceMeshes,
        profileId: "auto",
      });
    }

    setFileName(nextFileName);
    setSceneRoot(nextScene);
    setMeshOptions(nextMeshes);
    setSelectedInfluenceMeshIds(nextInfluenceMeshIds);
    setSelectedMeshId(firstMesh.id);
    setRecommendationProfileId("auto");
    setSettingsMode("recommended");
    setSettings(nextRecommendedBake.settings);
    setBakedTexture(null);
    setStatus(
      `Loaded ${nextFileName}. ${nextBakeTargets.length} bake target${nextBakeTargets.length === 1 ? "" : "s"}, ${nextMeshes.length} scene mesh${nextMeshes.length === 1 ? "" : "es"} found. Applied ${nextRecommendedBake.resolvedProfileLabel} AO profile and selected ${nextInfluenceMeshIds.length} nearby influence mesh${nextInfluenceMeshIds.length === 1 ? "" : "es"}.`,
    );
  };

  const handleOpenFile = async () => {
    if (!window.avatarAo) {
      setError(null);
      setStatus("Using browser file picker because the Electron bridge is unavailable.");
      fileInputRef.current?.click();
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Waiting for FBX selection...");

    try {
      const result = await window.avatarAo.openFbxFile();
      if (result.canceled) {
        setStatus(sceneRoot ? "Open cancelled." : "Open an FBX to begin.");
        return;
      }

      if (!result.fileName || !result.buffer) {
        throw new Error(result.error || "The selected FBX could not be read.");
      }

      await loadSceneFromBuffer(result.buffer, result.fileName);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to load FBX.";
      setError(message);
      setStatus("Load failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleBrowserFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";

    if (!selectedFile) {
      setStatus(sceneRoot ? "Open cancelled." : "Open an FBX to begin.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Reading FBX from browser file picker...");

    try {
      const buffer = await selectedFile.arrayBuffer();
      await loadSceneFromBuffer(buffer, selectedFile.name);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Failed to load FBX.";
      setError(message);
      setStatus("Load failed.");
    } finally {
      setBusy(false);
    }
  };

  const runBake = async (mode: BakeAction) => {
    if (!sceneRoot || !selectedMeshId || !selectedMesh) {
      return;
    }

    if (selectedInfluenceMeshIds.length === 0) {
      setError("Select at least one influence mesh.");
      setStatus(mode === "preview" ? "Preview failed." : "Bake failed.");
      return;
    }

    const liveTarget = getMeshById(sceneRoot, selectedMeshId);
    if (!liveTarget) {
      setError("The selected mesh is no longer available.");
      setStatus(mode === "preview" ? "Preview failed." : "Bake failed.");
      return;
    }

    const bakeSettings = mode === "preview" ? createPreviewBakeSettings(settings) : settings;

    setBusy(true);
    setError(null);
    setStatus(mode === "preview" ? "Starting AO preview..." : "Starting AO bake...");

    try {
      const baked = await bakeAmbientOcclusion({
        root: sceneRoot,
        targetMesh: liveTarget,
        occluderMeshIds: selectedInfluenceMeshIds,
        settings: bakeSettings,
        fileStem: selectedMesh.name || fileName || "mesh",
        onProgress: (progress) => {
          const total = Math.max(progress.total, 1);
          const percent = Math.round((progress.completed / total) * 100);
          setStatus(
            `${progress.stage} ${percent}%${mode === "preview" ? " (preview)" : ""}`,
          );
        },
      });

      const nextTexture: BakeResult =
        mode === "preview" ? { ...baked, kind: "preview" } : { ...baked, kind: "final" };

      setBakedTexture(nextTexture);
      setStatus(buildBakeCompleteStatus(mode, nextTexture));
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : mode === "preview"
            ? "Preview failed."
            : "Bake failed.";
      setError(message);
      setStatus(mode === "preview" ? "Preview failed." : "Bake failed.");
    } finally {
      setBusy(false);
    }
  };

  const handlePreview = async () => {
    await runBake("preview");
  };

  const handleBake = async () => {
    await runBake("final");
  };

  const toggleInfluenceMesh = (meshId: string) => {
    setSelectedInfluenceMeshIds((current) =>
      current.includes(meshId)
        ? current.filter((candidateId) => candidateId !== meshId)
        : [...current, meshId],
    );
  };

  const selectAllInfluenceMeshes = () => {
    setSelectedInfluenceMeshIds(meshOptions.map((mesh) => mesh.id));
  };

  const selectTargetOnlyInfluenceMeshes = () => {
    if (!selectedMeshId) {
      return;
    }

    setSelectedInfluenceMeshIds([selectedMeshId]);
  };

  const clearInfluenceMeshes = () => {
    setSelectedInfluenceMeshIds([]);
  };

  const handleRecommendationProfileChange = (profileId: BakeRecommendationProfileId) => {
    setRecommendationProfileId(profileId);
    setSettingsMode("recommended");

    const nextRecommendedBake = recommendBakeSettings({
      preferredUvChannel: settings.uvChannel,
      targetMesh: selectedMesh,
      influenceMeshes: selectedInfluenceMeshes,
      profileId,
    });

    setSettings(nextRecommendedBake.settings);
  };

  const saveTexture = async (
    override?: {
      buffer: ArrayBuffer;
      defaultFileName: string;
    },
  ) => {
    const textureToSave =
      override ??
      (bakedTexture && bakedTexture.kind === "final"
        ? {
            buffer: bakedTexture.pngBuffer,
            defaultFileName: bakedTexture.defaultFileName,
          }
        : null);

    if (!textureToSave) {
      return;
    }

    if (!window.avatarAo) {
      const blob = new Blob([textureToSave.buffer], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = textureToSave.defaultFileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${textureToSave.defaultFileName} with the browser fallback.`);
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Waiting for save location...");

    try {
      const result = await window.avatarAo.savePng({
        defaultFileName: textureToSave.defaultFileName,
        buffer: textureToSave.buffer,
      });

      if (result.canceled) {
        setStatus("Save cancelled.");
        return;
      }

      setStatus(`Saved AO PNG to ${result.filePath}.`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Save failed.";
      setError(message);
      setStatus("Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-dvh overflow-hidden p-3 text-slate-100 lg:p-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".fbx"
        className="hidden"
        onChange={handleBrowserFileChange}
      />
      <div className="mx-auto h-full max-w-[1840px]">
        <div className="grid h-full grid-cols-[360px_minmax(0,1fr)] gap-3">
          <div className="min-h-0 overflow-y-auto pr-1.5">
            <ControlPanel
              fileName={fileName}
              bakeTargetOptions={bakeTargetOptions}
              meshOptions={meshOptions}
              selectedMeshId={selectedMeshId}
              selectedInfluenceMeshIds={selectedInfluenceMeshIds}
              settings={settings}
              settingsMode={settingsMode}
              recommendationProfileId={recommendationProfileId}
              recommendedProfileLabel={recommendedBake.resolvedProfileLabel}
              busy={busy}
              onOpenFile={handleOpenFile}
              onSelectMesh={setSelectedMeshId}
              onToggleInfluenceMesh={toggleInfluenceMesh}
              onSelectAllInfluenceMeshes={selectAllInfluenceMeshes}
              onSelectTargetOnlyInfluenceMeshes={selectTargetOnlyInfluenceMeshes}
              onClearInfluenceMeshes={clearInfluenceMeshes}
              onSelectRecommendationProfile={handleRecommendationProfileChange}
              onUpdateSettings={updateSettings}
            />
          </div>

          <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1.45fr)_minmax(420px,1.2fr)] items-stretch gap-3">
            <section className="flex h-full min-h-0 min-w-0 flex-col rounded-[1.55rem] border border-white/10 bg-slate-950/55 p-3 shadow-[0_24px_100px_rgba(4,12,25,0.36)] backdrop-blur-xl">
              <div className="mb-2.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
                    Scene Preview
                  </p>
                  <h2 className="mt-1.5 text-base font-semibold text-white">
                    {fileName ?? "No model loaded"}
                  </h2>
                </div>
                {selectedMesh ? (
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                    {selectedMesh.name}
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1">
                <div className="h-full min-h-[520px] w-full overflow-hidden rounded-[1.25rem] border border-white/8 bg-[#0b1118]">
                  {sceneRoot ? (
                    <PreviewPane
                      sceneRoot={sceneRoot}
                      selectedMeshId={selectedMeshId}
                      selectedInfluenceMeshIds={selectedInfluenceMeshIds}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-8 text-center text-sm leading-7 text-slate-400">
                      Open an FBX to inspect the imported scene and select a bake target.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <TexturePreview
              texture={bakedTexture}
              status={status}
              error={error}
              busy={busy}
              canBake={Boolean(sceneRoot && selectedMesh && selectedInfluenceMeshIds.length > 0)}
              canSave={Boolean(bakedTexture?.kind === "final")}
              onPreview={handlePreview}
              onBake={handleBake}
              onSave={saveTexture}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

function areBakeSettingsEqual(left: BakeSettings, right: BakeSettings): boolean {
  return (
    left.textureSize === right.textureSize &&
    left.sampleMapSize === right.sampleMapSize &&
    left.samples === right.samples &&
    left.maxDistance === right.maxDistance &&
    left.rayBias === right.rayBias &&
    left.cageExtrusion === right.cageExtrusion &&
    left.backfaceMode === right.backfaceMode &&
    left.paddingPx === right.paddingPx &&
    left.uvChannel === right.uvChannel
  );
}

function areMeshIdListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function createPreviewBakeSettings(settings: BakeSettings): BakeSettings {
  return {
    ...settings,
    textureSize: 2048,
    sampleMapSize: 128,
    paddingPx: 8,
  };
}

function buildBakeCompleteStatus(mode: BakeAction, baked: BakeResult): string {
  if (mode === "preview") {
    return baked.note
      ? `Preview complete. ${baked.note} Run Bake AO for the final PNG.`
      : "Preview complete. Run Bake AO for the final PNG.";
  }

  return baked.note
    ? `Bake complete. ${baked.note}`
    : `Bake complete. Ready to save ${baked.defaultFileName}.`;
}
