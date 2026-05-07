// FilterTool.tsx — Filters compose a preset adjust-vector with the
// user's manual sliders, then run the same per-pixel preview as Adjust.
// Grain and Mono get a true per-pixel pass so the live view matches
// what Apply will bake.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { FILTER_PRESETS_RECIPES } from "./filterPresets";
import { useAdjustPreview } from "./useAdjustPreview";

export function FilterTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Pass a readiness flag rather than the mask canvas. The bake
  // peeks the cached downsample inside its rAF — see useAdjustPreview
  // for why we no longer thread the canvas through React.
  const maskReady = subjectMask.state.status === "ready";
  const preset = FILTER_PRESETS_RECIPES[toolState.filterPreset];
  // Memoise the composed slider vector against its true inputs.
  // applyPresetVector returns a fresh array via .slice(), so without
  // useMemo every render produces a new reference — useAdjustPreview's
  // effect would then re-fire, bake, setPreview, re-render, and loop
  // until the browser pegs the CPU. Memoising cuts the cycle.
  const { adjust, filterPreset, filterIntensity } = toolState;
  const composed = useMemo(
    () => applyPresetVector(adjust, filterPreset, filterIntensity),
    [adjust, filterPreset, filterIntensity],
  );
  const scope = (toolState.filterScope as MaskScope) ?? 0;
  // No timer-based debounce. The previous build added an 80 ms
  // trailing window so a tap-tap-tap of presets coalesced into a
  // single bake — but the trailing semantics meant *no preview*
  // until the user stopped clicking, which read as "stuck". The
  // hook's own rAF cancellation already coalesces work: every
  // effect run cancels the still-pending rAF from the previous
  // run, so a burst of clicks ends up scheduling exactly one bake
  // (the latest preset) on the next animation frame. That gives
  // immediate feedback on the first click *and* skips the wasted
  // bakes from intermediate clicks.
  // historyVersion as invalidation key — refreshes the cached
  // downsample after every commit / undo / redo / reset (any path
  // that mutates doc.working pixels in place). doc identity alone
  // misses commits within the same tool — only setDoc bumps doc,
  // and commit() doesn't.
  const preview = useAdjustPreview(
    doc?.working ?? null,
    composed,
    toolState.grain,
    preset?.monochrome ?? false,
    0,
    undefined,
    scope,
    maskReady,
    historyVersion,
  );
  useStageProps({ previewCanvas: preview });
  return null;
}

function applyPresetVector(
  adjust: number[],
  filterPreset: number,
  filterIntensity: number,
): number[] {
  const preset = FILTER_PRESETS_RECIPES[filterPreset];
  if (!preset) return adjust;
  const out = adjust.slice();
  preset.adjust.forEach((delta, i) => {
    const base = out[i] ?? 0.5;
    out[i] = Math.min(1, Math.max(0, base + delta * filterIntensity));
  });
  return out;
}
