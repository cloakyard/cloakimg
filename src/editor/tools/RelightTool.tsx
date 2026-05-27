// RelightTool.tsx — Stage half of the Relight tool. Owns the live
// depth-aware preview (useRelightPreview) plus the draggable "sun"
// handle painted directly on the photo. Tap or drag anywhere on the
// canvas to aim the light; the sun's position is stored in normalized
// image space so it survives crop / resize and reads identically across
// desktop, tablet, and mobile (ImageCanvas.toImagePoint already maps
// pointer → image space through zoom / pan / touch for us).

import { useCallback, useEffect, useRef } from "react";
import { useDepth } from "../ai/capabilities/depth/hook";
import type { MaskScope } from "../ai/subjectMask";
import { useSubjectMask } from "../ai/useSubjectMask";
import { useEditor } from "../EditorContext";
import type { ImagePoint, Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { ToolState } from "../toolState";
import { useRelightPreview } from "./useRelightPreview";

const HANDLE_R_PRECISE = 13;
const HANDLE_R_COARSE = 18;

export function RelightTool() {
  const { doc, toolState, patchTool, historyVersion } = useEditor();
  const depth = useDepth();
  const subjectMask = useSubjectMask();

  const scope = (toolState.relightScope as MaskScope) ?? 0;
  const maskReady = subjectMask.state.status === "ready";

  // Depth is required for relight — request it ONCE per source the
  // moment the tool opens (lazy: respects the deny latch, fires the
  // consent dialog on first use). We key off the working-canvas
  // identity and guard with a ref so the effect can't re-fire on every
  // depth-state tick — without the guard, an inference error flips
  // status to "error", which re-runs this effect, which re-requests,
  // which loops error → loading → error forever. After a failure the
  // panel's "Try again" (requestExplicit) is the retry path, not this.
  const depthRef = useRef(depth);
  depthRef.current = depth;
  const requestedSrcRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const src = doc?.working ?? null;
    if (!src || requestedSrcRef.current === src) return;
    requestedSrcRef.current = src;
    void depthRef.current.request().catch(() => undefined);
  }, [doc?.working]);

  const depthCanvas = depth.peek();

  const params = {
    sunX: toolState.relightSunX,
    sunY: toolState.relightSunY,
    elevation: toolState.relightElevation,
    intensity: toolState.relightIntensity,
    warmth: toolState.relightWarmth,
  };

  const preview = useRelightPreview(
    doc?.working ?? null,
    depthCanvas,
    params,
    scope,
    maskReady,
    historyVersion,
  );

  // —— Sun overlay ——
  const intensityRef = useRef(toolState.relightIntensity);
  intensityRef.current = toolState.relightIntensity;
  const sunRef = useRef({ x: toolState.relightSunX, y: toolState.relightSunY });
  sunRef.current = { x: toolState.relightSunX, y: toolState.relightSunY };
  const lastScaleRef = useRef(1);
  const draggingRef = useRef(false);

  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform, _ts: ToolState) => {
      lastScaleRef.current = t.scale;
      if (!doc) return;
      const sx = t.ox + sunRef.current.x * doc.width * t.scale;
      const sy = t.oy + sunRef.current.y * doc.height * t.scale;
      const isCoarse =
        typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      const r = isCoarse ? HANDLE_R_COARSE : HANDLE_R_PRECISE;
      const active = intensityRef.current > 0;

      // Brand coral (#f5613a) so the handle reads on any photo — the
      // earlier pale-gold sun vanished on light/bright surfaces. A solid
      // coral core plus a white inner ring AND a translucent dark outer
      // ring give contrast against both light and dark backgrounds.
      const CORAL = "245, 97, 58"; // coral-500
      ctx.save();

      // Coral glow — scales with intensity so the handle reads "lit"
      // only when it's actually affecting the image.
      const glowR = r * (active ? 2.6 : 1.7);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
      glow.addColorStop(0, `rgba(${CORAL}, ${active ? 0.55 : 0.32})`);
      glow.addColorStop(1, `rgba(${CORAL}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Rays — eight short coral spokes around the core.
      ctx.strokeStyle = `rgba(${CORAL}, 0.95)`;
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const inner = r + 3;
        const outer = r + 9;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * inner, sy + Math.sin(a) * inner);
        ctx.lineTo(sx + Math.cos(a) * outer, sy + Math.sin(a) * outer);
        ctx.stroke();
      }

      // Core — solid coral, always visible. Dark outer hairline first
      // (contrast on light photos), then the coral fill, then a white
      // inner ring (contrast on dark photos / coral itself).
      ctx.beginPath();
      ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${CORAL}, ${active ? 1 : 0.92})`;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(2, r - 4), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    },
    [doc],
  );

  // Place the sun at the tapped point and start dragging — the whole
  // canvas is the control surface, so aiming the light is one gesture.
  const place = useCallback(
    (p: ImagePoint) => {
      if (!doc) return;
      const x = Math.max(0, Math.min(1, p.x / doc.width));
      const y = Math.max(0, Math.min(1, p.y / doc.height));
      patchTool("relightSunX", x);
      patchTool("relightSunY", y);
    },
    [doc, patchTool],
  );

  const onImagePointerDown = useCallback(
    (p: ImagePoint) => {
      draggingRef.current = true;
      place(p);
    },
    [place],
  );

  const onImagePointerMove = useCallback(
    (p: ImagePoint) => {
      if (!draggingRef.current) return;
      place(p);
    },
    [place],
  );

  const onImagePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  useStageProps({
    previewCanvas: preview.canvas,
    previewVersion: preview.version,
    paintOverlay,
    onImagePointerDown,
    onImagePointerMove,
    onImagePointerUp,
    cursor: "crosshair",
  });
  return null;
}
