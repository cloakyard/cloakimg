// HslTool.tsx — Registers the live HSL preview against the stage. The
// per-band sliders live in HslPanel; this just turns them into a
// preview canvas via useHslPreview.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { type HslParams } from "./hsl";
import { previewLongEdge } from "./previewSize";
import { useHslPreview } from "./useHslPreview";

export function HslTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Memoise the mask peek across renders at the same cache generation
  // — the tool re-renders on every slider tick, and peek does a Map
  // lookup we don't need to repeat at 60 Hz. We depend on the whole
  // `state` object: it gets a fresh identity on every version bump
  // (invalidate / replace / new detection), so the memo stays
  // correctly invalidated whenever the central cache changes.
  const maskState = subjectMask.state;
  const peekDownsample = subjectMask.peekDownsample;
  const mask = useMemo(
    () => (maskState.status === "ready" ? peekDownsample(previewLongEdge()) : null),
    [maskState, peekDownsample],
  );
  const scope = (toolState.hslScope as MaskScope) ?? 0;
  const params = useMemo<HslParams>(
    () => ({
      hue: toolState.hslHue,
      sat: toolState.hslSat,
      lum: toolState.hslLum,
    }),
    [toolState.hslHue, toolState.hslSat, toolState.hslLum],
  );
  // historyVersion as invalidation key — refreshes the cached
  // downsample after every commit / undo / redo / reset (the doc
  // ref alone misses intra-tool commits because commit() doesn't
  // setDoc).
  const preview = useHslPreview(doc?.working ?? null, params, scope, mask, historyVersion);
  useStageProps({ previewCanvas: preview });
  return null;
}
