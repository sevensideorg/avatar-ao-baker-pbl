import type { MeshOption } from "../lib/types";

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

const chipButtonClassName =
  "rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-slate-500";

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
        embedded
          ? "min-w-0 rounded-2xl border border-white/8 bg-white/[0.03] p-3"
          : "min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/60 p-3 shadow-[0_24px_100px_rgba(4,12,25,0.36)] backdrop-blur-xl"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-slate-400">
            Influence
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-white">Occluders</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">Pick meshes that should occlude.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-slate-300">
          {selectedInfluenceMeshIds.length}/{meshOptions.length}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onSelectTargetOnlyInfluenceMeshes}
          disabled={!selectedMeshId || busy}
          className={chipButtonClassName}
        >
          Target Only
        </button>
        <button
          type="button"
          onClick={onSelectAllInfluenceMeshes}
          disabled={meshOptions.length === 0 || busy}
          className={chipButtonClassName}
        >
          All
        </button>
        <button
          type="button"
          onClick={onClearInfluenceMeshes}
          disabled={meshOptions.length === 0 || busy}
          className={chipButtonClassName}
        >
          Clear
        </button>
      </div>

      <details className="mt-2.5 min-w-0 overflow-hidden rounded-2xl border border-white/8 bg-black/15 p-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Manual Selection</p>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">Open to override.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            Toggle
          </span>
        </summary>

        <div className="mt-2.5 grid min-w-0 gap-1.5">
          {meshOptions.map((mesh) => {
            const checked = selectedInfluenceMeshIds.includes(mesh.id);
            const isTarget = mesh.id === selectedMeshId;

            return (
              <label
                key={mesh.id}
                className="flex min-w-0 cursor-pointer items-center gap-3 overflow-hidden rounded-xl border border-white/8 bg-black/20 px-3 py-1.5 text-[12px] text-slate-200 transition hover:border-white/15"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleInfluenceMesh(mesh.id)}
                  disabled={busy}
                  className="h-4 w-4 shrink-0 rounded border-white/20 bg-slate-900 text-cyan-400 focus:ring-cyan-400/40"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-100">
                      {mesh.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-white/8 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-400">
                      {isTarget ? "Target" : mesh.canBake ? "Mesh" : "Occluder"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-5 text-slate-500">
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
        <p className="mt-2.5 rounded-xl border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-[10px] leading-5 text-amber-100">
          Select at least one occluder.
        </p>
      ) : null}
    </section>
  );
}
