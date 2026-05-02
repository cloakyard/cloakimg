// FilterTool.tsx — Filters compose a preset adjust-vector with the
// user's manual sliders, then run the same per-pixel preview as Adjust.
// Grain and Mono get a true per-pixel pass so the live view matches
// what Apply will bake.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { FILTER_PRESETS_RECIPES } from "./filterPresets";
import { useAdjustPreview } from "./useAdjustPreview";
import type { ToolState } from "../toolState";

export function FilterTool() {
  const { toolState, doc } = useEditor();
  const preset = FILTER_PRESETS_RECIPES[toolState.filterPreset];
  const composed = applyPresetVector(toolState);
  const preview = useAdjustPreview(
    doc?.working ?? null,
    composed,
    toolState.grain,
    preset?.monochrome ?? false,
  );
  useStageProps({ previewCanvas: preview });
  return null;
}

function applyPresetVector(s: ToolState): number[] {
  const preset = FILTER_PRESETS_RECIPES[s.filterPreset];
  if (!preset) return s.adjust;
  const out = s.adjust.slice();
  preset.adjust.forEach((delta, i) => {
    const base = out[i] ?? 0.5;
    out[i] = Math.min(1, Math.max(0, base + delta * s.filterIntensity));
  });
  return out;
}
