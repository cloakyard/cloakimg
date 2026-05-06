// HslTool.tsx — Registers the live HSL preview against the stage. The
// per-band sliders live in HslPanel; this just turns them into a
// preview canvas via useHslPreview.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import { type HslParams } from "./hsl";
import { useHslPreview } from "./useHslPreview";

export function HslTool() {
  const { toolState, doc } = useEditor();
  const params = useMemo<HslParams>(
    () => ({
      hue: toolState.hslHue,
      sat: toolState.hslSat,
      lum: toolState.hslLum,
    }),
    [toolState.hslHue, toolState.hslSat, toolState.hslLum],
  );
  const preview = useHslPreview(doc?.working ?? null, params);
  useStageProps({ previewCanvas: preview });
  return null;
}
