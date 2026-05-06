// BgBlurTool.tsx — Live preview wrapper for the Background blur tool.
// Reads scope + amount from toolState, fetches the cached subject
// mask if ready, and feeds them to the preview hook. The hook hands
// back a downsampled blur preview which StageHost paints over
// doc.working.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { previewLongEdge } from "./previewSize";
import { useBgBlurPreview } from "./useBgBlurPreview";

export function BgBlurTool() {
  const { toolState, doc } = useEditor();
  const subjectMask = useSubjectMask();
  // Pre-sized mask matches the preview surface; the per-rAF bake's
  // `applyMaskScope` then composes mask × downsample at 1:1 instead
  // of asking the browser to scale a 24 MP cut on every frame. Mask
  // is only threaded when status="ready" — the preview hook's scope
  // gate will short-circuit and show `doc.working` while detection
  // is in flight (matching the gated panel controls above).
  const mask =
    subjectMask.state.status === "ready" ? subjectMask.peekDownsample(previewLongEdge()) : null;
  const scope = (toolState.bgBlurScope as MaskScope) ?? 2;
  const preview = useBgBlurPreview(doc?.working ?? null, toolState.bgBlurAmount, scope, mask);
  useStageProps({ previewCanvas: preview });
  return null;
}
