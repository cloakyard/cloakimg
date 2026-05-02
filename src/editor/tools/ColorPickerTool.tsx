// ColorPickerTool.tsx — Click on the canvas to sample the pixel under
// the cursor and store the result on the tool state's pickedColor.

import { useCallback } from "react";
import type { ImagePoint } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { useEditor } from "../EditorContext";

export function ColorPickerTool() {
  const { doc, patchTool } = useEditor();

  const sample = useCallback(
    (p: ImagePoint) => {
      if (!doc || !p.inside) return;
      const ctx = doc.working.getContext("2d");
      if (!ctx) return;
      const x = Math.max(0, Math.min(doc.width - 1, Math.floor(p.x)));
      const y = Math.max(0, Math.min(doc.height - 1, Math.floor(p.y)));
      const data = ctx.getImageData(x, y, 1, 1).data;
      const r = data[0] ?? 0;
      const g = data[1] ?? 0;
      const b = data[2] ?? 0;
      patchTool("pickedColor", rgbToHex(r, g, b));
    },
    [doc, patchTool],
  );

  useStageProps({ onImagePointerDown: sample, cursor: "crosshair" });
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}
