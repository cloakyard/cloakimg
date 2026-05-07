// AdjustTool.tsx — Renders the canvas with a per-pixel live preview at
// 25% resolution while the user drags adjust sliders. This matches what
// Apply will eventually bake at full res, including highlights / shadows
// / whites / blacks / vibrance — controls the CSS-filter approximation
// can't faithfully reproduce.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { useAdjustPreview } from "./useAdjustPreview";

export function AdjustTool() {
  const { toolState, doc, historyVersion } = useEditor();
  // historyVersion bumps on every history mutation — commit (Adjust /
  // Filter / etc bake into history), undo, redo, resetToOriginal,
  // replaceWithFile's "Open" push. That covers every path that
  // changes doc.working pixels in place. Passing it as the cache
  // key forces useAdjustPreview to rebuild its downsample so the
  // next bake reads the fresh pixels instead of the pre-mutation
  // ones cached on first mount.
  const preview = useAdjustPreview(
    doc?.working ?? null,
    toolState.adjust,
    0,
    false,
    0,
    toolState.curveRGB,
    historyVersion,
  );
  useStageProps({ previewCanvas: preview.canvas, previewVersion: preview.version });
  return null;
}
