// HslTool.tsx — Registers the live HSL preview against the stage. The
// per-band sliders live in HslPanel; this just turns them into a
// preview canvas via useHslPreview.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { MaskScope } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import type { HslParams } from "./hsl";
import { useHslPreview } from "./useHslPreview";

export function HslTool() {
  const { toolState, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  const maskReady = subjectMask.state.status === "ready";
  const scope = (toolState.hslScope as MaskScope) ?? 0;
  const params = useMemo<HslParams>(
    () => ({
      hue: toolState.hslHue,
      sat: toolState.hslSat,
      lum: toolState.hslLum,
    }),
    [toolState.hslHue, toolState.hslSat, toolState.hslLum],
  );
  const preview = useHslPreview(doc?.working ?? null, params, scope, maskReady, historyVersion);
  useStageProps({ previewCanvas: preview.canvas, previewVersion: preview.version });
  return null;
}
