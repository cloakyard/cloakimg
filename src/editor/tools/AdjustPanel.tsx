// AdjustPanel.tsx — Sliders + Reset. The bake into history happens
// automatically when the user switches tools or opens Export
// (registerPendingApply hook), so an explicit Apply button is
// redundant — Undo/Redo are the recovery path.

import { useCallback, useEffect, useRef } from "react";
import { I } from "../../icons";
import { PropRow, Slider } from "../atoms";
import { copyInto } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { ADJUST_KEYS } from "../toolState";
import { bakeAdjustAsync, isIdentity } from "./adjustments";

const LABELS: Record<(typeof ADJUST_KEYS)[number], string> = {
  exposure: "Exposure",
  contrast: "Contrast",
  highlights: "Highlights",
  shadows: "Shadows",
  whites: "Whites",
  blacks: "Blacks",
  saturation: "Saturation",
  vibrance: "Vibrance",
  temp: "Temp",
  vignette: "Vignette",
  sharpen: "Sharpen",
};

const RANGES: Record<(typeof ADJUST_KEYS)[number], number> = {
  exposure: 2,
  contrast: 100,
  highlights: 100,
  shadows: 100,
  whites: 100,
  blacks: 100,
  saturation: 100,
  vibrance: 100,
  temp: 100,
  vignette: 100,
  sharpen: 100,
};

function fmt(key: (typeof ADJUST_KEYS)[number], v: number): string {
  const max = RANGES[key];
  const n = (v - 0.5) * 2 * max;
  if (key === "exposure") return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
  return `${n >= 0 ? "+" : ""}${Math.round(n)}`;
}

export function AdjustPanel() {
  const toolState = useToolState();
  const { patchTool, commit, registerPendingApply } = useEditorActions();
  const { doc } = useEditorReadOnly();

  const reset = useCallback(() => {
    patchTool(
      "adjust",
      Array.from({ length: ADJUST_KEYS.length }, () => 0.5),
    );
  }, [patchTool]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc) return;
    if (isIdentity(toolState.adjust)) return;
    // Async chunked bake so the busy spinner can keep animating
    // during the full-resolution pass — Android Chrome doesn't run
    // CSS transform animations on the compositor while the main
    // thread is JS-busy, and the inter-chunk yields give the
    // browser frames to paint the rotation.
    const out = await bakeAdjustAsync(doc.working, toolState.adjust, 0);
    copyInto(doc.working, out);
    reset();
    commit("Adjust");
  }, [commit, doc, reset, toolState.adjust]);

  const dirty = !isIdentity(toolState.adjust);

  // Hand the latest apply() to the editor context via a ref so that a
  // tool switch flushes the pending preview before the panel unmounts.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (!dirty) {
      registerPendingApply(null);
      return;
    }
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
  }, [dirty, registerPendingApply]);

  return (
    <>
      {ADJUST_KEYS.map((key, i) => {
        const v = toolState.adjust[i] ?? 0.5;
        return (
          <PropRow key={key} label={LABELS[key]} value={fmt(key, v)}>
            <Slider
              value={v}
              accent={Math.abs(v - 0.5) > 0.001}
              onChange={(next) => {
                const copy = toolState.adjust.slice();
                copy[i] = next;
                patchTool("adjust", copy);
              }}
            />
          </PropRow>
        );
      })}
      <button
        type="button"
        className="btn btn-secondary btn-xs mt-1 w-full justify-center"
        onClick={reset}
        disabled={!dirty}
      >
        <I.Refresh size={12} />
        Reset
      </button>
    </>
  );
}
