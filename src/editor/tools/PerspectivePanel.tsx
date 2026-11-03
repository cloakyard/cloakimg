// PerspectivePanel.tsx — Apply / Reset / output-size readout for the
// Perspective tool. The interaction itself happens on the canvas (see
// PerspectiveTool); this panel just confirms what's about to happen
// and lets the user fire it.

import { useCallback } from "react";
import { I } from "../../components/icons";
import { copyInto, releaseCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import {
  defaultQuad,
  isPersIdentity,
  isQuadDegenerate,
  type Quad,
  recommendedOutputSize,
  warpPerspectiveAsync,
} from "./perspective";

export function PerspectivePanel() {
  const { toolState, patchTool, doc, commit, runBusy, getFabricCanvas } = useEditor();

  const corners = (toolState.persCorners as Quad | null) ?? null;
  const docW = doc?.width ?? 0;
  const docH = doc?.height ?? 0;
  const dirty = !!doc && !isPersIdentity(corners, docW, docH);
  // Quads collapsed onto a single point or a thin line make the
  // homography solve return NaN — the bake would silently blank the
  // canvas. Block Apply (and surface a hint) when that happens.
  const degenerate = !!doc && !!corners && isQuadDegenerate(corners, docW, docH);

  const reset = useCallback(() => {
    if (!doc) return;
    patchTool("persCorners", defaultQuad(doc.width, doc.height));
  }, [doc, patchTool]);

  // Auto-bake on tool switch — wires the same `apply` into the
  // pending-apply slot the EditorContext flushes when the active tool
  // changes. Without this, the shared Apply action (which
  // resets activeTool to Move and triggers the flush) would close the
  // tool without ever performing the rectification. The (dirty &&
  // !degenerate) gate keeps a no-op tool peek or an unsolvable quad
  // from baking.
  // (Defined later in this component — useApplyOnToolSwitch is called
  // after `apply` is constructed below.)

  const apply = useCallback(async () => {
    if (!doc || !corners || !dirty || degenerate) return;
    await runBusy("Rectifying…", async () => {
      const size = recommendedOutputSize(corners);
      // Async chunked warp keeps the busy-spinner animating during a
      // multi-second bake at full resolution. The output canvas is a
      // fresh allocation (perspective.ts uses createCanvas), but we
      // still hand it back to the pool via releaseCanvas after
      // copyInto so a second rectification can reuse the buffer
      // instead of growing the heap.
      const out = await warpPerspectiveAsync(doc.working, corners, size.w, size.h);
      copyInto(doc.working, out);
      doc.width = out.width;
      doc.height = out.height;
      releaseCanvas(out);
      // Fabric layer positions don't translate cleanly through a
      // homography, and silently leaving them where they are creates
      // worse-feeling drift than just clearing them. Drop everything
      // that isn't already baked. Watermarks get re-added cheaply on
      // the next visit; users with custom layers will undo if needed.
      const fc = getFabricCanvas();
      if (fc) {
        fc.remove(...fc.getObjects());
        fc.requestRenderAll();
      }
      patchTool("persCorners", defaultQuad(out.width, out.height));
      commit("Perspective");
    });
  }, [commit, corners, degenerate, dirty, doc, getFabricCanvas, patchTool, runBusy]);

  useApplyOnToolSwitch(apply, dirty && !degenerate);

  const recommended = corners ? recommendedOutputSize(corners) : null;

  return (
    <>
      <div className="text-[0.8125rem] leading-relaxed text-text-muted">
        Drag the four handles to the corners of the rectangular subject, then choose Apply to
        flatten it.
      </div>

      {recommended && !degenerate && (
        <div className="text-[0.8125rem] leading-relaxed text-text-muted">
          Output size: {recommended.w} × {recommended.h}
        </div>
      )}
      {degenerate && (
        <div role="alert" data-tool-blocked className="text-[0.8125rem] leading-relaxed text-text">
          The four corners are too close together to rectify. Spread them apart to mark the
          subject's actual edges.
        </div>
      )}

      <button
        type="button"
        className="air-button air-button--quiet w-full"
        onClick={reset}
        disabled={!dirty}
      >
        <I.Refresh size={16} aria-hidden="true" /> Reset
      </button>
    </>
  );
}
