// BatchView.tsx — When the user toggles into batch mode, the canvas
// swaps for a thumbnail grid (drag/drop to add files) and the right
// panel becomes a recipe builder of reusable steps.

import { type DragEvent as ReactDragEvent, useCallback, useMemo, useRef, useState } from "react";
import { newStepId, type RecipeStep } from "./batch";
import { DropZone } from "../DropZone";
import { useEditor } from "./EditorContext";
import { buildStoreZip } from "./zip";
import { FILTER_PRESETS_RECIPES } from "./tools/filterPresets";
import { I } from "../icons";

interface CanvasProps {
  isMobile: boolean;
}

export function BatchCanvas({ isMobile }: CanvasProps) {
  const { batchFiles, batchAddFiles, batchClear } = useEditor();
  const inputRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => countByStatus(batchFiles), [batchFiles]);
  const progress = useMemo(() => {
    if (batchFiles.length === 0) return 0;
    const done = counts.done + counts.error;
    return done / batchFiles.length;
  }, [batchFiles.length, counts.done, counts.error]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length) batchAddFiles(files);
    },
    [batchAddFiles],
  );

  return (
    <section
      aria-label="Batch drop zone"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`flex-1 overflow-y-auto bg-page-bg dark:bg-dark-page-bg ${isMobile ? "p-3.5" : "p-6"}`}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">
            {batchFiles.length === 0
              ? "Drag images here to start a batch"
              : `Batch · ${batchFiles.length} file${batchFiles.length === 1 ? "" : "s"}`}
          </div>
          {batchFiles.length > 0 && (
            <div className="text-[11.5px] text-text-muted dark:text-dark-text-muted">
              {counts.progress} in progress · {counts.done} done · {counts.queued} queued
              {counts.error > 0 ? ` · ${counts.error} failed` : ""}
            </div>
          )}
        </div>
        {batchFiles.length > 0 && (
          <div className="flex gap-1.5">
            <button type="button" className="btn btn-ghost btn-xs" onClick={batchClear}>
              <I.X size={12} /> Clear
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => inputRef.current?.click()}
            >
              <I.Plus size={12} /> Add files
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) batchAddFiles(files);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      <div className="relative mb-4 h-1 overflow-hidden rounded-sm bg-border dark:bg-dark-border">
        <div
          className="absolute top-0 bottom-0 left-0 bg-coral-500"
          style={{ width: `${progress * 100}%`, transition: "width 220ms ease" }}
        />
      </div>

      {batchFiles.length === 0 ? (
        <DropZone
          isPhone={isMobile}
          multiple
          title="Drop images here to batch-edit"
          subtitle="or click to browse — build a recipe on the right, then run it across all files"
          onFiles={batchAddFiles}
        />
      ) : (
        <div
          className="grid gap-2.5"
          style={{
            gridTemplateColumns: isMobile
              ? "repeat(2, 1fr)"
              : "repeat(auto-fill, minmax(140px, 1fr))",
          }}
        >
          {batchFiles.map((f) => (
            <BatchThumb key={f.id} f={f} />
          ))}
        </div>
      )}
    </section>
  );
}

function BatchThumb({ f }: { f: ReturnType<typeof useEditor>["batchFiles"][number] }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-surface dark:border-dark-border dark:bg-dark-surface">
      {f.thumbUrl ? (
        <img
          src={f.thumbUrl}
          alt={f.name}
          className="h-full w-full object-cover"
          style={{ filter: f.status === "queued" ? "opacity(0.6)" : "none" }}
        />
      ) : (
        <div className="h-full w-full bg-page-bg dark:bg-dark-page-bg" />
      )}
      {f.status === "progress" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <div
            className="h-8 w-8 rounded-full border-[2.5px] border-white/25 border-t-white"
            style={{ animation: "ci-spin 0.9s linear infinite" }}
          />
        </div>
      )}
      {f.status === "done" && f.resultBlobUrl && (
        <a
          href={f.resultBlobUrl}
          download={f.resultName ?? f.name}
          className="absolute top-1.5 right-1.5 inline-flex h-5.5 w-5.5 items-center justify-center rounded-full bg-success text-white no-underline"
          aria-label={`Download ${f.resultName ?? f.name}`}
          title="Download"
        >
          <I.Check size={11} stroke={3} />
        </a>
      )}
      {f.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-danger/40 p-2 text-center text-[10px] font-semibold text-white">
          {f.error ?? "Failed"}
        </div>
      )}
      <div
        className="t-mono absolute right-0 bottom-0 left-0 overflow-hidden px-1.5 py-1 text-[10px] text-white whitespace-nowrap text-ellipsis"
        style={{ background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.6))" }}
      >
        {f.name}
      </div>
    </div>
  );
}

function countByStatus(arr: ReturnType<typeof useEditor>["batchFiles"]) {
  const out = { queued: 0, progress: 0, done: 0, error: 0 };
  for (const f of arr) out[f.status] += 1;
  return out;
}

// ── Recipe panel ────────────────────────────────────────────────────

type StepKind = RecipeStep["kind"];

const STEP_KIND_META: Record<StepKind, { Icon: typeof I.Resize; title: string }> = {
  resize: { Icon: I.Resize, title: "Resize" },
  adjust: { Icon: I.Sliders, title: "Adjust" },
  filter: { Icon: I.Wand, title: "Filter" },
  "strip-metadata": { Icon: I.Tag, title: "Strip metadata" },
  convert: { Icon: I.FileImage, title: "Convert" },
};

const FORMAT_LABELS = ["JPG", "PNG", "WebP", "AVIF"] as const;

function defaultStep(kind: StepKind): RecipeStep {
  const id = newStepId();
  switch (kind) {
    case "resize":
      return { id, kind: "resize", longEdge: 2400 };
    case "adjust":
      return {
        id,
        kind: "adjust",
        vector: [0.5, 0.55, 0.5, 0.55, 0.5, 0.5, 0.55, 0.55, 0.5],
      };
    case "filter":
      return { id, kind: "filter", preset: 1, intensity: 0.65, grain: 0 };
    case "strip-metadata":
      return { id, kind: "strip-metadata" };
    case "convert":
      return { id, kind: "convert", settings: { format: 0, quality: 0.82, sizeBucket: 1 } };
  }
}

function describeStep(step: RecipeStep): string {
  switch (step.kind) {
    case "resize":
      return `Long edge → ${step.longEdge} px`;
    case "adjust":
      return "Custom adjust vector";
    case "filter": {
      const name = FILTER_PRESETS_RECIPES[step.preset]?.name ?? `#${step.preset}`;
      return `${name} · ${Math.round(step.intensity * 100)}%`;
    }
    case "strip-metadata":
      return "GPS · camera · timestamp";
    case "convert": {
      const fmt = FORMAT_LABELS[step.settings.format] ?? "JPG";
      return `${fmt} · ${Math.round(step.settings.quality * 100)}%`;
    }
  }
}

export function BatchPanel({ collapsed = false }: { collapsed?: boolean }) {
  const { batchFiles, recipe, setRecipe, runBatch, batchRunning } = useEditor();
  const [addingOpen, setAddingOpen] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const onDragStart = useCallback((e: ReactDragEvent<HTMLElement>, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }, []);
  const onDragOver = useCallback((e: ReactDragEvent<HTMLElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDropStep = useCallback(
    (e: ReactDragEvent<HTMLElement>, target: number) => {
      e.preventDefault();
      const source = parseInt(e.dataTransfer.getData("text/plain") || "-1", 10);
      setDragIdx(null);
      if (Number.isNaN(source) || source === target || source < 0) return;
      setRecipe((prev) => {
        const next = prev.slice();
        const [moved] = next.splice(source, 1);
        if (!moved) return prev;
        next.splice(target, 0, moved);
        return next;
      });
    },
    [setRecipe],
  );

  const doneFiles = batchFiles.filter((f) => f.status === "done" && f.resultBlobUrl);
  const downloadAllZip = useCallback(async () => {
    if (doneFiles.length === 0) return;
    const entries = await Promise.all(
      doneFiles.map(async (f) => {
        const blob = await fetch(f.resultBlobUrl ?? "").then((r) => r.blob());
        return { name: f.resultName ?? f.name, blob };
      }),
    );
    const zip = await buildStoreZip(entries);
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cloakimg-batch-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }, [doneFiles]);

  return (
    <div
      className={`editor-paper scroll-thin flex shrink-0 flex-col overflow-y-auto border-l border-border bg-surface dark:border-dark-border dark:bg-dark-surface ${
        collapsed ? "w-65" : "w-75"
      }`}
    >
      <div className="border-b border-border-soft px-4 py-3.5 dark:border-dark-border-soft">
        <div className="t-eyebrow mb-1.5 text-[10px]">Recipe</div>
        <div className="text-sm font-semibold">
          Apply to {batchFiles.length === 0 ? "..." : `${batchFiles.length} files`}
        </div>
        <div className="mt-0.75 text-[11.5px] text-text-muted dark:text-dark-text-muted">
          Drag steps to reorder · click to expand parameters.
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 px-4 py-3.5">
        {recipe.map((step, i) => {
          const meta = STEP_KIND_META[step.kind];
          const expanded = expandedIdx === i;
          return (
            <li
              key={step.id}
              draggable
              onDragStart={(e) => onDragStart(e, i)}
              onDragOver={onDragOver}
              onDrop={(e) => onDropStep(e, i)}
              className="flex flex-col rounded-lg border border-border-soft bg-page-bg dark:border-dark-border-soft dark:bg-dark-page-bg"
              style={{ opacity: dragIdx === i ? 0.4 : 1 }}
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setExpandedIdx(expanded ? null : i)}
                  className="flex min-w-0 flex-1 cursor-grab items-center gap-2.5 border-none bg-transparent px-3 py-2.5 text-left font-[inherit] text-inherit"
                >
                  <span className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
                    <meta.Icon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold">{meta.title}</span>
                    <span className="block text-[10.5px] text-text-muted dark:text-dark-text-muted">
                      {describeStep(step)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecipe((prev) => prev.filter((s) => s.id !== step.id));
                    if (expandedIdx === i) setExpandedIdx(null);
                  }}
                  aria-label="Remove step"
                  className="cursor-pointer border-none bg-transparent px-2.5 py-0 text-text-muted dark:text-dark-text-muted"
                >
                  <I.X size={12} />
                </button>
              </div>
              {expanded && (
                <div className="border-t border-border-soft px-3 pb-3 dark:border-dark-border-soft">
                  <StepEditor
                    step={step}
                    onChange={(next) =>
                      setRecipe((prev) => prev.map((s) => (s.id === step.id ? next : s)))
                    }
                  />
                </div>
              )}
            </li>
          );
        })}

        <li className="relative list-none">
          <button
            type="button"
            className="btn btn-secondary btn-xs w-full justify-center"
            onClick={() => setAddingOpen((o) => !o)}
          >
            <I.Plus size={12} /> Add step
          </button>
          {addingOpen && (
            <div
              role="menu"
              className="absolute right-0 left-0 z-20 overflow-hidden rounded-lg border border-border bg-surface dark:border-dark-border dark:bg-dark-surface"
              style={{ top: "calc(100% + 4px)", boxShadow: "var(--shadow-float)" }}
            >
              {(["resize", "adjust", "filter", "strip-metadata", "convert"] as StepKind[]).map(
                (k) => {
                  const m = STEP_KIND_META[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setRecipe((prev) => [...prev, defaultStep(k)]);
                        setAddingOpen(false);
                        setExpandedIdx(recipe.length);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 border-none bg-transparent px-3 py-2.5 font-[inherit] text-xs text-inherit"
                    >
                      <m.Icon size={13} />
                      {m.title}
                    </button>
                  );
                },
              )}
            </div>
          )}
        </li>
      </ul>
      <div className="flex-1" />
      <div className="flex flex-col gap-2 border-t border-border-soft px-4 py-3.5 dark:border-dark-border-soft">
        <button
          type="button"
          className="btn btn-primary btn-sm justify-center"
          onClick={runBatch}
          disabled={batchFiles.length === 0 || batchRunning}
        >
          <I.Play size={13} /> {batchRunning ? "Running…" : `Run on ${batchFiles.length} files`}
        </button>
        {doneFiles.length > 0 && !batchRunning && (
          <button
            type="button"
            className="btn btn-secondary btn-xs justify-center"
            onClick={() => void downloadAllZip()}
          >
            <I.Download size={12} /> Download all ({doneFiles.length}) as .zip
          </button>
        )}
        <div className="text-center text-[10.5px] text-text-muted dark:text-dark-text-muted">
          {batchFiles.length === 0
            ? "Drop files in the left panel to start"
            : "Done thumbnails become individual download links"}
        </div>
      </div>
    </div>
  );
}

interface StepEditorProps {
  step: RecipeStep;
  onChange: (next: RecipeStep) => void;
}

function StepEditor({ step, onChange }: StepEditorProps) {
  if (step.kind === "resize") {
    return (
      <NumberRow
        label="Long edge (px)"
        value={step.longEdge}
        min={64}
        max={8192}
        onChange={(n) => onChange({ ...step, longEdge: n })}
      />
    );
  }
  if (step.kind === "filter") {
    return (
      <>
        <SelectRow
          label="Preset"
          value={step.preset}
          options={FILTER_PRESETS_RECIPES.map((p, i) => ({ value: i, label: p.name }))}
          onChange={(v) => onChange({ ...step, preset: v })}
        />
        <NumberRow
          label="Intensity"
          value={Math.round(step.intensity * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(n) => onChange({ ...step, intensity: n / 100 })}
        />
        <NumberRow
          label="Grain"
          value={Math.round(step.grain * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(n) => onChange({ ...step, grain: n / 100 })}
        />
      </>
    );
  }
  if (step.kind === "convert") {
    return (
      <>
        <SelectRow
          label="Format"
          value={step.settings.format}
          options={FORMAT_LABELS.map((l, i) => ({ value: i, label: l }))}
          onChange={(v) => onChange({ ...step, settings: { ...step.settings, format: v } })}
        />
        <NumberRow
          label="Quality"
          value={Math.round(step.settings.quality * 100)}
          min={1}
          max={100}
          suffix="%"
          onChange={(n) => onChange({ ...step, settings: { ...step.settings, quality: n / 100 } })}
        />
      </>
    );
  }
  if (step.kind === "adjust") {
    return (
      <div className="py-2 text-[11px] text-text-muted dark:text-dark-text-muted">
        Custom adjust vectors are edited via the Adjust tool. Tweak there, then re-create this step
        to capture the new values.
      </div>
    );
  }
  return (
    <div className="py-2 text-[11px] text-text-muted dark:text-dark-text-muted">
      Strips GPS, camera info, and timestamps from the source EXIF on JPEG output.
    </div>
  );
}

interface NumberRowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (next: number) => void;
}

function NumberRow({ label, value, min, max, suffix, onChange }: NumberRowProps) {
  return (
    <label className="flex items-center justify-between gap-2.5 py-1.5 text-[11.5px]">
      <span className="text-text-muted dark:text-dark-text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const n = +e.target.value;
            if (!Number.isFinite(n)) return;
            onChange(Math.max(min ?? n, Math.min(max ?? n, n)));
          }}
          className="w-16 rounded border border-border bg-surface px-1.5 py-1 text-right font-mono text-[11.5px] text-text dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
        />
        {suffix && (
          <span className="text-[10.5px] text-text-muted dark:text-dark-text-muted">{suffix}</span>
        )}
      </span>
    </label>
  );
}

interface SelectRowProps {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (next: number) => void;
}

function SelectRow({ label, value, options, onChange }: SelectRowProps) {
  return (
    <label className="flex items-center justify-between gap-2.5 py-1.5 text-[11.5px]">
      <span className="text-text-muted dark:text-dark-text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="rounded border border-border bg-surface px-1.5 py-1 font-[inherit] text-[11.5px] text-text dark:border-dark-border dark:bg-dark-surface dark:text-dark-text"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
