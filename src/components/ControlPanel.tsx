import { InfluencePanel } from "./InfluencePanel";
import {
  bakeRecommendationProfiles,
  type BakeRecommendationProfileId,
} from "../lib/recommendBakeSettings";
import type { BakeSettings, MeshOption } from "../lib/types";

interface ControlPanelProps {
  fileName: string | null;
  bakeTargetOptions: MeshOption[];
  meshOptions: MeshOption[];
  selectedMeshId: string | null;
  selectedInfluenceMeshIds: string[];
  settings: BakeSettings;
  settingsMode: "recommended" | "manual";
  recommendationProfileId: BakeRecommendationProfileId;
  recommendedProfileLabel: string;
  busy: boolean;
  onOpenFile: () => void;
  onSelectMesh: (meshId: string) => void;
  onToggleInfluenceMesh: (meshId: string) => void;
  onSelectAllInfluenceMeshes: () => void;
  onSelectTargetOnlyInfluenceMeshes: () => void;
  onClearInfluenceMeshes: () => void;
  onSelectRecommendationProfile: (profileId: BakeRecommendationProfileId) => void;
  onUpdateSettings: (next: Partial<BakeSettings>) => void;
}

const fieldClassName =
  "mt-1 w-full rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1.5 text-[12px] text-white outline-none transition focus:border-cyan-400/50 focus:bg-slate-900";
const sectionClassName =
  "rounded-2xl border border-white/8 bg-white/[0.03] p-3";
const statCardClassName =
  "rounded-xl border border-white/6 bg-black/15 p-2 text-[10px] text-slate-400";
const qualityOptions: Array<{
  label: string;
  value: BakeSettings["samples"];
  description: string;
}> = [
  { label: "Draft", value: 32, description: "32 rays" },
  { label: "Standard", value: 64, description: "64 rays" },
  { label: "High", value: 128, description: "128 rays" },
  { label: "Ultra", value: 256, description: "256 rays" },
];
const textureSizeOptions = [2048, 4096] as const satisfies ReadonlyArray<BakeSettings["textureSize"]>;
const sampleMapSizeOptions = [128, 1024, 2048] as const satisfies ReadonlyArray<BakeSettings["sampleMapSize"]>;
const paddingOptions = [8, 16, 24] as const satisfies ReadonlyArray<BakeSettings["paddingPx"]>;
const backfaceModeOptions = ["ignore", "count"] as const satisfies ReadonlyArray<BakeSettings["backfaceMode"]>;

export function ControlPanel(props: ControlPanelProps) {
  const {
    busy,
    bakeTargetOptions,
    fileName,
    meshOptions,
    onClearInfluenceMeshes,
    onOpenFile,
    onSelectAllInfluenceMeshes,
    onSelectMesh,
    onSelectRecommendationProfile,
    onSelectTargetOnlyInfluenceMeshes,
    onToggleInfluenceMesh,
    onUpdateSettings,
    recommendationProfileId,
    recommendedProfileLabel,
    selectedInfluenceMeshIds,
    selectedMeshId,
    settings,
    settingsMode,
  } = props;

  const selectedMesh = bakeTargetOptions.find((mesh) => mesh.id === selectedMeshId) ?? null;
  return (
    <aside className="flex min-w-0 flex-col gap-2.5 rounded-[1.35rem] border border-white/10 bg-slate-950/65 p-3 shadow-[0_24px_100px_rgba(4,12,25,0.45)] backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-cyan-300/80">
            Avatar AO Baker
          </p>
          <h1 className="mt-1 text-[17px] font-semibold text-white">Load, bake, save.</h1>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">Ray AO for FBX avatars.</p>
        </div>
        <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.18em] text-cyan-200">
          Ray Bake
        </span>
      </div>

      <section className={sectionClassName}>
        <div className="grid gap-2.5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Workspace</p>
            <p className="mt-1 truncate text-[12px] font-medium text-slate-100">
              {fileName ?? "No FBX loaded"}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] text-slate-300">
              {bakeTargetOptions.length} bake target{bakeTargetOptions.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] text-slate-300">
              {formatSampleMapSize(settings.sampleMapSize)} internal map
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] text-slate-300">
              {formatQualityLabel(settings.samples)}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] text-slate-300">
              {settingsMode === "recommended" ? recommendedProfileLabel : "Manual"} settings
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenFile}
            disabled={busy}
            className="w-full rounded-xl bg-cyan-400 px-3 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/50"
          >
            Open FBX
          </button>
        </div>
      </section>

      <div className="space-y-3">
        <section className={sectionClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Selection</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-400">Pick the bake target.</p>
            </div>
            {selectedMesh ? (
              <div className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] text-slate-300">
                {selectedMesh.name}
              </div>
            ) : null}
          </div>

          <div className="mt-2.5 grid gap-2.5">
            <div>
              <label className="block text-sm text-slate-300">
                Target Mesh
                <select
                  className={fieldClassName}
                  value={selectedMeshId ?? ""}
                  onChange={(event) => onSelectMesh(event.target.value)}
                  disabled={bakeTargetOptions.length === 0 || busy}
                >
                  <option value="" disabled>
                    Select mesh
                  </option>
                  {bakeTargetOptions.map((mesh) => (
                    <option key={mesh.id} value={mesh.id}>
                      {mesh.name} ({mesh.triangleCount.toLocaleString()} tris)
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className={statCardClassName}>
                <p className="uppercase tracking-[0.18em]">Tris</p>
                <p className="mt-1.5 text-sm font-medium text-slate-100">
                  {selectedMesh ? selectedMesh.triangleCount.toLocaleString() : "0"}
                </p>
              </div>
              <div className={statCardClassName}>
                <p className="uppercase tracking-[0.18em]">UVs</p>
                <p className="mt-1.5 text-sm font-medium text-slate-100">
                  {selectedMesh ? selectedMesh.uvChannels.join(", ").toUpperCase() : "None"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <div className={statCardClassName}>
              <p className="uppercase tracking-[0.18em]">Vertices</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {selectedMesh ? selectedMesh.vertexCount.toLocaleString() : "0"}
              </p>
            </div>
            <div className={statCardClassName}>
              <p className="uppercase tracking-[0.18em]">Mode</p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {selectedMesh?.isSkinned ? "Skinned pose" : "Static"}
              </p>
            </div>
          </div>

          {selectedMesh?.isSkinned ? (
            <p className="mt-2.5 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[10px] leading-5 text-amber-100">
              Uses the current pose.
            </p>
          ) : null}
        </section>

        <InfluencePanel
          embedded
          meshOptions={meshOptions}
          selectedMeshId={selectedMeshId}
          selectedInfluenceMeshIds={selectedInfluenceMeshIds}
          busy={busy}
          onToggleInfluenceMesh={onToggleInfluenceMesh}
          onSelectAllInfluenceMeshes={onSelectAllInfluenceMeshes}
          onSelectTargetOnlyInfluenceMeshes={onSelectTargetOnlyInfluenceMeshes}
          onClearInfluenceMeshes={onClearInfluenceMeshes}
        />

        <section className={sectionClassName}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Bake</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-400">Pick a profile, then tweak.</p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-slate-300">
              {settings.textureSize}px export
            </span>
          </div>

          <div className="mt-2.5 grid gap-2">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                  AO Profile
                </p>
                <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  {settingsMode === "recommended" ? "Recommended" : "Manual"}
                </span>
              </div>
              <select
                className={fieldClassName}
                value={recommendationProfileId}
                onChange={(event) => {
                  const profileId = parseRecommendationProfileId(event.target.value);
                  if (profileId) {
                    onSelectRecommendationProfile(profileId);
                  }
                }}
                disabled={!selectedMesh || busy}
              >
                {bakeRecommendationProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <label className="block text-sm text-slate-300">
              UV Channel
              <select
                className={fieldClassName}
                value={settings.uvChannel}
                onChange={(event) => {
                  const uvChannel = parseUvChannel(event.target.value, selectedMesh?.uvChannels ?? []);
                  if (uvChannel) {
                    onUpdateSettings({ uvChannel });
                  }
                }}
                disabled={!selectedMesh || busy}
              >
                {(selectedMesh?.uvChannels ?? []).map((uvChannel) => (
                  <option key={uvChannel} value={uvChannel}>
                    {uvChannel.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Export Size
              <select
                className={fieldClassName}
                value={settings.textureSize}
                onChange={(event) => {
                  const textureSize = parseNumberOption(event.target.value, textureSizeOptions);
                  if (textureSize) {
                    onUpdateSettings({ textureSize });
                  }
                }}
                disabled={busy}
              >
                {textureSizeOptions.map((value) => (
                  <option key={value} value={value}>
                    {value} x {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Internal Map
              <select
                className={fieldClassName}
                value={settings.sampleMapSize}
                onChange={(event) => {
                  const sampleMapSize = parseNumberOption(event.target.value, sampleMapSizeOptions);
                  if (sampleMapSize) {
                    onUpdateSettings({ sampleMapSize });
                  }
                }}
                disabled={busy}
              >
                <option value={128}>128px Preview</option>
                <option value={1024}>1024px</option>
                <option value={2048}>2048px</option>
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Quality
              <select
                className={fieldClassName}
                value={settings.samples}
                onChange={(event) => {
                  const samples = parseNumberOption(
                    event.target.value,
                    qualityOptions.map((option) => option.value),
                  );
                  if (samples) {
                    onUpdateSettings({ samples });
                  }
                }}
                disabled={busy}
              >
                {qualityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} ({option.description})
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Padding
              <select
                className={fieldClassName}
                value={settings.paddingPx}
                onChange={(event) => {
                  const paddingPx = parseNumberOption(event.target.value, paddingOptions);
                  if (paddingPx) {
                    onUpdateSettings({ paddingPx });
                  }
                }}
                disabled={busy}
              >
                {paddingOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}px
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-300">
              Max Distance (mm)
              <input
                className={fieldClassName}
                type="number"
                min="1"
                step="0.5"
                value={metersToInputMillimeters(settings.maxDistance)}
                onChange={(event) => {
                  const nextValue = Number.parseFloat(event.target.value);
                  if (!Number.isNaN(nextValue)) {
                    onUpdateSettings({ maxDistance: nextValue / 1000 });
                  }
                }}
                disabled={busy}
              />
            </label>

            <label className="block text-sm text-slate-300">
              Ray Bias (mm)
              <input
                className={fieldClassName}
                type="number"
                min="0.1"
                step="0.1"
                value={metersToInputMillimeters(settings.rayBias)}
                onChange={(event) => {
                  const nextValue = Number.parseFloat(event.target.value);
                  if (!Number.isNaN(nextValue)) {
                    onUpdateSettings({ rayBias: nextValue / 1000 });
                  }
                }}
                disabled={busy}
              />
            </label>

            <label className="block text-sm text-slate-300">
              Cage Extrusion (mm)
              <input
                className={fieldClassName}
                type="number"
                min="0.1"
                step="0.1"
                value={metersToInputMillimeters(settings.cageExtrusion)}
                onChange={(event) => {
                  const nextValue = Number.parseFloat(event.target.value);
                  if (!Number.isNaN(nextValue)) {
                    onUpdateSettings({ cageExtrusion: nextValue / 1000 });
                  }
                }}
                disabled={busy}
              />
            </label>

            <label className="block text-sm text-slate-300">
              Backface Hits
              <select
                className={fieldClassName}
                value={settings.backfaceMode}
                onChange={(event) => {
                  const backfaceMode = parseStringOption(event.target.value, backfaceModeOptions);
                  if (backfaceMode) {
                    onUpdateSettings({ backfaceMode });
                  }
                }}
                disabled={busy}
              >
                <option value="ignore">Ignore</option>
                <option value="count">Count</option>
              </select>
            </label>
          </div>

          <p className="mt-2 text-[10px] leading-5 text-slate-500">
            Preview uses 32 rays and a 128px internal map. Final Bake uses the selected quality.
          </p>
        </section>
      </div>

    </aside>
  );
}

function formatQualityLabel(value: BakeSettings["samples"]): string {
  const match = qualityOptions.find((option) => option.value === value);
  return match ? match.label : `${value} rays`;
}

function metersToInputMillimeters(value: number): number {
  return Number((value * 1000).toFixed(1));
}

function parseRecommendationProfileId(value: string): BakeRecommendationProfileId | null {
  const match = bakeRecommendationProfiles.find((profile) => profile.id === value);
  return match?.id ?? null;
}

function parseUvChannel(
  value: string,
  uvChannels: BakeSettings["uvChannel"][],
): BakeSettings["uvChannel"] | null {
  return parseStringOption(value, uvChannels);
}

function parseNumberOption<T extends number>(value: string, options: ReadonlyArray<T>): T | null {
  const parsed = Number(value);
  const match = options.find((option) => option === parsed);
  return match ?? null;
}

function parseStringOption<T extends string>(value: string, options: ReadonlyArray<T>): T | null {
  const match = options.find((option) => option === value);
  return match ?? null;
}

function formatSampleMapSize(value: BakeSettings["sampleMapSize"]): string {
  switch (value) {
    case 128:
      return "128px";
    case 1024:
      return "1K";
    case 2048:
      return "2K";
    default:
      return `${value}px`;
  }
}
