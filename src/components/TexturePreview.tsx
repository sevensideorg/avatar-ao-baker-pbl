import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { imageDataToPngBuffer } from "../lib/imageExport";
import type { BakeResult } from "../lib/types";

interface TexturePreviewProps {
  texture: BakeResult | null;
  status: string;
  error: string | null;
  busy: boolean;
  canBake: boolean;
  canSave: boolean;
  onPreview: () => void;
  onBake: () => void;
  onCancelBake: () => void;
  onSave: (override?: { buffer: ArrayBuffer; defaultFileName: string }) => Promise<void> | void;
}

interface AoRemapSettings {
  strength: number;
  contrast: number;
  gamma: number;
}

const DEFAULT_AO_REMAP: AoRemapSettings = {
  strength: 1,
  contrast: 1,
  gamma: 1,
};

export function TexturePreview({
  texture,
  status,
  error,
  busy,
  canBake,
  canSave,
  onPreview,
  onBake,
  onCancelBake,
  onSave,
}: TexturePreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewSourceRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageDataRef = useRef<ImageData | null>(null);
  const remappedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  } | null>(null);
  const zoomFactorRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const remapFrameRef = useRef<number | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoomFactor, setZoomFactor] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [remap, setRemap] = useState<AoRemapSettings>(DEFAULT_AO_REMAP);

  useEffect(() => {
    zoomFactorRef.current = 1;
    panOffsetRef.current = { x: 0, y: 0 };
    setZoomFactor(1);
  }, [texture]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (remapFrameRef.current !== null) {
        window.cancelAnimationFrame(remapFrameRef.current);
      }
      previewSourceRef.current = null;
      baseCanvasRef.current = null;
      baseImageDataRef.current = null;
      remappedCanvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const updateViewportSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateViewportSize();

    const resizeObserver = new ResizeObserver(() => {
      updateViewportSize();
    });
    resizeObserver.observe(viewport);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const fitScale = useMemo(() => {
    if (!texture || viewportSize.width <= 0 || viewportSize.height <= 0) {
      return 1;
    }

    const horizontalScale = Math.max((viewportSize.width - 32) / texture.width, 0.05);
    const verticalScale = Math.max((viewportSize.height - 32) / texture.height, 0.05);

    return Math.min(horizontalScale, verticalScale, 1);
  }, [texture, viewportSize.height, viewportSize.width]);

  const fittedWidth = texture
    ? Math.max(Math.round(texture.width * fitScale), 1)
    : 0;
  const fittedHeight = texture
    ? Math.max(Math.round(texture.height * fitScale), 1)
    : 0;
  const zoomScale = Math.max(zoomFactor, 1);
  const viewportInnerWidth = Math.max(viewportSize.width - 32, 1);
  const viewportInnerHeight = Math.max(viewportSize.height - 32, 1);
  const renderedWidth = fittedWidth * zoomScale;
  const renderedHeight = fittedHeight * zoomScale;
  const maxPanX = Math.max((renderedWidth - viewportInnerWidth) / 2, 0);
  const maxPanY = Math.max((renderedHeight - viewportInnerHeight) / 2, 0);

  const drawCanvas = (nextZoomFactor: number, nextPanOffset: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const cssWidth = Math.max(viewportSize.width, 1);
    const cssHeight = Math.max(viewportSize.height, 1);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.max(Math.round(cssWidth * pixelRatio), 1);
    const targetHeight = Math.max(Math.round(cssHeight * pixelRatio), 1);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    const previewSource = previewSourceRef.current;
    if (!texture || !previewSource) {
      return;
    }

    const currentZoomScale = Math.max(nextZoomFactor, 1);
    const drawWidth = fittedWidth * currentZoomScale;
    const drawHeight = fittedHeight * currentZoomScale;
    const drawMaxPanX = Math.max((drawWidth - viewportInnerWidth) / 2, 0);
    const drawMaxPanY = Math.max((drawHeight - viewportInnerHeight) / 2, 0);
    const drawPanOffset = clampPanOffset(nextPanOffset, drawMaxPanX, drawMaxPanY);
    const originX = 16 + (viewportInnerWidth - drawWidth) / 2 + drawPanOffset.x;
    const originY = 16 + (viewportInnerHeight - drawHeight) / 2 + drawPanOffset.y;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = currentZoomScale <= 1;
    context.imageSmoothingQuality = "high";
    context.drawImage(previewSource, originX, originY, drawWidth, drawHeight);
  };

  const scheduleViewportSync = () => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const nextZoomFactor = zoomFactorRef.current;
      const nextPanOffset = clampPanOffset(panOffsetRef.current, maxPanX, maxPanY);
      panOffsetRef.current = nextPanOffset;
      drawCanvas(nextZoomFactor, nextPanOffset);
      setZoomFactor(nextZoomFactor);
    });
  };

  useEffect(() => {
    previewSourceRef.current = null;
    baseCanvasRef.current = null;
    baseImageDataRef.current = null;
    remappedCanvasRef.current = null;

    if (!texture) {
      scheduleViewportSync();
      return;
    }

    let cancelled = false;
    loadPreviewSource(new Blob([texture.pngBuffer], { type: "image/png" }))
      .then((source) => {
        if (cancelled) {
          disposePreviewSource(source);
          return;
        }

        const { canvas, imageData } = rasterizePreviewSource(source, texture.width, texture.height);
        disposePreviewSource(source);
        baseCanvasRef.current = canvas;
        baseImageDataRef.current = imageData;
        rebuildPreviewSource();
      })
      .catch(() => {
        if (!cancelled) {
          scheduleViewportSync();
        }
      });

    return () => {
      cancelled = true;
      previewSourceRef.current = null;
      baseCanvasRef.current = null;
      baseImageDataRef.current = null;
      remappedCanvasRef.current = null;
    };
  }, [texture]);

  useEffect(() => {
    if (!texture || !baseImageDataRef.current) {
      return;
    }

    if (remapFrameRef.current !== null) {
      window.cancelAnimationFrame(remapFrameRef.current);
    }

    remapFrameRef.current = window.requestAnimationFrame(() => {
      remapFrameRef.current = null;
      rebuildPreviewSource();
    });
  }, [remap, texture]);

  useEffect(() => {
    panOffsetRef.current = clampPanOffset(panOffsetRef.current, maxPanX, maxPanY);
    scheduleViewportSync();
  }, [maxPanX, maxPanY, fittedHeight, fittedWidth, viewportSize.height, viewportSize.width]);

  const stepZoom = (multiplier: number, anchorX = 0, anchorY = 0) => {
    const currentZoomFactor = zoomFactorRef.current;
    const currentPanOffset = panOffsetRef.current;
    const nextZoomFactor = clampNumber(currentZoomFactor * multiplier, 1, 8);
    const normalizedX =
      currentZoomFactor <= 0 ? 0 : (anchorX - currentPanOffset.x) / currentZoomFactor;
    const normalizedY =
      currentZoomFactor <= 0 ? 0 : (anchorY - currentPanOffset.y) / currentZoomFactor;
    const nextPan = clampPanOffset(
      {
        x: anchorX - normalizedX * nextZoomFactor,
        y: anchorY - normalizedY * nextZoomFactor,
      },
      Math.max((fittedWidth * nextZoomFactor - viewportInnerWidth) / 2, 0),
      Math.max((fittedHeight * nextZoomFactor - viewportInnerHeight) / 2, 0),
    );

    zoomFactorRef.current = nextZoomFactor;
    panOffsetRef.current = nextPan;
    scheduleViewportSync();
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (!texture) {
        return;
      }

      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const anchorX = event.clientX - rect.left - rect.width / 2;
      const anchorY = event.clientY - rect.top - rect.height / 2;
      const multiplier = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      stepZoom(multiplier, anchorX, anchorY);
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleNativeWheel);
    };
  }, [texture, fittedHeight, fittedWidth, viewportInnerHeight, viewportInnerWidth]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!texture || !canPan) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPanX: panOffsetRef.current.x,
      startPanY: panOffsetRef.current.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    panOffsetRef.current = clampPanOffset(
      {
        x: dragState.startPanX + event.clientX - dragState.startX,
        y: dragState.startPanY + event.clientY - dragState.startY,
      },
      maxPanX,
      maxPanY,
    );
    scheduleViewportSync();
  };

  const endPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomFactorRef.current = 1;
    panOffsetRef.current = { x: 0, y: 0 };
    setZoomFactor(1);
    scheduleViewportSync();
  };

  const handleRemapChange =
    (key: keyof AoRemapSettings) => (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number.parseFloat(event.target.value);
      setRemap((current) => ({
        ...current,
        [key]: Number.isFinite(nextValue) ? nextValue : current[key],
      }));
    };

  const handleResetRemap = () => {
    setRemap(DEFAULT_AO_REMAP);
  };

  const handleSaveClick = async () => {
    if (!texture || texture.kind !== "final") {
      return;
    }

    if (!hasActiveRemap(remap) || !baseImageDataRef.current) {
      await onSave();
      return;
    }

    setSaveBusy(true);

    try {
      const remappedImageData = applyAoRemap(baseImageDataRef.current, remap);
      const remappedBuffer = await imageDataToPngBuffer(remappedImageData);
      await onSave({
        buffer: remappedBuffer,
        defaultFileName: texture.defaultFileName,
      });
    } finally {
      setSaveBusy(false);
    }
  };

  const canPan = maxPanX > 0 || maxPanY > 0;
  const isBusy = busy || saveBusy;
  const remapActive = hasActiveRemap(remap);
  const viewportCursorClassName = dragging ? "cursor-grabbing" : canPan ? "cursor-grab" : "cursor-default";

  function rebuildPreviewSource() {
    const baseCanvas = baseCanvasRef.current;
    const baseImageData = baseImageDataRef.current;

    if (!baseCanvas || !baseImageData) {
      previewSourceRef.current = null;
      scheduleViewportSync();
      return;
    }

    if (!hasActiveRemap(remap)) {
      previewSourceRef.current = baseCanvas;
      scheduleViewportSync();
      return;
    }

    const nextCanvas = remappedCanvasRef.current ?? document.createElement("canvas");
    nextCanvas.width = baseImageData.width;
    nextCanvas.height = baseImageData.height;
    const context = nextCanvas.getContext("2d");
    if (!context) {
      previewSourceRef.current = baseCanvas;
      scheduleViewportSync();
      return;
    }

    const remappedImageData = applyAoRemap(baseImageData, remap);
    context.putImageData(remappedImageData, 0, 0);
    remappedCanvasRef.current = nextCanvas;
    previewSourceRef.current = nextCanvas;
    scheduleViewportSync();
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col rounded-[1.55rem] border border-white/10 bg-slate-950/60 p-3.5 shadow-[0_24px_100px_rgba(4,12,25,0.36)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
            Texture Preview
          </p>
          <h2 className="mt-1.5 text-base font-semibold text-white">Baked AO output</h2>
          <p className="mt-1 text-[12px] leading-5 text-slate-400">Check before save.</p>
        </div>

        {texture ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {texture.kind === "preview" ? "Preview" : "Final"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {texture.width} x {texture.height}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {zoomFactor === 1 ? "Fit" : `${Math.round(zoomFactor * 100)}%`}
            </span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden">
        <div
          ref={viewportRef}
          className={`min-h-[220px] h-full overflow-hidden rounded-[1.25rem] border border-white/8 bg-[linear-gradient(45deg,rgba(255,255,255,0.04)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.04)_50%,rgba(255,255,255,0.04)_75%,transparent_75%,transparent)] bg-[length:24px_24px] select-none touch-none ${viewportCursorClassName}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
          onDoubleClick={handleDoubleClick}
        >
          {texture ? (
            <canvas
              ref={canvasRef}
              aria-label="Baked ambient occlusion texture preview"
              className="block h-full w-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="max-w-sm px-6 text-center text-sm leading-6 text-slate-400">
                AO preview appears here.
              </p>
            </div>
          )}
        </div>

        <div className="grid content-start gap-2.5">
          <div className="rounded-2xl border border-white/8 bg-black/20 p-2.5 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">AO Remap</p>
                <p className="mt-0.5 text-[11px] leading-5 text-slate-400">Adjust before save.</p>
              </div>
              <button
                type="button"
                onClick={handleResetRemap}
                disabled={!remapActive}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-slate-200 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:text-slate-500"
              >
                Reset
              </button>
            </div>

            <div className="mt-2.5 grid gap-2.5">
              <RemapSlider
                label="Strength"
                value={remap.strength}
                min={0.5}
                max={2}
                step={0.05}
                displayValue={`${Math.round(remap.strength * 100)}%`}
                disabled={!texture}
                onChange={handleRemapChange("strength")}
              />
              <RemapSlider
                label="Contrast"
                value={remap.contrast}
                min={0.5}
                max={2}
                step={0.05}
                displayValue={`${Math.round(remap.contrast * 100)}%`}
                disabled={!texture}
                onChange={handleRemapChange("contrast")}
              />
              <RemapSlider
                label="Gamma"
                value={remap.gamma}
                min={0.6}
                max={1.8}
                step={0.05}
                displayValue={remap.gamma.toFixed(2)}
                disabled={!texture}
                onChange={handleRemapChange("gamma")}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onPreview}
              disabled={!canBake || isBusy}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-semibold text-slate-100 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              Preview
            </button>
            <button
              type="button"
              onClick={onBake}
              disabled={!canBake || isBusy}
              className="rounded-xl border border-rose-300/25 bg-rose-500/20 px-4 py-2 text-[12px] font-semibold text-rose-50 transition hover:border-rose-200/45 hover:bg-rose-500/28 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500"
            >
              Bake AO
            </button>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!canSave || isBusy}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-[12px] font-semibold text-slate-100 transition hover:bg-white/8 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              Save PNG
            </button>
          </div>

          {busy ? (
            <button
              type="button"
              onClick={onCancelBake}
              className="rounded-xl border border-amber-300/25 bg-amber-300/12 px-4 py-2 text-[12px] font-semibold text-amber-50 transition hover:border-amber-200/45 hover:bg-amber-300/18"
            >
              Cancel Bake
            </button>
          ) : null}

          <p className="text-[10px] leading-5 text-slate-500">{status}</p>

          {texture?.kind === "preview" ? (
            <p className="rounded-xl border border-amber-300/15 bg-amber-300/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
              Preview only. Run Bake AO to save.
            </p>
          ) : null}

          {error ? (
            <p className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-[11px] leading-5 text-rose-100">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

type PreviewSource = ImageBitmap | HTMLImageElement;

async function loadPreviewSource(blob: Blob): Promise<PreviewSource> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(blob);
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(blob);
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load AO preview image."));
    };
    image.src = objectUrl;
  });
}

function disposePreviewSource(source: PreviewSource): void {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
    return;
  }

  if (source instanceof HTMLImageElement) {
    source.src = "";
  }
}

function rasterizePreviewSource(
  source: PreviewSource,
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; imageData: ImageData } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable.");
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return {
    canvas,
    imageData: context.getImageData(0, 0, width, height),
  };
}

function applyAoRemap(imageData: ImageData, remap: AoRemapSettings): ImageData {
  const source = imageData.data;
  const output = new Uint8ClampedArray(source.length);
  const lookup = buildAoRemapLookup(remap);

  for (let index = 0; index < source.length; index += 4) {
    output[index] = lookup[source[index]];
    output[index + 1] = lookup[source[index + 1]];
    output[index + 2] = lookup[source[index + 2]];
    output[index + 3] = source[index + 3];
  }

  return new ImageData(output, imageData.width, imageData.height);
}

function buildAoRemapLookup(remap: AoRemapSettings): Uint8ClampedArray {
  const lookup = new Uint8ClampedArray(256);

  for (let value = 0; value < 256; value += 1) {
    let normalized = value / 255;
    let occlusion = 1 - normalized;
    occlusion = clampUnit(occlusion * remap.strength);
    normalized = 1 - occlusion;
    normalized = clampUnit((normalized - 0.5) * remap.contrast + 0.5);
    normalized = clampUnit(Math.pow(normalized, remap.gamma));
    lookup[value] = Math.round(normalized * 255);
  }

  return lookup;
}

function hasActiveRemap(remap: AoRemapSettings): boolean {
  return (
    Math.abs(remap.strength - DEFAULT_AO_REMAP.strength) > 0.001 ||
    Math.abs(remap.contrast - DEFAULT_AO_REMAP.contrast) > 0.001 ||
    Math.abs(remap.gamma - DEFAULT_AO_REMAP.gamma) > 0.001
  );
}

function clampUnit(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function clampPanOffset(
  panOffset: { x: number; y: number },
  maxPanX: number,
  maxPanY: number,
): { x: number; y: number } {
  return {
    x: clampNumber(panOffset.x, -maxPanX, maxPanX),
    y: clampNumber(panOffset.y, -maxPanY, maxPanY),
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function RemapSlider({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  disabled: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-slate-200">{label}</span>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300">
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={onChange}
        className="h-2 cursor-pointer appearance-none rounded-full bg-white/10 accent-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
      />
    </label>
  );
}
