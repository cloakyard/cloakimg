// AdjustTool.tsx — Renders the canvas with a per-pixel live preview at
// 25% resolution while the user drags adjust sliders. This matches what
// Apply will eventually bake at full res, including highlights / shadows
// / whites / blacks / vibrance — controls the CSS-filter approximation
// can't faithfully reproduce.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { previewLongEdge } from "./previewSize";
import { useAdjustPreview } from "./useAdjustPreview";

export function AdjustTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Pull a mask sized to match the preview surface so each per-rAF
  // composite skips a full-res scaled drawImage (the cut can be 24
  // MP — scaling that on every preview tick is the pre-cache bottleneck
  // on phones). The downsample is built lazily by the service the
  // first time anything asks for it, then reused across every scoped
  // tool.
  const mask =
    subjectMask.state.status === "ready" ? subjectMask.peekDownsample(previewLongEdge()) : null;
  const scope = (toolState.adjustScope as MaskScope) ?? 0;
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
    scope,
    mask,
    historyVersion,
  );
  useStageProps({ previewCanvas: preview });
  return null;
}
