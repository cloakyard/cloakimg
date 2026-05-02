// AdjustTool.tsx — Renders the canvas with a per-pixel live preview at
// 25% resolution while the user drags adjust sliders. This matches what
// Apply will eventually bake at full res, including highlights / shadows
// / whites / blacks / vibrance — controls the CSS-filter approximation
// can't faithfully reproduce.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { useAdjustPreview } from "./useAdjustPreview";

export function AdjustTool() {
  const { toolState, doc } = useEditor();
  const preview = useAdjustPreview(doc?.working ?? null, toolState.adjust, 0);
  useStageProps({ previewCanvas: preview });
  return null;
}
