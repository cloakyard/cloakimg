// ResizePanel.tsx — Numeric W/H resize with optional aspect lock and a
// few quick presets ("long edge → 1080/2400/4096"). Bakes a resampled
// version of the working canvas into history on Apply.

import { useCallback, useEffect, useMemo, useState } from "react";
import { copyInto, createCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { PropRow, Segment } from "../atoms";
import { lanczosResampleAsync } from "./lanczos";
import { I } from "../../components/icons";

const LONG_EDGE_PRESETS = [
  { label: "1080", value: 1080 },
  { label: "1440", value: 1440 },
  { label: "2400", value: 2400 },
  { label: "4096", value: 4096 },
];

const FIT = ["Fit", "Fill", "Stretch"] as const;

export function ResizePanel() {
  const { doc, toolState, patchTool, commit, runBusy } = useEditor();
  const [fit, setFit] = useState(0);
  const [resizing, setResizing] = useState(false);

  // Initialize resize fields from the doc's actual size.
  useEffect(() => {
    if (!doc) return;
    if (toolState.resizeW === 0 || toolState.resizeH === 0) {
      patchTool("resizeW", doc.width);
      patchTool("resizeH", doc.height);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.width, doc?.height]);

  const aspect = doc && doc.height ? doc.width / doc.height : 1;

  const setW = useCallback(
    (w: number) => {
      patchTool("resizeW", Math.max(1, Math.round(w)));
      if (toolState.resizeAspectLock) {
        patchTool("resizeH", Math.max(1, Math.round(w / aspect)));
      }
    },
    [aspect, patchTool, toolState.resizeAspectLock],
  );

  const setH = useCallback(
    (h: number) => {
      patchTool("resizeH", Math.max(1, Math.round(h)));
      if (toolState.resizeAspectLock) {
        patchTool("resizeW", Math.max(1, Math.round(h * aspect)));
      }
    },
    [aspect, patchTool, toolState.resizeAspectLock],
  );

  const setLongEdge = useCallback(
    (px: number) => {
      if (!doc) return;
      if (doc.width >= doc.height) setW(px);
      else setH(px);
    },
    [doc, setH, setW],
  );

  const apply = useCallback(async () => {
    if (!doc || resizing) return;
    const targetW = toolState.resizeW;
    const targetH = toolState.resizeH;
    const useLanczos =
      toolState.resizeQuality === 1 &&
      Math.max(doc.width, doc.height) >= Math.max(targetW, targetH) * 1.4;

    setResizing(true);
    try {
      // Lanczos resample on a 24 MP photo runs in a worker but still
      // takes seconds end-to-end; surface a spinner so the Apply tap
      // doesn't look like it did nothing while the worker chews
      // through the resample.
      await runBusy(useLanczos ? "Resizing (high-quality)…" : "Resizing…", async () => {
        const fitMode = FIT[fit];
        let out: HTMLCanvasElement;
        if (fitMode === "Stretch") {
          out = useLanczos
            ? await lanczosResampleAsync(doc.working, targetW, targetH)
            : nativeStretch(doc, targetW, targetH);
        } else {
          // Fit / Fill: scale doc proportionally, paste centered onto a target-sized canvas.
          const s =
            fitMode === "Fit"
              ? Math.min(targetW / doc.width, targetH / doc.height)
              : Math.max(targetW / doc.width, targetH / doc.height);
          const scaledW = Math.max(1, Math.round(doc.width * s));
          const scaledH = Math.max(1, Math.round(doc.height * s));
          const scaled = useLanczos
            ? await lanczosResampleAsync(doc.working, scaledW, scaledH)
            : nativeStretch(doc, scaledW, scaledH);
          out = createCanvas(targetW, targetH);
          const ctx = out.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(scaled, (targetW - scaledW) / 2, (targetH - scaledH) / 2);
        }
        copyInto(doc.working, out);
        doc.width = out.width;
        doc.height = out.height;
        commit("Resize");
      });
    } finally {
      setResizing(false);
    }
  }, [
    commit,
    doc,
    fit,
    resizing,
    runBusy,
    toolState.resizeH,
    toolState.resizeQuality,
    toolState.resizeW,
  ]);

  const targetW = toolState.resizeW;
  const targetH = toolState.resizeH;

  // Cached small preview of the working canvas (~96 px long edge), so
  // the panel can show the user *what* their resize is shrinking. We
  // re-thumb only when the source canvas reference changes.
  const [sourceThumb, setSourceThumb] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!doc?.working) {
      setSourceThumb(null);
      return;
    }
    setSourceThumb(makeFitThumb(doc.working, 96));
  }, [doc?.working]);

  // Convert the cached source thumb to a data URL once. Cheaper than
  // toDataURL on every panel render (which would fire during slider
  // drags elsewhere in the editor).
  const sourceThumbUrl = useMemo(() => {
    if (!sourceThumb) return null;
    return sourceThumb.toDataURL("image/jpeg", 0.78);
  }, [sourceThumb]);

  // Aspect-aware preview box: the thumb element scales to a fixed
  // 96 × 96 box in CSS, with the inner image fitted at the source
  // aspect; the target box on the right scales to the *target* W/H
  // proportions inside the same 96 × 96 frame so the user sees the
  // shape change.
  const sourceBox = previewBox(doc?.width ?? 0, doc?.height ?? 0, 96);
  const targetBox = previewBox(targetW, targetH, 96);
  const pct = doc?.width ? Math.round((targetW / doc.width) * 100) : 100;

  return (
    <>
      <PropRow label="Preview">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-page-bg px-2.5 py-2 dark:bg-dark-page-bg">
          <div
            role="img"
            aria-label="Source size"
            className="checker relative shrink-0 overflow-hidden rounded-sm border border-border dark:border-dark-border"
            style={{ width: sourceBox.w, height: sourceBox.h }}
          >
            {sourceThumbUrl && (
              <img src={sourceThumbUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="flex flex-col items-center text-text-muted dark:text-dark-text-muted">
            <I.ArrowRight size={14} />
            <span className="t-mono text-[10.5px] font-semibold">{pct}%</span>
          </div>
          <div
            role="img"
            aria-label="Target size"
            className="checker relative shrink-0 overflow-hidden rounded-sm border border-coral-500"
            style={{ width: targetBox.w, height: targetBox.h }}
          >
            {sourceThumbUrl && (
              <img src={sourceThumbUrl} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        </div>
        {doc && (
          <div className="t-mono mt-1 text-center text-[10.5px] text-text-muted dark:text-dark-text-muted">
            {doc.width} × {doc.height} → {targetW} × {targetH} px
          </div>
        )}
      </PropRow>
      <PropRow label="Dimensions">
        <div className="flex items-center gap-1.5">
          <DimInput value={toolState.resizeW} onChange={setW} label="W" />
          <button
            type="button"
            onClick={() => patchTool("resizeAspectLock", !toolState.resizeAspectLock)}
            aria-pressed={toolState.resizeAspectLock}
            title={toolState.resizeAspectLock ? "Aspect locked" : "Aspect unlocked"}
            className={`inline-flex h-6.5 w-6.5 cursor-pointer items-center justify-center rounded-md border p-0 ${
              toolState.resizeAspectLock
                ? "border-coral-500 bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : "border-border bg-surface text-text-muted dark:border-dark-border dark:bg-dark-surface dark:text-dark-text-muted"
            }`}
          >
            <I.Lock size={11} />
          </button>
          <DimInput value={toolState.resizeH} onChange={setH} label="H" />
        </div>
      </PropRow>
      <PropRow label="Long edge">
        <div className="flex flex-wrap gap-1.5">
          {LONG_EDGE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className="btn btn-secondary flex-1 px-2! py-1.5! text-[11.5px]! pointer-coarse:py-2.5! pointer-coarse:text-[12.5px]!"
              onClick={() => setLongEdge(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </PropRow>
      <PropRow label="Fit">
        <Segment options={FIT as unknown as string[]} active={fit} onChange={setFit} />
      </PropRow>
      <PropRow label="Quality">
        <Segment
          options={["Fast", "High"]}
          active={toolState.resizeQuality}
          onChange={(i) => patchTool("resizeQuality", i)}
        />
      </PropRow>
      {toolState.resizeQuality === 1 && (
        <div className="text-[11px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          High runs a Lanczos-3 pass — sharper at moderate downscales, slower than Fast. Falls back
          to Fast automatically when the change is too small to benefit.
        </div>
      )}
      <button
        type="button"
        className="btn btn-primary justify-center px-2! py-2.25! text-[12.5px]! pointer-coarse:py-3! pointer-coarse:text-[13.5px]!"
        onClick={() => void apply()}
        disabled={resizing}
        aria-busy={resizing}
      >
        <I.Check size={12} /> {resizing ? "Resizing…" : "Apply resize"}
      </button>
    </>
  );
}

function nativeStretch(
  doc: { working: HTMLCanvasElement },
  w: number,
  h: number,
): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(doc.working, 0, 0, w, h);
  }
  return out;
}

/** Aspect-aware preview box. Returns the screen dimensions of a box
 *  that fits the source aspect into a `cap × cap` square, so source +
 *  target previews share a frame. */
function previewBox(w: number, h: number, cap: number): { w: number; h: number } {
  if (!w || !h) return { w: cap, h: cap };
  if (w >= h) return { w: cap, h: Math.max(8, Math.round((cap * h) / w)) };
  return { w: Math.max(8, Math.round((cap * w) / h)), h: cap };
}

/** Fit-into-square thumb for the resize preview. Different from the
 *  square-cropped thumbs used by Filter / Frame because we want the
 *  whole image visible, including its original aspect, so the
 *  preview matches what the user is shrinking. */
function makeFitThumb(src: HTMLCanvasElement, cap: number): HTMLCanvasElement {
  const { w, h } = previewBox(src.width, src.height, cap);
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

function DimInput({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="t-mono flex flex-1 items-center gap-1.5 rounded-md border border-border bg-page-bg px-2.5 py-1.5 text-[12.5px] dark:border-dark-border dark:bg-dark-page-bg">
      <span className="text-[10.5px] text-text-muted dark:text-dark-text-muted">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(+e.target.value || 0)}
        className="w-full min-w-0 border-none bg-transparent font-[inherit] text-[12.5px] text-text outline-none dark:text-dark-text"
      />
    </div>
  );
}
