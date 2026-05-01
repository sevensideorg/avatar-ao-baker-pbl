import { InfluencePanel } from "./InfluencePanel";
import styles from "./ControlPanel.module.css";
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
const textureSizeOptions = [2048, 4096] as const satisfies ReadonlyArray<
  BakeSettings["textureSize"]
>;
const sampleMapSizeOptions = [128, 1024, 2048] as const satisfies ReadonlyArray<
  BakeSettings["sampleMapSize"]
>;
const paddingOptions = [8, 16, 24] as const satisfies ReadonlyArray<BakeSettings["paddingPx"]>;
const backfaceModeOptions = ["ignore", "count"] as const satisfies ReadonlyArray<
  BakeSettings["backfaceMode"]
>;

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
    <aside className={`${styles.root} panel-shell`}>
      <div className={styles.header}>
        <div>
          <p className={styles.brandEyebrow}>Avatar AO Baker</p>
          <h1 className={styles.title}>Load, bake, save.</h1>
          <p className={styles.subtitle}>Ray AO for FBX avatars.</p>
        </div>
        <span className={`${styles.accentBadge} pill pill-accent`}>Ray Bake</span>
      </div>

      <section className="section-card">
        <div className={styles.sectionGrid}>
          <div className={styles.workspaceMeta}>
            <p className={styles.workspaceLabel}>Workspace</p>
            <p className={styles.workspaceValue}>{fileName ?? "No FBX loaded"}</p>
          </div>

          <div className={styles.metaPills}>
            <span className={`${styles.metaPill} pill pill-dark`}>
              {bakeTargetOptions.length} bake target{bakeTargetOptions.length === 1 ? "" : "s"}
            </span>
            <span className={`${styles.metaPill} pill pill-dark`}>
              {formatSampleMapSize(settings.sampleMapSize)} internal map
            </span>
            <span className={`${styles.metaPill} pill pill-dark`}>
              {formatQualityLabel(settings.samples)}
            </span>
            <span className={`${styles.metaPill} pill pill-dark`}>
              {settingsMode === "recommended" ? recommendedProfileLabel : "Manual"} settings
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenFile}
            disabled={busy}
            className={`${styles.openButton} button-base button-primary`}
          >
            Open FBX
          </button>
        </div>
      </section>

      <div className={styles.sectionStack}>
        <section className="section-card">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionTitle}>Selection</p>
              <p className={styles.sectionSubtitle}>Pick the bake target.</p>
            </div>
            {selectedMesh ? (
              <div className={`${styles.selectionBadge} pill pill-dark`}>{selectedMesh.name}</div>
            ) : null}
          </div>

          <div className={styles.fieldGroup}>
            <div>
              <label className={styles.label}>
                Target Mesh
                <select
                  className="field-control"
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

            <div className={styles.splitGrid}>
              <div className="stat-card">
                <p className={styles.statLabel}>Tris</p>
                <p className={styles.statValueLarge}>
                  {selectedMesh ? selectedMesh.triangleCount.toLocaleString() : "0"}
                </p>
              </div>
              <div className="stat-card">
                <p className={styles.statLabel}>UVs</p>
                <p className={styles.statValueLarge}>
                  {selectedMesh ? selectedMesh.uvChannels.join(", ").toUpperCase() : "None"}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.statsGrid}>
            <div className="stat-card">
              <p className={styles.statLabel}>Vertices</p>
              <p className={styles.statValue}>
                {selectedMesh ? selectedMesh.vertexCount.toLocaleString() : "0"}
              </p>
            </div>
            <div className="stat-card">
              <p className={styles.statLabel}>Mode</p>
              <p className={styles.statValue}>
                {selectedMesh?.isSkinned ? "Skinned pose" : "Static"}
              </p>
            </div>
          </div>

          {selectedMesh?.isSkinned ? (
            <p className={`${styles.warning} notice notice-warning`}>Uses the current pose.</p>
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

        <section className="section-card">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.sectionTitle}>Bake</p>
              <p className={styles.sectionSubtitle}>Pick a profile, then tweak.</p>
            </div>
            <span className={`${styles.modePill} pill pill-dark`}>
              {settings.textureSize}px export
            </span>
          </div>

          <div className={styles.fieldGroup}>
            <div>
              <div className={styles.sectionHeader}>
                <p className={styles.sectionTitle}>AO Profile</p>
                <span className={`${styles.modePill} pill pill-dark`}>
                  {settingsMode === "recommended" ? "Recommended" : "Manual"}
                </span>
              </div>
              <select
                className="field-control"
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

          <div className={styles.statsGrid}>
            <label className={styles.label}>
              UV Channel
              <select
                className="field-control"
                value={settings.uvChannel}
                onChange={(event) => {
                  const uvChannel = parseUvChannel(
                    event.target.value,
                    selectedMesh?.uvChannels ?? [],
                  );
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

            <label className={styles.label}>
              Export Size
              <select
                className="field-control"
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

            <label className={styles.label}>
              Internal Map
              <select
                className="field-control"
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

            <label className={styles.label}>
              Quality
              <select
                className="field-control"
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

            <label className={styles.label}>
              Padding
              <select
                className="field-control"
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

            <label className={styles.label}>
              Max Distance (mm)
              <input
                className="field-control"
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

            <label className={styles.label}>
              Ray Bias (mm)
              <input
                className="field-control"
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

            <label className={styles.label}>
              Cage Extrusion (mm)
              <input
                className="field-control"
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

            <label className={styles.label}>
              Backface Hits
              <select
                className="field-control"
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

          <p className={styles.helperText}>
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
