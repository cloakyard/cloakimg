// BgBlurTool.tsx — Live preview wrapper for the Background blur tool.
// Reads scope + amount + lens kind + progressive flag from toolState,
// fetches the cached subject mask if ready, and feeds them to the
// preview hook. The hook hands back a downsampled blur preview which
// StageHost paints over doc.working.

import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { useBgBlurPreview } from "./useBgBlurPreview";

export function BgBlurTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Readiness flag only — the bake reads the cached downsample
  // directly from the service inside its rAF. See useAdjustPreview
  // for the full rationale.
  const maskReady = subjectMask.state.status === "ready";
  // Coerce stale Subject scope (1) from older sessions to Background
  // (2) — the panel UI no longer offers Subject mode.
  const rawScope = (toolState.bgBlurScope as MaskScope) ?? 2;
  const scope: MaskScope = rawScope === 1 ? 2 : rawScope;
  // historyVersion as invalidation key — refreshes the cached
  // downsample after every commit / undo / redo / reset (the doc
  // ref alone misses intra-tool commits because commit() doesn't
  // setDoc).
  const preview = useBgBlurPreview(
    doc?.working ?? null,
    toolState.bgBlurAmount,
    toolState.bgBlurLens,
    toolState.bgBlurProgressive,
    scope,
    maskReady,
    historyVersion,
  );
  useStageProps({ previewCanvas: preview });
  return null;
}
