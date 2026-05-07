// LevelsTool.tsx — Registers the live Levels preview against the stage
// while the panel sliders mutate. Mirrors AdjustTool: pick the params
// out of toolState, render through the downsample, and let StageHost
// paint it in place of doc.working.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import type { LevelsParams } from "./levels";
import { previewLongEdge } from "./previewSize";
import { useLevelsPreview } from "./useLevelsPreview";

export function LevelsTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  // Memoise the mask peek so the Map lookup doesn't repeat at 60 Hz
  // during slider drags. `state` gets a fresh identity on every
  // version bump (invalidate / replace / new detection), keeping the
  // memo correctly invalidated when the central cache changes.
  const maskState = subjectMask.state;
  const peekDownsample = subjectMask.peekDownsample;
  const mask = useMemo(
    () => (maskState.status === "ready" ? peekDownsample(previewLongEdge()) : null),
    [maskState, peekDownsample],
  );
  const scope = (toolState.levelsScope as MaskScope) ?? 0;
  const params = useMemo<LevelsParams>(
    () => ({
      blackIn: toolState.levelsBlackIn,
      whiteIn: toolState.levelsWhiteIn,
      gamma: toolState.levelsGamma,
      blackOut: toolState.levelsBlackOut,
      whiteOut: toolState.levelsWhiteOut,
    }),
    [
      toolState.levelsBlackIn,
      toolState.levelsWhiteIn,
      toolState.levelsGamma,
      toolState.levelsBlackOut,
      toolState.levelsWhiteOut,
    ],
  );
  // historyVersion as invalidation key — refreshes the cached
  // downsample after every commit / undo / redo / reset (the doc
  // ref alone misses intra-tool commits because commit() doesn't
  // setDoc).
  const preview = useLevelsPreview(doc?.working ?? null, params, scope, mask, historyVersion);
  useStageProps({ previewCanvas: preview });
  return null;
}
