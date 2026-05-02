// RedactPanel.tsx — Mode (Rect / Brush), style (Pixelate / Blur / Solid),
// strength, brush size, and edge feather. The actual paint pipeline
// lives in RedactTool.tsx.

import { PropRow, Segment, Slider } from "../atoms";
import { useEditor } from "../EditorContext";

export function RedactPanel() {
  const { toolState, patchTool } = useEditor();
  const isBrush = toolState.redactMode === 1;
  return (
    <>
      <PropRow label="Mode">
        <Segment
          options={["Rect", "Brush"]}
          active={toolState.redactMode}
          onChange={(i) => patchTool("redactMode", i)}
        />
      </PropRow>
      <PropRow label="Style">
        <Segment
          options={["Pixelate", "Blur", "Solid"]}
          active={toolState.redactStyle}
          onChange={(i) => patchTool("redactStyle", i)}
        />
      </PropRow>
      <PropRow label="Strength" value={`${Math.round(toolState.redactStrength * 30)} px`}>
        <Slider
          value={toolState.redactStrength}
          accent
          onChange={(v) => patchTool("redactStrength", v)}
        />
      </PropRow>
      <PropRow label="Brush size" value={`${Math.round(toolState.brushSize * 100)} px`}>
        <Slider value={toolState.brushSize} onChange={(v) => patchTool("brushSize", v)} />
      </PropRow>
      <PropRow label="Edge feather" value={`${Math.round(toolState.feather * 30)} px`}>
        <Slider value={toolState.feather} onChange={(v) => patchTool("feather", v)} />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {isBrush
          ? "Drag along the canvas to paint redactions. Stays on this device — no detection, no uploads."
          : "Drag a rectangle on the image to redact a region. Stays on this device — no detection, no uploads."}
      </div>
    </>
  );
}
