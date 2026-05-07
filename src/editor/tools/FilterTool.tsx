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
import { previewLongEdge } from "./previewSize";
import { useAdjustPreview } from "./useAdjustPreview";

export function FilterTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Memoise the mask peek so the Map lookup doesn't repeat at 60 Hz
  // during preset taps. `state` gets a fresh identity on every
  // version bump (invalidate / replace / new detection), keeping the
  // memo correctly invalidated when the central cache changes.
  const maskState = subjectMask.state;
  const peekDownsample = subjectMask.peekDownsample;
  const mask = useMemo(
    () => (maskState.status === "ready" ? peekDownsample(previewLongEdge()) : null),
    [maskState, peekDownsample],
  );
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
    mask,
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
