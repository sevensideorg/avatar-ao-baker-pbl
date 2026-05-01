import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import type { Group } from "three";
import styles from "./App.module.css";
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
type ResizeHandle = "sidebar" | "scene";

const LAYOUT_BREAKPOINT = 1120;
const SIDEBAR_MIN_WIDTH = 320;
const PREVIEW_MIN_WIDTH = 320;
const RESIZE_RAIL_WIDTH = 14;

type ResizeState = {
  handle: ResizeHandle;
  pointerId: number;
  startX: number;
  startSidebarWidth: number;
  startSceneRatio: number;
};

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bakeAbortControllerRef = useRef<AbortController | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
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
  const [bakeBusy, setBakeBusy] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const [sceneWidth, setSceneWidth] = useState(580);
  const [compactLayout, setCompactLayout] = useState(false);
  const [activeResizeHandle, setActiveResizeHandle] = useState<ResizeHandle | null>(null);
  const sidebarWidthRef = useRef(sidebarWidth);
  const sceneWidthRef = useRef(sceneWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    sceneWidthRef.current = sceneWidth;
  }, [sceneWidth]);

  const stopResize = (event?: globalThis.PointerEvent) => {
    if (event && resizeStateRef.current && resizeStateRef.current.pointerId !== event.pointerId) {
      return;
    }

    resizeStateRef.current = null;
    setActiveResizeHandle(null);
    window.removeEventListener("pointermove", handleGlobalPointerMove);
    window.removeEventListener("pointerup", stopResize);
    window.removeEventListener("pointercancel", stopResize);
  };

  const handleGlobalPointerMove = (event: globalThis.PointerEvent) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - resizeState.startX;

    if (resizeState.handle === "sidebar") {
      const layoutWidth = layoutRef.current?.clientWidth ?? 0;
      const nextSidebarWidth = clampNumber(
        resizeState.startSidebarWidth + deltaX,
        SIDEBAR_MIN_WIDTH,
        getSidebarMaxWidth(layoutWidth),
      );
      setSidebarWidth(nextSidebarWidth);
      return;
    }

    const workspaceWidth = workspaceRef.current?.clientWidth ?? 0;
    if (workspaceWidth <= 0) {
      return;
    }

    const nextSceneWidth = clampNumber(
      resizeState.startSceneRatio * workspaceWidth + deltaX,
      PREVIEW_MIN_WIDTH,
      getSceneMaxWidth(workspaceWidth),
    );
    setSceneWidth(nextSceneWidth);
  };

  const selectedMesh = useMemo(
    () => meshOptions.find((mesh) => mesh.id === selectedMeshId) ?? null,
    [meshOptions, selectedMeshId],
  );
  const bakeTargetOptions = useMemo(
    () => meshOptions.filter((mesh) => mesh.canBake),
    [meshOptions],
  );
  const selectedInfluenceMeshes = useMemo(
    () => meshOptions.filter((mesh) => selectedInfluenceMeshIds.includes(mesh.id)),
    [meshOptions, selectedInfluenceMeshIds],
  );
  const recommendedBake = useMemo(
    () =>
      recommendBakeSettings({
        preferredUvChannel: settings.uvChannel,
        targetMesh: selectedMesh,
        influenceMeshes: selectedInfluenceMeshes,
        profileId: recommendationProfileId,
      }),
    [recommendationProfileId, selectedInfluenceMeshes, selectedMesh, settings.uvChannel],
  );
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

  useEffect(() => {
    return () => {
      stopResize();
    };
  }, []);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    const syncLayout = () => {
      const layoutWidth = layout.clientWidth;
      const nextCompactLayout = layoutWidth < LAYOUT_BREAKPOINT;
      setCompactLayout((current) => (current === nextCompactLayout ? current : nextCompactLayout));

      if (nextCompactLayout) {
        return;
      }

      const nextSidebarWidth = clampNumber(
        sidebarWidthRef.current,
        SIDEBAR_MIN_WIDTH,
        getSidebarMaxWidth(layoutWidth),
      );

      if (nextSidebarWidth !== sidebarWidthRef.current) {
        sidebarWidthRef.current = nextSidebarWidth;
        setSidebarWidth(nextSidebarWidth);
      }

      const workspaceWidth = Math.max(
        layoutWidth - nextSidebarWidth - RESIZE_RAIL_WIDTH,
        PREVIEW_MIN_WIDTH * 2 + RESIZE_RAIL_WIDTH,
      );
      const nextSceneWidth = clampNumber(
        sceneWidthRef.current,
        PREVIEW_MIN_WIDTH,
        getSceneMaxWidth(workspaceWidth),
      );

      if (nextSceneWidth !== sceneWidthRef.current) {
        sceneWidthRef.current = nextSceneWidth;
        setSceneWidth(nextSceneWidth);
      }
    };

    syncLayout();

    const resizeObserver = new ResizeObserver(() => {
      syncLayout();
    });
    resizeObserver.observe(layout);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
    const abortController = new AbortController();
    bakeAbortControllerRef.current = abortController;

    setBusy(true);
    setBakeBusy(true);
    setError(null);
    setStatus(mode === "preview" ? "Starting AO preview..." : "Starting AO bake...");

    try {
      const baked = await bakeAmbientOcclusion({
        root: sceneRoot,
        targetMesh: liveTarget,
        occluderMeshIds: selectedInfluenceMeshIds,
        settings: bakeSettings,
        fileStem: selectedMesh.name || fileName || "mesh",
        cancellation: {
          signal: abortController.signal,
        },
        onProgress: (progress) => {
          const total = Math.max(progress.total, 1);
          const percent = Math.round((progress.completed / total) * 100);
          setStatus(`${progress.stage} ${percent}%${mode === "preview" ? " (preview)" : ""}`);
        },
      });

      const nextTexture: BakeResult =
        mode === "preview" ? { ...baked, kind: "preview" } : { ...baked, kind: "final" };

      setBakedTexture(nextTexture);
      setStatus(buildBakeCompleteStatus(mode, nextTexture));
    } catch (caughtError) {
      if (isBakeCancelledError(caughtError)) {
        setStatus(mode === "preview" ? "Preview cancelled." : "Bake cancelled.");
        return;
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : mode === "preview"
            ? "Preview failed."
            : "Bake failed.";
      setError(message);
      setStatus(mode === "preview" ? "Preview failed." : "Bake failed.");
    } finally {
      if (bakeAbortControllerRef.current === abortController) {
        bakeAbortControllerRef.current = null;
      }
      setBakeBusy(false);
      setBusy(false);
    }
  };

  const handleCancelBake = () => {
    if (!bakeAbortControllerRef.current) {
      return;
    }

    bakeAbortControllerRef.current.abort();
    setStatus("Cancelling AO bake...");
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

  const saveTexture = async (override?: { buffer: ArrayBuffer; defaultFileName: string }) => {
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

  const handleResizeStart = (handle: ResizeHandle) => (event: PointerEvent<HTMLButtonElement>) => {
    if (compactLayout) {
      return;
    }

    event.preventDefault();
    setActiveResizeHandle(handle);
    resizeStateRef.current = {
      handle,
      pointerId: event.pointerId,
      startX: event.clientX,
      startSidebarWidth: sidebarWidth,
      startSceneRatio:
        handle === "scene" ? sceneWidth / Math.max(workspaceRef.current?.clientWidth ?? 1, 1) : 0,
    };
    window.addEventListener("pointermove", handleGlobalPointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  return (
    <div className={styles.app}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".fbx"
        className={styles.fileInput}
        onChange={handleBrowserFileChange}
      />
      <div className={styles.shell}>
        <div ref={layoutRef} className={styles.contentGrid}>
          <div
            className={styles.sidebarColumn}
            style={compactLayout ? undefined : { width: `${sidebarWidth}px` }}
          >
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

          <div className={styles.resizeRail}>
            <button
              type="button"
              className={`${styles.resizeHandle} ${
                activeResizeHandle === "sidebar" ? styles.resizeHandleActive : ""
              }`}
              aria-label="Resize control panel"
              onPointerDown={handleResizeStart("sidebar")}
            />
          </div>

          <div ref={workspaceRef} className={styles.workspaceColumn}>
            <section
              className={`${styles.scenePanel} panel-shell`}
              style={compactLayout ? undefined : { width: `${sceneWidth}px` }}
            >
              <div className={styles.sceneHeader}>
                <div>
                  <p className={styles.sceneEyebrow}>Scene Preview</p>
                  <h2 className={styles.sceneTitle}>{fileName ?? "No model loaded"}</h2>
                </div>
                {selectedMesh ? (
                  <div className={`${styles.sceneBadge} pill`}>{selectedMesh.name}</div>
                ) : null}
              </div>

              <div className={styles.sceneBody}>
                <div className={styles.sceneViewport}>
                  {sceneRoot ? (
                    <PreviewPane
                      sceneRoot={sceneRoot}
                      selectedMeshId={selectedMeshId}
                      selectedInfluenceMeshIds={selectedInfluenceMeshIds}
                    />
                  ) : (
                    <div className={styles.sceneEmpty}>
                      Open an FBX to inspect the imported scene and select a bake target.
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className={styles.resizeRail}>
              <button
                type="button"
                className={`${styles.resizeHandle} ${
                  activeResizeHandle === "scene" ? styles.resizeHandleActive : ""
                }`}
                aria-label="Resize preview panes"
                onPointerDown={handleResizeStart("scene")}
              />
            </div>

            <div className={styles.textureColumn}>
              <TexturePreview
                texture={bakedTexture}
                status={status}
                error={error}
                busy={busy}
                canBake={Boolean(sceneRoot && selectedMesh && selectedInfluenceMeshIds.length > 0)}
                canCancelBake={bakeBusy}
                canSave={Boolean(bakedTexture?.kind === "final")}
                onPreview={handlePreview}
                onBake={handleBake}
                onCancelBake={handleCancelBake}
                onSave={saveTexture}
              />
            </div>
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
    samples: 32,
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

function isBakeCancelledError(error: unknown): boolean {
  return error instanceof Error && error.name === "BakeCancelledError";
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getSidebarMaxWidth(layoutWidth: number): number {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    layoutWidth - RESIZE_RAIL_WIDTH - (PREVIEW_MIN_WIDTH * 2 + RESIZE_RAIL_WIDTH),
  );
}

function getSceneMaxWidth(workspaceWidth: number): number {
  return Math.max(PREVIEW_MIN_WIDTH, workspaceWidth - RESIZE_RAIL_WIDTH - PREVIEW_MIN_WIDTH);
}
