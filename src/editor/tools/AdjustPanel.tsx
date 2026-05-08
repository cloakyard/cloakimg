// AdjustPanel.tsx — Sliders + Reset. The bake into history happens
// automatically when the user switches tools or opens Export
// (registerPendingApply hook), so an explicit Apply button is
// redundant — Undo/Redo are the recovery path.

import { useCallback, useState } from "react";
import { I } from "../../components/icons";
import { NumericReadout, PropRow, Segment, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { applyScopedBake, type MaskScope } from "../ai/subjectMask";
import { ADJUST_KEYS, IDENTITY_CURVE } from "../toolState";
import { useSubjectMask } from "../ai/useSubjectMask";
import { bakeAdjustAsync, isAdjustIdentity } from "./adjustments";
import { AiSectionHeader } from "../ai/ui/AiSectionHeader";
import { CurveEditor } from "./CurveEditor";
import { MaskScopeRow } from "../ai/ui/MaskScopeRow";
import { ScopeGate } from "../ai/ui/ScopeGate";

const TABS = ["Histogram", "Adjust"] as const;

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
  const { patchTool, commit } = useEditorActions();
  const { doc, layout } = useEditorReadOnly();
  const subjectMask = useSubjectMask();
  const isMobile = layout === "mobile";
  const scope = (toolState.adjustScope as MaskScope) ?? 0;
  // On mobile the CurveEditor's 1:1 aspect ratio swallows the entire
  // sheet height — pointer events on the SVG are `touch-none` for the
  // drag gesture, so the sliders below were both below the fold and
  // unreachable by scroll. Tabs sidestep both problems.
  const [tab, setTab] = useState(0);

  const reset = useCallback(() => {
    patchTool(
      "adjust",
      Array.from({ length: ADJUST_KEYS.length }, () => 0.5),
    );
    patchTool("curveRGB", IDENTITY_CURVE);
    patchTool("adjustScope", 0);
  }, [patchTool]);

  const apply = useCallback(async (): Promise<void> => {
    if (!doc) return;
    if (isAdjustIdentity(toolState.adjust, toolState.curveRGB)) return;
    // Async chunked bake so the busy spinner can keep animating
    // during the full-resolution pass — Android Chrome doesn't run
    // CSS transform animations on the compositor while the main
    // thread is JS-busy, and the inter-chunk yields give the
    // browser frames to paint the rotation.
    let out = await bakeAdjustAsync(doc.working, toolState.adjust, 0, toolState.curveRGB);
    // Mask scoping: if the user picked Subject / Background, ensure
    // the cut is ready (await detection if it isn't), then composite
    // so the bake only lands inside the chosen region. We *await*
    // detection here because Apply is the moment of truth — a
    // half-completed mask would silently fall back to whole-image,
    // which is the opposite of what the user asked for. If detection
    // errors, fall back to whole-image rather than dropping the edit.
    out = await applyScopedBake(out, doc.working, scope, subjectMask);
    copyInto(doc.working, out);
    // bakeAdjustAsync acquires from the canvas pool; copyInto already
    // duplicated the pixels into doc.working, so the bake canvas can
    // go back for reuse instead of waiting on GC.
    releaseCanvas(out);
    reset();
    commit("Adjust");
  }, [commit, doc, reset, scope, subjectMask, toolState.adjust, toolState.curveRGB]);

  const dirty = !isAdjustIdentity(toolState.adjust, toolState.curveRGB);

  // Tool switch / Export auto-flushes the pending preview into history.
  useApplyOnToolSwitch(apply, dirty);

  const setAt = useCallback(
    (i: number, next: number) => {
      const copy = toolState.adjust.slice();
      copy[i] = next;
      patchTool("adjust", copy);
    },
    [patchTool, toolState.adjust],
  );

  const showCurve = !isMobile || tab === 0;
  const showSliders = !isMobile || tab === 1;
  // Gate the per-pixel controls (sliders + curve) while the user has
  // a scoped mode picked but the subject mask isn't ready yet —
  // dragging during detection would silently produce a whole-image
  // bake (mask=null fallback), which reads as "subject scope is
  // broken". MaskScopeRow stays interactive so the user can always
  // step back to Whole.
  const gated = scope !== 0 && subjectMask.state.status !== "ready";

  return (
    <>
      {isMobile && <Segment options={TABS} active={tab} onChange={setTab} />}
      {showSliders && (
        <>
          <AiSectionHeader />
          <MaskScopeRow
            scope={toolState.adjustScope}
            onScope={(i) => patchTool("adjustScope", i)}
          />
        </>
      )}
      <ScopeGate disabled={gated}>
        {showCurve && (
          <CurveEditor
            curve={toolState.curveRGB}
            onChange={(next) => patchTool("curveRGB", next)}
            fit={isMobile}
          />
        )}
        {showSliders &&
          ADJUST_KEYS.map((key, i) => {
            const v = toolState.adjust[i] ?? 0.5;
            return (
              <PropRow
                key={key}
                label={LABELS[key]}
                valueInput={
                  <NumericReadout
                    key={key}
                    display={fmt(key, v)}
                    normalized={v}
                    step={key === "exposure" ? 0.1 : 1}
                    fromNormalized={(n) => (n - 0.5) * 2 * RANGES[key]}
                    toNormalized={(real) => real / (2 * RANGES[key]) + 0.5}
                    onCommit={(n) => setAt(i, n)}
                  />
                }
              >
                <Slider
                  value={v}
                  accent={Math.abs(v - 0.5) > 0.001}
                  defaultValue={0.5}
                  onChange={(next) => setAt(i, next)}
                />
              </PropRow>
            );
          })}
        {/* Reset is destructive — wipes every slider + the curve. Only
            surface it when there's something *to* reset, so the panel
            stays calm in its idle state. Ghost styling keeps the
            primary visual weight on the sliders themselves. */}
        {showSliders && dirty && (
          <button
            type="button"
            className="btn btn-ghost btn-xs mt-1 w-full justify-center text-coral-700 dark:text-coral-300"
            onClick={reset}
          >
            <I.Refresh size={12} />
            Reset all adjustments
          </button>
        )}
      </ScopeGate>
    </>
  );
}
