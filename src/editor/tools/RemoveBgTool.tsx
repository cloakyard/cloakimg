// RemoveBgTool.tsx — Live preview wrapper for the Remove BG tool.
// Renders ImageCanvas with a debounced, downsampled-then-upsampled
// background-removed preview so threshold + feather changes show
// instantly on canvas. While the panel's eyedropper is armed, the
// next image-space click samples the pixel under the pointer and
// stores it as the explicit chroma target. Final commit is owned by
// RemoveBgPanel.

import { useCallback } from "react";
import { useEditor } from "../EditorContext";
import type { ImagePoint } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { useRemoveBgPreview } from "./useRemoveBgPreview";

export function RemoveBgTool() {
  const { toolState, patchTool, doc } = useEditor();
  const preview = useRemoveBgPreview(
    doc?.working ?? null,
    toolState.genericStrength,
    toolState.feather,
    toolState.bgSample,
    // doc identity bumps on every commit / undo / redo / reset, even
    // when the underlying canvas is reused. The hook uses this to
    // refresh its downsampled cache so the preview reflects the
    // current pixels instead of the previous keyed version.
    doc,
  );

  const onPick = useCallback(
    (p: ImagePoint) => {
      if (!toolState.bgPickActive || !doc || !p.inside) return;
      const ctx = doc.working.getContext("2d");
      if (!ctx) return;
      const x = Math.round(Math.max(0, Math.min(doc.width - 1, p.x)));
      const y = Math.round(Math.max(0, Math.min(doc.height - 1, p.y)));
      const data = ctx.getImageData(x, y, 1, 1).data;
      const hex = `#${[data[0], data[1], data[2]]
        .map((n) => (n ?? 0).toString(16).padStart(2, "0"))
        .join("")}`;
      patchTool("bgSample", hex);
      patchTool("bgPickActive", false);
    },
    [doc, patchTool, toolState.bgPickActive],
  );

  useStageProps({
    previewCanvas: preview,
    cursor: toolState.bgPickActive ? "crosshair" : undefined,
    onImagePointerDown: onPick,
  });
  return null;
}
