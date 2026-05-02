// PenPanel.tsx — Phase F4.5. Stroke / fill / width controls for the
// in-progress Pen path. The actual path-building lives in PenTool.tsx.

import { ColorPicker } from "../ColorPicker";
import { useEditor } from "../EditorContext";
import { PropRow, Slider } from "../atoms";

export function PenPanel() {
  const { toolState, patchTool } = useEditor();
  const fillTransparent = toolState.penFill === "transparent";
  return (
    <>
      <PropRow label="Stroke">
        <ColorPicker value={toolState.penStroke} onChange={(c) => patchTool("penStroke", c)} />
      </PropRow>
      <PropRow label="Fill">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              patchTool("penFill", fillTransparent ? toolState.penStroke : "transparent")
            }
            style={{ fontSize: 11, padding: "5px 10px" }}
          >
            {fillTransparent ? "Add fill" : "No fill"}
          </button>
          {!fillTransparent && (
            <ColorPicker
              value={toolState.penFill === "transparent" ? "#ffffff" : toolState.penFill}
              onChange={(c) => patchTool("penFill", c)}
            />
          )}
        </div>
      </PropRow>
      <PropRow label="Stroke width" value={`${toolState.penStrokeWidth.toFixed(0)} px`}>
        <Slider
          value={Math.min(1, toolState.penStrokeWidth / 32)}
          accent
          onChange={(v) => patchTool("penStrokeWidth", Math.max(1, v * 32))}
        />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Click to drop anchors; drag from a click to bend with bezier handles. Click the first anchor
        or press <strong>Enter</strong> to finish. <strong>Esc</strong> cancels.
      </div>
    </>
  );
}
