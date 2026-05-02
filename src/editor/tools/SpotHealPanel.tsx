// SpotHealPanel.tsx — Phase 8 wires brush size + opacity to a clone-
// stamp pipeline.

import { PropRow, Slider } from "../atoms";
import { useEditor } from "../EditorContext";

export function SpotHealPanel() {
  const { toolState, patchTool } = useEditor();
  return (
    <>
      <PropRow label="Brush size" value={`${Math.round(toolState.brushSize * 100)} px`}>
        <Slider value={toolState.brushSize} accent onChange={(v) => patchTool("brushSize", v)} />
      </PropRow>
      <PropRow label="Edge feather" value={`${Math.round(toolState.feather * 30)} px`}>
        <Slider value={toolState.feather} onChange={(v) => patchTool("feather", v)} />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Click on a spot to heal it from neighbouring pixels.
      </div>
    </>
  );
}
