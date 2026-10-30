// SpotHealPanel.tsx — Phase 8 wires brush size + opacity to a clone-
// stamp pipeline.

import { SliderField } from "../atoms";
import { useEditor } from "../EditorContext";

export function SpotHealPanel() {
  const { toolState, patchTool } = useEditor();
  return (
    <>
      <SliderField
        label="Brush size"
        domain={[0, 100]}
        unit="px"
        value={toolState.brushSize}
        accent
        defaultValue={0.32}
        onChange={(v) => patchTool("brushSize", v)}
      />
      <SliderField
        label="Edge feather"
        domain={[0, 30]}
        unit="px"
        value={toolState.feather}
        defaultValue={0.2}
        onChange={(v) => patchTool("feather", v)}
      />
      <div className="text-[0.8125rem] leading-relaxed text-text-muted">
        Click on a spot to heal it from neighbouring pixels.
      </div>
    </>
  );
}
