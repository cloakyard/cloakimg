// AdjustTool.tsx — Renders the canvas with a per-pixel live preview at
// 25% resolution while the user drags adjust sliders. This matches what
// Apply will eventually bake at full res, including highlights / shadows
// / whites / blacks / vibrance — controls the CSS-filter approximation
// can't faithfully reproduce.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { useAdjustPreview } from "./useAdjustPreview";

export function AdjustTool() {
  const { toolState, doc } = useEditor();
  const subjectMask = useSubjectMask();
  // Identity peek — when the user picks Subject / Background scope,
  // MaskScopeRow auto-triggers detection and the cached cut becomes
  // available here once status flips to "ready". Until then, mask is
  // null and the preview falls back to whole-image until detection
  // lands; the next render then re-bakes with the mask in place.
  const mask = subjectMask.state.status === "ready" ? subjectMask.peek() : null;
  const scope = (toolState.adjustScope as MaskScope) ?? 0;
  const preview = useAdjustPreview(
    doc?.working ?? null,
    toolState.adjust,
    0,
    false,
    0,
    toolState.curveRGB,
    scope,
    mask,
  );
  useStageProps({ previewCanvas: preview });
  return null;
}
