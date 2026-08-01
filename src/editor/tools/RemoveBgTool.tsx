// RemoveBgTool.tsx — Live preview wrapper for the Remove BG tool.
// Renders ImageCanvas with a debounced, downsampled-then-upsampled
// background-removed preview so threshold + feather changes show
// instantly on canvas (chroma mode only). While the panel's
// eyedropper is armed, the next image-space click samples the pixel
// under the pointer and stores it as the explicit chroma target.
//
// Auto mode reuses a cached cutout when one exists. That makes output
// background changes live without re-running segmentation; otherwise
// the original remains visible until the user runs the model.
//
// Final commit is owned by RemoveBgPanel.

import { useCallback } from "react";
import { useEditor } from "../EditorContext";
import type { ImagePoint, Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { useSubjectMask } from "../ai/useSubjectMask";
import { paintMaskOverlay } from "./aiInspector";
import { backgroundFillForMode } from "./backgroundFill";
import { looksAlreadyRemoved } from "./removeBg";
import { useBackgroundPreview } from "./useBackgroundPreview";
import { useRemoveBgPreview } from "./useRemoveBgPreview";

export function RemoveBgTool() {
  const { toolState, patchTool, doc, historyVersion } = useEditor();
  const subjectMask = useSubjectMask();
  const isChroma = toolState.bgMode === 1;
  const backgroundFill = backgroundFillForMode(toolState.bgFillMode);
  // Subscribe to mask state.version so the inspector overlay
  // re-paints when the user runs detection or invalidates the cache.
  // We read the cut via `peek()` inside the painter so we always get
  // the freshest pointer; the version subscription is just the
  // re-render trigger.
  const maskVersion = subjectMask.state.version;
  const preview = useRemoveBgPreview(
    // Source is null in Auto mode so the preview hook stays idle and
    // doesn't allocate a downsample for a chroma keyer the user
    // isn't running.
    isChroma ? (doc?.working ?? null) : null,
    toolState.genericStrength,
    toolState.feather,
    toolState.bgSample,
    backgroundFill,
    toolState.bgFillColor,
    // historyVersion bumps on every commit / undo / redo / reset.
    // doc identity alone wouldn't catch intra-tool commits (Apply
    // chroma → bake → commit doesn't setDoc), which would leave the
    // downsample showing the pre-keyed pixels until the user left
    // and re-entered the tool.
    historyVersion,
  );
  const docIsTransparent =
    !!doc &&
    (doc.backgroundTreatment === "transparent" ||
      (doc.backgroundTreatment === "original" && looksAlreadyRemoved(doc.working)));
  const cachedCut = !isChroma ? subjectMask.peek() : null;
  const validCachedCut =
    cachedCut &&
    doc &&
    cachedCut.width === doc.working.width &&
    cachedCut.height === doc.working.height
      ? cachedCut
      : null;
  const backgroundPreview = useBackgroundPreview(
    !isChroma && backgroundFill !== "transparent"
      ? (validCachedCut ?? (docIsTransparent ? (doc?.working ?? null) : null))
      : null,
    backgroundFill,
    toolState.bgFillColor,
    historyVersion,
  );

  const onPick = useCallback(
    (p: ImagePoint) => {
      // Eyedropper only works in chroma mode; Auto mode doesn't sample
      // a colour, the model handles segmentation end-to-end.
      if (!isChroma || !toolState.bgPickActive || !doc || !p.inside) return;
      const ctx = doc.working.getContext("2d");
      if (!ctx) return;
      const x = Math.round(Math.max(0, Math.min(doc.width - 1, p.x)));
      const y = Math.round(Math.max(0, Math.min(doc.height - 1, p.y)));
      const data = ctx.getImageData(x, y, 1, 1).data;
      const hex = `#${[data[0], data[1], data[2]]
        .map((n) => (n ?? 0).toString(16).padStart(2, "0"))
        .join("")}`;
      patchTool("bgSample", hex);
      patchTool("bgPickActive", false);
    },
    [doc, isChroma, patchTool, toolState.bgPickActive],
  );

  // AI Inspector overlay — Auto mode only, gated on the user's
  // toolState toggle AND a cached mask. Reads the cut via peek() at
  // paint time so the freshly-completed detection result lands without
  // a stale closure capture. The `maskVersion` in the dep array bumps
  // the callback identity on every mask state change so StageHost's
  // identity check fires a re-paint.
  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      if (!toolState.aiInspector || isChroma || !doc) return;
      const cut = subjectMask.peek();
      if (!cut) return;
      // Defensive: stale mask vs. doc dim drift would paint a
      // misaligned overlay. Cheap guard via cached dims.
      if (cut.width !== doc.working.width || cut.height !== doc.working.height) return;
      // Reference maskVersion so re-renders triggered by detection
      // landing actually pull a fresh peek(). The body doesn't need
      // the value — its purpose is to invalidate the callback
      // identity so StageHost's identity check fires a re-paint.
      void maskVersion;
      paintMaskOverlay(ctx, t, cut, doc.width, doc.height);
    },
    [toolState.aiInspector, isChroma, doc, subjectMask, maskVersion],
  );

  useStageProps({
    previewCanvas: isChroma ? preview : backgroundPreview,
    cursor: isChroma && toolState.bgPickActive ? "crosshair" : undefined,
    onImagePointerDown: onPick,
    paintOverlay,
  });
  return null;
}
