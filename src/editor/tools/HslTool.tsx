// HslTool.tsx — Registers the live HSL preview against the stage. The
// per-band sliders live in HslPanel; this just turns them into a
// preview canvas via useHslPreview.

import { useMemo } from "react";
import { useEditor } from "../EditorContext";
import { useStageProps } from "../StageHost";
import type { HslParams } from "./hsl";
import { useHslPreview } from "./useHslPreview";

export function HslTool() {
  const { toolState, doc, historyVersion } = useEditor();
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
  const preview = useHslPreview(doc?.working ?? null, params, historyVersion);
  useStageProps({ previewCanvas: preview.canvas, previewVersion: preview.version });
  return null;
}
