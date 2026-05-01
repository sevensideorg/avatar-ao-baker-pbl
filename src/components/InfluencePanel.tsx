import type { MeshOption } from "../lib/types";
import styles from "./InfluencePanel.module.css";

interface InfluencePanelProps {
  meshOptions: MeshOption[];
  selectedMeshId: string | null;
  selectedInfluenceMeshIds: string[];
  busy: boolean;
  embedded?: boolean;
  onToggleInfluenceMesh: (meshId: string) => void;
  onSelectAllInfluenceMeshes: () => void;
  onSelectTargetOnlyInfluenceMeshes: () => void;
  onClearInfluenceMeshes: () => void;
}

export function InfluencePanel(props: InfluencePanelProps) {
  const {
    busy,
    meshOptions,
    onClearInfluenceMeshes,
    onSelectAllInfluenceMeshes,
    onSelectTargetOnlyInfluenceMeshes,
    onToggleInfluenceMesh,
    embedded = false,
    selectedInfluenceMeshIds,
    selectedMeshId,
  } = props;

  return (
    <section
      className={
        embedded ? `section-card ${styles.rootEmbedded}` : `panel-shell ${styles.rootStandalone}`
      }
    >
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Influence</p>
          <h2 className={styles.title}>Occluders</h2>
          <p className={styles.subtitle}>Pick meshes that should occlude.</p>
        </div>
        <span className={`${styles.countPill} pill`}>
          {selectedInfluenceMeshIds.length}/{meshOptions.length}
        </span>
      </div>

      <div className={styles.chipRow}>
        <button
          type="button"
          onClick={onSelectTargetOnlyInfluenceMeshes}
          disabled={!selectedMeshId || busy}
          className={`${styles.chipButton} button-base button-neutral button-chip`}
        >
          Target Only
        </button>
        <button
          type="button"
          onClick={onSelectAllInfluenceMeshes}
          disabled={meshOptions.length === 0 || busy}
          className={`${styles.chipButton} button-base button-neutral button-chip`}
        >
          All
        </button>
        <button
          type="button"
          onClick={onClearInfluenceMeshes}
          disabled={meshOptions.length === 0 || busy}
          className={`${styles.chipButton} button-base button-neutral button-chip`}
        >
          Clear
        </button>
      </div>

      <details className={styles.details}>
        <summary className={styles.summary}>
          <div>
            <p className={styles.summaryTitle}>Manual Selection</p>
            <p className={styles.summaryText}>Open to override.</p>
          </div>
          <span className={`${styles.togglePill} pill`}>Toggle</span>
        </summary>

        <div className={styles.list}>
          {meshOptions.map((mesh) => {
            const checked = selectedInfluenceMeshIds.includes(mesh.id);
            const isTarget = mesh.id === selectedMeshId;

            return (
              <label key={mesh.id} className={styles.row}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleInfluenceMesh(mesh.id)}
                  disabled={busy}
                  className={styles.checkbox}
                />
                <div className={styles.rowBody}>
                  <div className={styles.rowHeader}>
                    <span className={styles.rowTitle}>{mesh.name}</span>
                    <span className={`${styles.rowPill} pill`}>
                      {isTarget ? "Target" : mesh.canBake ? "Mesh" : "Occluder"}
                    </span>
                  </div>
                  <p className={styles.rowMeta}>
                    {mesh.triangleCount.toLocaleString()} tris
                    {mesh.isSkinned ? " • Skinned" : ""}
                    {!mesh.canBake ? " • No UV bake target" : ""}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </details>

      {selectedInfluenceMeshIds.length === 0 ? (
        <p className={`${styles.warning} notice notice-warning`}>Select at least one occluder.</p>
      ) : null}
    </section>
  );
}
