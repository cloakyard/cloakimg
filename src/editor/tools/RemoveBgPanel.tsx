// RemoveBgPanel.tsx — Local chroma-key background remover. Samples the
// perimeter for the target colour and clears all pixels within a
// colour-distance threshold, with edge feathering for clean cutouts on
// flat backgrounds. Auto-detect tunes the threshold + feather based on
// how solid the perimeter reads (variance-driven) with a small nudge
// for very dark / very bright backdrops (luminance).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I } from "../../icons";
import { PropRow, Slider } from "../atoms";
import { copyInto } from "../doc";
import { useEditor } from "../EditorContext";
import { computeAutoParams, looksAlreadyRemoved, removeBackground } from "./removeBg";

export function RemoveBgPanel() {
  const { toolState, patchTool, doc, commit, runBusy } = useEditor();
  // Inline error state replaces the older toast — the canvas itself
  // is the success confirmation, and a failure stays pinned next to
  // the Apply button so the user can read it and retry.
  const [bgError, setBgError] = useState<string | null>(null);

  // Re-derive on every render so it tracks undo / redo. Cheap — touches
  // four 1px-thick strips of the perimeter.
  const alreadyRemoved = useMemo(
    () => (doc ? looksAlreadyRemoved(doc.working) : false),
    // doc.working is mutated in place, so trigger on doc identity.
    [doc],
  );

  // On first entry per doc, reset threshold + feather to 0 so the
  // preview shows the original image untouched. The auto-tune used to
  // run here, but its perimeter sampling could pick a foreground tone
  // when the subject reaches close to an edge, leaving the user with
  // a wrong-looking cutout the moment they opened the tool. Now the
  // user explicitly clicks Auto-detect (or drags the sliders) to
  // engage the keyer.
  const seededFor = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!doc) return;
    if (seededFor.current === doc.working) return;
    seededFor.current = doc.working;
    if (alreadyRemoved) return;
    patchTool("genericStrength", 0);
    patchTool("feather", 0);
  }, [doc, alreadyRemoved, patchTool]);

  const autoTune = useCallback(() => {
    if (!doc) return;
    const auto = computeAutoParams(doc.working);
    patchTool("genericStrength", auto.threshold);
    patchTool("feather", auto.feather);
  }, [doc, patchTool]);

  const apply = useCallback(() => {
    if (!doc || alreadyRemoved) return;
    setBgError(null);
    // runBusy paints the global "Removing background…" spinner before
    // the synchronous chroma-key bake starts. Success needs no chrome
    // — the canvas itself shows the cutout. Failures land in the
    // inline alert below the Apply button.
    void runBusy("Removing background…", () => {
      try {
        const out = removeBackground(doc.working, {
          threshold: toolState.genericStrength,
          feather: toolState.feather,
          sample: parseHexSample(toolState.bgSample),
        });
        copyInto(doc.working, out);
        patchTool("bgSample", null);
        patchTool("bgPickActive", false);
        commit("Remove BG");
      } catch (err) {
        setBgError(err instanceof Error ? err.message : "Couldn't remove background");
      }
    });
  }, [
    alreadyRemoved,
    commit,
    doc,
    patchTool,
    runBusy,
    toolState.bgSample,
    toolState.feather,
    toolState.genericStrength,
  ]);

  const togglePick = useCallback(() => {
    patchTool("bgPickActive", !toolState.bgPickActive);
  }, [patchTool, toolState.bgPickActive]);

  const clearSample = useCallback(() => {
    patchTool("bgSample", null);
  }, [patchTool]);

  // Same signal the live preview uses: the user has only "engaged" the
  // keyer once they've run auto-detect, moved a slider, or picked a
  // sample colour. Until then, both the preview and the Apply button
  // stay inert so the canvas keeps showing the original image.
  const engaged =
    toolState.genericStrength > 0 || toolState.feather > 0 || toolState.bgSample !== null;
  const applyDisabled = alreadyRemoved || !engaged;

  return (
    <>
      <PropRow label="Edge feather" value={`${Math.round(toolState.feather * 30)} px`}>
        <Slider value={toolState.feather} accent onChange={(v) => patchTool("feather", v)} />
      </PropRow>
      <PropRow label="Threshold" value={`${Math.round(toolState.genericStrength * 100)}%`}>
        <Slider
          value={toolState.genericStrength}
          onChange={(v) => patchTool("genericStrength", v)}
        />
      </PropRow>
      <PropRow label="Sample">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={togglePick}
            disabled={alreadyRemoved}
            aria-pressed={toolState.bgPickActive}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border-none px-2 py-1.5 font-[inherit] text-[11.5px] font-semibold ${
              toolState.bgPickActive
                ? "bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300"
                : "bg-page-bg text-text-muted dark:bg-dark-page-bg dark:text-dark-text-muted"
            }`}
            style={{ opacity: alreadyRemoved ? 0.5 : 1 }}
          >
            <I.Pipette size={12} />
            {toolState.bgPickActive ? "Click image…" : "Pick"}
          </button>
          {toolState.bgSample && (
            <>
              <span
                className="h-6 w-6 shrink-0 rounded-md border border-border dark:border-dark-border"
                style={{ background: toolState.bgSample }}
                title={toolState.bgSample}
              />
              <button
                type="button"
                onClick={clearSample}
                aria-label="Clear sample"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-text-muted dark:text-dark-text-muted"
              >
                <I.X size={11} />
              </button>
            </>
          )}
        </div>
      </PropRow>
      <button
        type="button"
        className="btn btn-secondary justify-center"
        onClick={autoTune}
        disabled={alreadyRemoved}
        style={{ fontSize: 11.5, padding: "7px", opacity: alreadyRemoved ? 0.5 : 1 }}
      >
        <I.Wand size={12} /> Auto-detect
      </button>
      <button
        type="button"
        className="btn btn-primary justify-center"
        onClick={apply}
        disabled={applyDisabled}
        style={{ fontSize: 12.5, padding: "9px", opacity: applyDisabled ? 0.5 : 1 }}
      >
        {alreadyRemoved ? (
          <>
            <I.Check size={13} /> Background removed
          </>
        ) : (
          <>
            <I.Layers size={13} /> Remove background
          </>
        )}
      </button>
      {bgError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-coral-300 bg-coral-50 px-2.5 py-2 text-[11.5px] text-coral-900 dark:border-coral-500/40 dark:bg-coral-900/20 dark:text-coral-200"
        >
          <I.ShieldCheck size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1 wrap-break-word">{bgError}</span>
          <button
            type="button"
            onClick={() => setBgError(null)}
            aria-label="Dismiss error"
            className="-mr-0.5 -mt-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-current opacity-60 hover:opacity-100"
          >
            <I.X size={10} />
          </button>
        </div>
      )}
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {alreadyRemoved
          ? "The background is already cleared. Undo to bring it back, or place a new image to start over."
          : "Auto-detect tunes threshold + feather from the perimeter. Use Pick to click a specific colour on the image — useful when the subject and background share a similar tone."}
      </div>
    </>
  );
}

function parseHexSample(hex: string | null): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? "", 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
