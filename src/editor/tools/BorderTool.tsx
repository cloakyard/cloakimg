// BorderTool.tsx — Live preview for the Border tool. Painted on the
// stage's screen-space overlay so the user sees the new edge growing
// outward from the image while they drag the slider. The Apply bake
// rebuilds the working canvas at the new (larger) dimensions; until
// then the doc keeps its original size and the preview just shades
// the surrounding matte.

import { useCallback } from "react";
import { useEditor } from "../EditorContext";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { ToolState } from "../toolState";
import { computeAspectTargetSize } from "./border";

export function BorderTool() {
  const { doc } = useEditor();
  const docW = doc?.width ?? 0;
  const docH = doc?.height ?? 0;

  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform, ts: ToolState) => {
      if (!docW || !docH) return;
      const { padL, padT, padR, padB } = computePadding(ts, docW, docH);
      if (padL <= 0 && padT <= 0 && padR <= 0 && padB <= 0) return;
      const sx = t.ox;
      const sy = t.oy;
      const sw = t.iw * t.scale;
      const sh = t.ih * t.scale;
      const sl = padL * t.scale;
      const stp = padT * t.scale;
      const sr = padR * t.scale;
      const sb = padB * t.scale;
      ctx.save();
      ctx.fillStyle = ts.borderColor;
      // Four sides: top, bottom, left, right. Corners are covered by
      // the top + bottom strips so we never double-fill.
      ctx.fillRect(sx - sl, sy - stp, sw + sl + sr, stp);
      ctx.fillRect(sx - sl, sy + sh, sw + sl + sr, sb);
      ctx.fillRect(sx - sl, sy, sl, sh);
      ctx.fillRect(sx + sw, sy, sr, sh);
      ctx.restore();
    },
    [docW, docH],
  );
  useStageProps({ paintOverlay });
  return null;
}

interface Padding {
  padL: number;
  padT: number;
  padR: number;
  padB: number;
}

export function computePadding(ts: ToolState, srcW: number, srcH: number): Padding {
  if (ts.borderMode === 0) {
    const t = Math.max(0, Math.round(ts.borderThickness));
    return { padL: t, padT: t, padR: t, padB: t };
  }
  const aspect = ts.borderAspect;
  if (aspect <= 0) return { padL: 0, padT: 0, padR: 0, padB: 0 };
  const target = computeAspectTargetSize(srcW, srcH, aspect);
  const dx = Math.max(0, target.w - srcW);
  const dy = Math.max(0, target.h - srcH);
  const padL = Math.floor(dx / 2);
  const padT = Math.floor(dy / 2);
  return { padL, padT, padR: dx - padL, padB: dy - padT };
}
