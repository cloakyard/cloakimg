// LevelsTool.tsx — Registers the live Levels preview against the stage
// while the panel sliders mutate. Mirrors AdjustTool: pick the params
// out of toolState, render through the downsample, and let StageHost
// paint it in place of doc.working.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { LevelsParams } from "./levels";
import { useLevelsPreview } from "./useLevelsPreview";

export function LevelsTool() {
  const { toolState, doc } = useEditor();
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
  const preview = useLevelsPreview(doc?.working ?? null, params);
  useStageProps({ previewCanvas: preview });
  return null;
}
