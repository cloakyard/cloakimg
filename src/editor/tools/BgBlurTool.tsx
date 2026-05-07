// BgBlurTool.tsx — Live preview wrapper for the Background blur tool.
// Reads scope + amount + lens kind + progressive flag from toolState,
// fetches the cached subject mask if ready, and feeds them to the
// preview hook. The hook hands back a downsampled blur preview which
// StageHost paints over doc.working.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { previewLongEdge } from "./previewSize";
import { useBgBlurPreview } from "./useBgBlurPreview";

export function BgBlurTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Pre-sized mask matches the preview surface; the per-rAF bake's
  // `applyMaskScope` then composes mask × downsample at 1:1 instead
  // of asking the browser to scale a 24 MP cut on every frame. Mask
  // is only threaded when status="ready" — the preview hook's scope
  // gate will short-circuit and show `doc.working` while detection
  // is in flight (matching the gated panel controls above).
  // Memoised on `state`: identity flips on every version bump
  // (invalidate / replace / new detection), so the memo stays
  // correctly invalidated when the cache changes — and we elide the
  // Map lookup during slider-drag bursts.
  const maskState = subjectMask.state;
  const peekDownsample = subjectMask.peekDownsample;
  const mask = useMemo(
    () => (maskState.status === "ready" ? peekDownsample(previewLongEdge()) : null),
    [maskState, peekDownsample],
  );
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
    mask,
    historyVersion,
  );
  useStageProps({ previewCanvas: preview });
  return null;
}
