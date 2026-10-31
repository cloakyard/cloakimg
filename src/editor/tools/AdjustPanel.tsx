// AdjustPanel.tsx — Sliders + Reset. The bake into history happens
// automatically when the user switches tools or opens Export
// (registerPendingApply hook), so an explicit Apply button is
// redundant — Undo/Redo are the recovery path.

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { I } from "../../components/icons";
import { NumericReadout, PropRow, Slider } from "../atoms";
import { copyInto, releaseCanvas } from "../doc";
import { useEditorActions, useEditorReadOnly, useToolState } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import { applyScopedBake, type MaskScope } from "../ai/subjectMask";
import { ADJUST_KEYS, IDENTITY_CURVE } from "../toolState";
import { useSubjectMask } from "../ai/useSubjectMask";
import { bakeAdjustAsync, isAdjustIdentity } from "./adjustments";
import { SelectControl } from "../SelectControl";
import { CurveEditor } from "./CurveEditor";
import { MaskScopeRow } from "../ai/ui/MaskScopeRow";
import { ScopeGate } from "../ai/ui/ScopeGate";

const GROUPS = ["Light", "Colour", "Detail", "Curves", "All adjustments"] as const;
type Group = (typeof GROUPS)[number];
const GROUP_KEYS: Record<Group, typeof ADJUST_KEYS> = {
  Light: ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"],
  Colour: ["temp", "saturation", "vibrance"],
  Detail: ["vignette", "sharpen"],
  Curves: [],
  "All adjustments": ADJUST_KEYS,
};

const LABELS: Record<(typeof ADJUST_KEYS)[number], string> = {
  exposure: "Exposure",
  contrast: "Contrast",
  highlights: "Highlights",
  shadows: "Shadows",
  whites: "Whites",
  blacks: "Blacks",
  saturation: "Saturation",
  vibrance: "Vibrance",
  temp: "Temperature",
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

export function AdjustPanel({
  onExpandControls,
  headingSlot,
}: {
  onExpandControls?: () => void;
  headingSlot?: HTMLElement | null;
}) {
  const toolState = useToolState();
  const { patchTool, commit, setActiveTool } = useEditorActions();
  const { doc, layout } = useEditorReadOnly();
  const subjectMask = useSubjectMask();
  const isMobile = layout === "mobile";
  const scope = (toolState.adjustScope as MaskScope) ?? 0;
  const compact = layout !== "desktop";
  const [group, setGroup] = useState<Group>("Light");
  const [parameter, setParameter] = useState<(typeof ADJUST_KEYS)[number]>("exposure");
  const keys = GROUP_KEYS[group];
  const selected = keys.includes(parameter) ? parameter : keys[0];

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

  const showCurve = !compact || group === "Curves";
  const showSliders = !compact || group !== "Curves";
  const visibleKeys =
    !compact || group === "All adjustments"
      ? ADJUST_KEYS
      : isMobile && selected
        ? [selected]
        : keys;
  // Gate the per-pixel controls (sliders + curve) while the user has
  // a scoped mode picked but the subject mask isn't ready yet —
  // dragging during detection would silently produce a whole-image
  // bake (mask=null fallback), which reads as "subject scope is
  // broken". MaskScopeRow stays interactive so the user can always
  // step back to Whole.
  const gated = scope !== 0 && subjectMask.state.status !== "ready";

  const groupSelect = (
    <SelectControl
      aria-label="Adjustment group"
      value={group}
      displayValue={group}
      onChange={(event) => {
        if (event.target.value === "looks") {
          void setActiveTool("filter");
          return;
        }
        const next = event.target.value as Group;
        setGroup(next);
        if (next === "Curves" || next === "All adjustments") onExpandControls?.();
      }}
    >
      <option value="looks">Looks</option>
      {GROUPS.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </SelectControl>
  );
  return (
    <>
      {compact && (isMobile && headingSlot ? createPortal(groupSelect, headingSlot) : groupSelect)}
      {isMobile && showSliders && group !== "All adjustments" && (
        <div
          className="editor-adjust-parameters overflow-x-auto"
          role="group"
          aria-label="Adjustment parameter"
        >
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              className="editor-adjust-parameter"
              aria-pressed={key === selected}
              onClick={() => setParameter(key)}
            >
              {LABELS[key]}
            </button>
          ))}
        </div>
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
          visibleKeys.map((key) => {
            const i = ADJUST_KEYS.indexOf(key);
            const v = toolState.adjust[i] ?? 0.5;
            return (
              <PropRow
                key={key}
                label={LABELS[key]}
                valueInput={
                  <NumericReadout
                    key={key}
                    display={fmt(key, v)}
                    unit={key === "exposure" ? "EV" : ""}
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
                  ariaValueText={`${fmt(key, v)}${key === "exposure" ? " EV" : ""}`}
                  step={key === "exposure" ? 0.025 : 0.005}
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
            className="btn btn-ghost btn-xs mt-1 w-full justify-center text-text"
            onClick={reset}
          >
            <I.Refresh size={16} />
            Reset all adjustments
          </button>
        )}
      </ScopeGate>
      {compact ? (
        <details className="editor-adjust-scope">
          <summary>Apply to: {["Whole image", "Subject", "Background"][scope]}</summary>
          <div className="flex flex-col gap-3 pt-3">
            <MaskScopeRow scope={scope} onScope={(value) => patchTool("adjustScope", value)} />
          </div>
        </details>
      ) : (
        <MaskScopeRow scope={scope} onScope={(value) => patchTool("adjustScope", value)} />
      )}
    </>
  );
}
