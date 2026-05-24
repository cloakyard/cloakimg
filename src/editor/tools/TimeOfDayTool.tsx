// TimeOfDayTool.tsx — Live preview for the Time of Day tool. Composes
// the user's single 0..1 dial into the 11-slot Adjust slider array
// via `composeTimeOfDay`, then runs it through `useAdjustPreview` so
// the canvas updates as the user drags. Identity at 0.5 → the bake
// is fully skipped (isIdentity short-circuits inside useAdjustPreview).

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { useAdjustPreview } from "./useAdjustPreview";
import { composeTimeOfDay } from "./timeOfDay";

export function TimeOfDayTool() {
  const { toolState, doc, historyVersion } = useEditor();
  // Build the synthesized Adjust slider array from the dial. We pass
  // an empty manual array so Time of Day stands alone; the panel's
  // copy explicitly tells the user to re-enter Adjust to layer
  // manual tweaks on top of the look.
  const adjustArray = useMemo(() => composeTimeOfDay(toolState.timeOfDay), [toolState.timeOfDay]);
  const preview = useAdjustPreview(
    doc?.working ?? null,
    adjustArray,
    0,
    false,
    0,
    undefined,
    0,
    false,
    historyVersion,
  );
  useStageProps({ previewCanvas: preview.canvas, previewVersion: preview.version });
  return null;
}
