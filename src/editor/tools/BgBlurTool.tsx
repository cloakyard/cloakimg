// BgBlurTool.tsx — Live preview wrapper for the Background blur tool.
// Reads scope + amount from toolState, fetches the cached subject
// mask if ready, and feeds them to the preview hook. The hook hands
// back a downsampled blur preview which StageHost paints over
// doc.working.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { useBgBlurPreview } from "./useBgBlurPreview";

export function BgBlurTool() {
  const { toolState, doc } = useEditor();
  const subjectMask = useSubjectMask();
  // Only thread the mask through once it's actually ready — otherwise
  // the preview hook would blur indiscriminately while detection is
  // still running, then re-bake when the mask lands. Falling back to
  // null means the preview shows whole-image blur until the mask is
  // ready, which lines up visually with what the user is asking for
  // in scope=Whole anyway.
  const mask = subjectMask.state.status === "ready" ? subjectMask.peek() : null;
  const scope = (toolState.bgBlurScope as MaskScope) ?? 2;
  const preview = useBgBlurPreview(doc?.working ?? null, toolState.bgBlurAmount, scope, mask);
  useStageProps({ previewCanvas: preview });
  return null;
}
