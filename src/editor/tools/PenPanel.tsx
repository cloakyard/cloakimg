// PenPanel.tsx — Phase F4.5. Stroke / fill / width controls for the
// in-progress Pen path. The actual path-building lives in PenTool.tsx.
//
// Fill is a toggle (on / off) rather than a "No fill" / "Add fill"
// button pair — clearer affordance, smaller surface, matches the
// pattern used elsewhere in the editor for boolean state. The last
// non-transparent colour is remembered in a ref so toggling off and
// back on restores the user's pick instead of resetting to the
// stroke colour.

import { useRef } from "react";
import { ColorPicker } from "../ColorPicker";
import { useEditorActions, useToolState } from "../EditorContext";
import { PropRow, Slider, ToggleSwitch } from "../atoms";

export function PenPanel() {
  const toolState = useToolState();
  const { patchTool } = useEditorActions();
  const fillOn = toolState.penFill !== "transparent";
  // Remember whatever colour the user last chose for the fill, so
  // toggling Fill off → on restores their pick instead of jumping to
  // the stroke colour.
  const lastFillRef = useRef<string>(fillOn ? toolState.penFill : toolState.penStroke);
  if (fillOn) lastFillRef.current = toolState.penFill;

  return (
    <>
      <PropRow label="Stroke">
        <ColorPicker value={toolState.penStroke} onChange={(c) => patchTool("penStroke", c)} />
      </PropRow>
      <PropRow
        label="Fill"
        valueInput={
          <ToggleSwitch
            on={fillOn}
            onChange={(on) => patchTool("penFill", on ? lastFillRef.current : "transparent")}
          />
        }
      >
        {fillOn ? (
          <ColorPicker value={toolState.penFill} onChange={(c) => patchTool("penFill", c)} />
        ) : null}
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
