// PerspectiveTool.tsx — On-canvas 4-corner handles plus the dim-outside
// preview overlay. The four handles live in image-space (toolState.
// persCorners). Drag a handle to mark a real-world corner of the
// rectangular subject; Apply rectifies the quad into a clean rectangle.

import { useCallback, useEffect, useRef } from "react";
import { useEditor } from "../EditorContext";
import type { ImagePoint, Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { ToolState } from "../toolState";
import { defaultQuad, type Quad } from "./perspective";

const HANDLE_R_PRECISE = 8;
const HANDLE_R_COARSE = 14;
const HIT_R_PRECISE = 18;
const HIT_R_COARSE = 28;

export function PerspectiveTool() {
  const { doc, toolState, patchTool } = useEditor();
  const draggingRef = useRef<number | null>(null);

  // Seed the quad to the image corners the first time the tool opens
  // on a fresh doc. Re-seeded when the working canvas dimensions
  // change — Crop mutates `doc.working` *in place* (same canvas
  // reference, new width/height), so identity-comparing the canvas
  // alone misses the re-seed and leaves stale corners pointing
  // outside the new image bounds.
  const seedRef = useRef<{ canvas: HTMLCanvasElement; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!doc) {
      seedRef.current = null;
      return;
    }
    const seen = seedRef.current;
    const sameSurface =
      seen && seen.canvas === doc.working && seen.w === doc.width && seen.h === doc.height;
    if (sameSurface && toolState.persCorners) return;
    seedRef.current = { canvas: doc.working, w: doc.width, h: doc.height };
    patchTool("persCorners", defaultQuad(doc.width, doc.height));
  }, [doc, doc?.width, doc?.height, patchTool, toolState.persCorners]);

  const corners: Quad | null = toolState.persCorners as Quad | null;
  const cornersRef = useRef<Quad | null>(corners);
  cornersRef.current = corners;

  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform, _ts: ToolState) => {
      const c = cornersRef.current;
      if (!c) return;
      const sP = c.map((p) => [t.ox + (p[0] ?? 0) * t.scale, t.oy + (p[1] ?? 0) * t.scale]) as [
        number,
        number,
      ][];
      // Dim the area outside the quad so the user can read the area
      // they're rectifying. Use evenodd to punch the quad through the
      // full-canvas rect.
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.moveTo(sP[0]?.[0] ?? 0, sP[0]?.[1] ?? 0);
      for (let i = 1; i < 4; i++) ctx.lineTo(sP[i]?.[0] ?? 0, sP[i]?.[1] ?? 0);
      ctx.closePath();
      ctx.fill("evenodd");

      // Quad outline.
      ctx.strokeStyle = "rgba(245, 97, 58, 0.9)"; // coral-500
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sP[0]?.[0] ?? 0, sP[0]?.[1] ?? 0);
      for (let i = 1; i < 4; i++) ctx.lineTo(sP[i]?.[0] ?? 0, sP[i]?.[1] ?? 0);
      ctx.closePath();
      ctx.stroke();

      // Corner handles. Filled coral with a white inner ring so they
      // read on any photo content.
      const isCoarse =
        typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      const r = isCoarse ? HANDLE_R_COARSE : HANDLE_R_PRECISE;
      for (let i = 0; i < 4; i++) {
        const px = sP[i]?.[0] ?? 0;
        const py = sP[i]?.[1] ?? 0;
        ctx.fillStyle = "rgba(245, 97, 58, 0.95)";
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, r - 4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
    [],
  );

  const findNearestHandle = useCallback((p: ImagePoint, scale: number): number | null => {
    const c = cornersRef.current;
    if (!c) return null;
    const isCoarse =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    const hitScreenPx = isCoarse ? HIT_R_COARSE : HIT_R_PRECISE;
    const hitImagePx = hitScreenPx / Math.max(0.001, scale);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const cx = c[i]?.[0] ?? 0;
      const cy = c[i]?.[1] ?? 0;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD <= hitImagePx * hitImagePx ? best : null;
  }, []);

  // Capture the live screen-to-image scale from paintOverlay so pointer
  // hit-test can size the grab radius in image-space pixels.
  const lastScaleRef = useRef(1);
  const paintWithScale = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform, ts: ToolState) => {
      lastScaleRef.current = t.scale;
      paintOverlay(ctx, t, ts);
    },
    [paintOverlay],
  );

  const onImagePointerDown = useCallback(
    (p: ImagePoint) => {
      const idx = findNearestHandle(p, lastScaleRef.current);
      if (idx == null) return;
      draggingRef.current = idx;
    },
    [findNearestHandle],
  );

  const onImagePointerMove = useCallback(
    (p: ImagePoint) => {
      const idx = draggingRef.current;
      if (idx == null) return;
      if (!doc) return;
      const c = cornersRef.current;
      if (!c) return;
      const next = [c[0], c[1], c[2], c[3]] as Quad;
      const x = Math.max(0, Math.min(doc.width, p.x));
      const y = Math.max(0, Math.min(doc.height, p.y));
      next[idx] = [x, y];
      patchTool("persCorners", next);
    },
    [doc, patchTool],
  );

  const onImagePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  useStageProps({
    paintOverlay: paintWithScale,
    onImagePointerDown,
    onImagePointerMove,
    onImagePointerUp,
    cursor: "crosshair",
  });
  return null;
}
