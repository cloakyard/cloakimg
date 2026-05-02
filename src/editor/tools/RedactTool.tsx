// RedactTool.tsx — Two modes:
//
//   Rect (default): drag a rectangle on the image; on pointer-up the
//   region is replaced with the chosen Pixelate / Blur / Solid style.
//
//   Brush: drag continuously along the image; each pointer position
//   stamps a circular redaction blob (rect under the hood, with
//   feathered edges) along the path. Stamps are committed on pointer-up
//   so undo/redo treats the whole stroke as one action.

import { useCallback, useRef, useState } from "react";
import { useEditor } from "../EditorContext";
import type { ImagePoint, Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { Rect } from "./cropMath";
import { applyRedaction, drawRedactPreview, type RedactStyle } from "./redact";

export function RedactTool() {
  const { doc, toolState, commit } = useEditor();
  const [pendingRect, setPendingRect] = useState<Rect | null>(null);
  const [stamps, setStamps] = useState<{ x: number; y: number }[]>([]);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const isBrush = toolState.redactMode === 1;

  // Convert the brush slider (0..1) to a paint radius in image-space px.
  // Multiplies by image's short edge so the brush feels right on phone
  // screenshots (small) and 4K photos (big) alike.
  const brushRadius = useCallback(() => {
    if (!doc) return 24;
    const shortEdge = Math.min(doc.width, doc.height);
    return Math.max(8, Math.round(toolState.brushSize * shortEdge * 0.18));
  }, [doc, toolState.brushSize]);

  const onDown = useCallback(
    (p: ImagePoint) => {
      if (!p.inside) return;
      if (isBrush) {
        setStamps([{ x: p.x, y: p.y }]);
        return;
      }
      startRef.current = { x: p.x, y: p.y };
      setPendingRect({ x: p.x, y: p.y, w: 0, h: 0 });
    },
    [isBrush],
  );

  const onMove = useCallback(
    (p: ImagePoint) => {
      if (isBrush) {
        setStamps((prev) => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          if (!last) return prev;
          const dx = last.x - p.x;
          const dy = last.y - p.y;
          const r = brushRadius();
          // Only add a new stamp every ~r/3 pixels so the path is dense
          // enough to read continuous but doesn't explode in count.
          if (dx * dx + dy * dy < (r / 3) * (r / 3)) return prev;
          return [...prev, { x: p.x, y: p.y }];
        });
        return;
      }
      const start = startRef.current;
      if (!start) return;
      const x = Math.min(start.x, p.x);
      const y = Math.min(start.y, p.y);
      const w = Math.abs(p.x - start.x);
      const h = Math.abs(p.y - start.y);
      setPendingRect({ x, y, w, h });
    },
    [brushRadius, isBrush],
  );

  const onUp = useCallback(() => {
    if (!doc) {
      setPendingRect(null);
      setStamps([]);
      startRef.current = null;
      return;
    }
    if (isBrush) {
      const path = stamps;
      setStamps([]);
      if (path.length === 0) return;
      const r = brushRadius();
      for (const s of path) {
        applyRedaction(
          doc.working,
          { x: s.x - r, y: s.y - r, w: r * 2, h: r * 2 },
          {
            style: toolState.redactStyle as RedactStyle,
            strength: toolState.redactStrength,
            feather: toolState.feather,
          },
        );
      }
      commit("Brush redact");
      return;
    }
    const start = startRef.current;
    startRef.current = null;
    if (!start || !pendingRect) {
      setPendingRect(null);
      return;
    }
    const r = pendingRect;
    setPendingRect(null);
    if (r.w < 4 || r.h < 4) return;
    applyRedaction(doc.working, r, {
      style: toolState.redactStyle as RedactStyle,
      strength: toolState.redactStrength,
      feather: toolState.feather,
    });
    commit("Redact");
  }, [brushRadius, commit, doc, isBrush, pendingRect, stamps, toolState]);

  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform) => {
      if (isBrush) {
        if (stamps.length === 0) return;
        const r = brushRadius() * t.scale;
        ctx.save();
        ctx.fillStyle =
          toolState.redactStyle === 2
            ? "rgba(28,24,20,0.85)"
            : toolState.redactStyle === 1
              ? "rgba(255,255,255,0.30)"
              : "rgba(28,24,20,0.55)";
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1;
        for (const s of stamps) {
          const sx = t.ox + s.x * t.scale;
          const sy = t.oy + s.y * t.scale;
          ctx.beginPath();
          ctx.arc(sx, sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return;
      }
      if (!pendingRect) return;
      const sx = t.ox + pendingRect.x * t.scale;
      const sy = t.oy + pendingRect.y * t.scale;
      const sw = pendingRect.w * t.scale;
      const sh = pendingRect.h * t.scale;
      drawRedactPreview(
        ctx,
        { x: sx, y: sy, w: sw, h: sh },
        toolState.redactStyle as RedactStyle,
        doc?.working,
        pendingRect,
        toolState.redactStrength,
      );
    },
    [
      brushRadius,
      doc,
      isBrush,
      pendingRect,
      stamps,
      toolState.redactStrength,
      toolState.redactStyle,
    ],
  );

  useStageProps({
    paintOverlay,
    onImagePointerDown: onDown,
    onImagePointerMove: onMove,
    onImagePointerUp: onUp,
    cursor: "crosshair",
  });
  return null;
}
