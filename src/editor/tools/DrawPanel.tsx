// DrawPanel.tsx — Color, brush size, and pen/eraser mode for the Draw
// tool. The actual stroke painting lives in DrawTool.tsx.

import { ColorPicker } from "../ColorPicker";
import { PropRow, Segment, Slider } from "../atoms";
import { useEditorActions, useToolState } from "../EditorContext";

export function DrawPanel() {
  const toolState = useToolState();
  const { patchTool } = useEditorActions();
  return (
    <>
      <PropRow label="Mode">
        <Segment
          options={["Pen", "Eraser"]}
          active={toolState.drawMode}
          onChange={(i) => patchTool("drawMode", i)}
        />
      </PropRow>
      <PropRow label="Color">
        <ColorPicker
          value={toolState.drawColor}
          onChange={(c) => patchTool("drawColor", c)}
          label="Stroke colour"
        />
      </PropRow>
      <PropRow label="Size" value={`${toolState.drawSize.toFixed(0)} px`}>
        <Slider
          value={Math.min(1, toolState.drawSize / 64)}
          accent
          defaultValue={8 / 64}
          onChange={(v) => patchTool("drawSize", Math.max(1, v * 64))}
        />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Drag on the canvas to paint a freehand stroke. In Eraser mode, drag over existing strokes to
        wipe them.
      </div>
    </>
  );
}
