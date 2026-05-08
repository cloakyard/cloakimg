// DefaultPanel.tsx — Generic strength/size/mode controls used by tools
// that don't have bespoke property panels (e.g. Move).

import { PropRow, Segment, Slider } from "../atoms";
import { useEditor } from "../EditorContext";

export function DefaultPanel() {
  const { toolState, patchTool } = useEditor();
  return (
    <>
      <PropRow label="Strength" value={`${Math.round(toolState.genericStrength * 100)}%`}>
        <Slider
          value={toolState.genericStrength}
          accent
          onChange={(v) => patchTool("genericStrength", v)}
        />
      </PropRow>
      <PropRow label="Size" value={`${Math.round(toolState.genericSize * 100)} px`}>
        <Slider
          value={toolState.genericSize}
          accent
          onChange={(v) => patchTool("genericSize", v)}
        />
      </PropRow>
      <PropRow label="Mode">
        <Segment
          options={["Soft", "Hard"]}
          active={toolState.genericMode}
          onChange={(i) => patchTool("genericMode", i)}
        />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Click on the canvas to apply the tool, or drag to paint a region.
      </div>
    </>
  );
}
