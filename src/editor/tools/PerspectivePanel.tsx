// PerspectivePanel.tsx — Apply / Reset / output-size readout for the
// Perspective tool. The interaction itself happens on the canvas (see
// PerspectiveTool); this panel just confirms what's about to happen
// and lets the user fire it.

import { useCallback } from "react";
import { I } from "../../components/icons";
import { useEditor } from "../EditorContext";
import { copyInto } from "../doc";
import {
  defaultQuad,
  isPersIdentity,
  recommendedOutputSize,
  warpPerspective,
  type Quad,
} from "./perspective";

export function PerspectivePanel() {
  const { toolState, patchTool, doc, commit, runBusy, getFabricCanvas } = useEditor();

  const corners = (toolState.persCorners as Quad | null) ?? null;
  const docW = doc?.width ?? 0;
  const docH = doc?.height ?? 0;
  const dirty = !!doc && !isPersIdentity(corners, docW, docH);

  const reset = useCallback(() => {
    if (!doc) return;
    patchTool("persCorners", defaultQuad(doc.width, doc.height));
  }, [doc, patchTool]);

  const apply = useCallback(async () => {
    if (!doc || !corners || !dirty) return;
    await runBusy("Rectifying…", () => {
      const size = recommendedOutputSize(corners);
      const out = warpPerspective(doc.working, corners, size.w, size.h);
      copyInto(doc.working, out);
      doc.width = out.width;
      doc.height = out.height;
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
  }, [commit, corners, dirty, doc, getFabricCanvas, patchTool, runBusy]);

  const recommended = corners ? recommendedOutputSize(corners) : null;

  return (
    <>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        Drag the four coral handles on the canvas to the corners of the rectangular subject — a
        document, screen, or painting — then Apply to flatten it.
      </div>

      {recommended && (
        <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
          Output size: {recommended.w} × {recommended.h}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-xs flex-1 justify-center"
          onClick={reset}
          disabled={!dirty}
        >
          <I.Refresh size={12} />
          Reset
        </button>
        <button
          type="button"
          className="btn btn-primary btn-xs flex-1 justify-center"
          onClick={() => void apply()}
          disabled={!dirty}
        >
          <I.Check size={12} />
          Apply
        </button>
      </div>
    </>
  );
}
