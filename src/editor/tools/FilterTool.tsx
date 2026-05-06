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
  const { toolState, doc } = useEditor();
  const subjectMask = useSubjectMask();
  const mask =
    subjectMask.state.status === "ready" ? subjectMask.peekDownsample(previewLongEdge()) : null;
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
  // 80 ms debounce: a typical preset tap-tap-tap lands at 100–300 ms
  // intervals, faster than a single bake completes on mobile (~50–
  // 150 ms each at the 720 cap). Without coalescing, every click
  // would queue another bake behind the in-flight one and the next
  // tool-switch tap would sit behind that whole chain, freezing the
  // UI for a second+. With this debounce, a burst of clicks fires
  // exactly one trailing bake.
  const preview = useAdjustPreview(
    doc?.working ?? null,
    composed,
    toolState.grain,
    preset?.monochrome ?? false,
    80,
    undefined,
    scope,
    mask,
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
