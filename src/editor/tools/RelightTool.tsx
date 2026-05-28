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
  // consent modal on first use). We key off the working-canvas
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
      // earlier pale-gold sun vanished on light/bright surfaces. The
      // layering (soft halo → tapered rays → dark ring → glossy orb →
      // specular + white rim) keeps the handle legible against both
      // light and dark backgrounds without relying on any single
      // contrasting element.
      const CORAL = "245, 97, 58"; // coral-500
      const CORAL_LIGHT = "255, 178, 152"; // lit highlight on the orb
      ctx.save();
      ctx.lineJoin = "round";

      // Soft coral halo — a gentle outer hug that fades to nothing,
      // not the heavy red blob the old gradient produced. Starts near
      // the orb edge and scales with intensity so it reads "lit" only
      // when the light is actually affecting the image.
      const glowR = r * (active ? 2.5 : 1.9);
      const glow = ctx.createRadialGradient(sx, sy, r * 0.8, sx, sy, glowR);
      glow.addColorStop(0, `rgba(${CORAL}, ${active ? 0.34 : 0.18})`);
      glow.addColorStop(1, `rgba(${CORAL}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Rays — eight tapered coral spokes with softly rounded tips and
      // a clear gap from the orb, so they read as proper sun rays
      // rather than short spikes. Bases tuck under the orb (drawn next)
      // so the rays appear to emanate from behind it.
      const rayInner = r + 5;
      const rayOuter = r + 15;
      const rayBase = 2.6;
      const rayTip = 0.9;
      ctx.fillStyle = `rgba(${CORAL}, ${active ? 0.95 : 0.8})`;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(-rayBase, rayInner);
        ctx.lineTo(-rayTip, rayOuter - rayTip);
        ctx.quadraticCurveTo(-rayTip, rayOuter, 0, rayOuter);
        ctx.quadraticCurveTo(rayTip, rayOuter, rayTip, rayOuter - rayTip);
        ctx.lineTo(rayBase, rayInner);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Dark ring behind the orb — contrast on light photos.
      ctx.beginPath();
      ctx.arc(sx, sy, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.20)";
      ctx.fill();

      // Glossy orb — radial gradient (top-left light → coral edge)
      // gives the core a lit, three-dimensional feel instead of a flat
      // disc.
      const orb = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.4, r * 0.1, sx, sy, r);
      orb.addColorStop(0, `rgba(${CORAL_LIGHT}, ${active ? 1 : 0.92})`);
      orb.addColorStop(1, `rgba(${CORAL}, ${active ? 1 : 0.92})`);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = orb;
      ctx.fill();

      // Specular highlight — a small soft white blob top-left sells the
      // glossy sphere.
      const hx = sx - r * 0.35;
      const hy = sy - r * 0.4;
      const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
      spec.addColorStop(0, "rgba(255, 255, 255, 0.5)");
      spec.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // White rim at the edge — contrast on dark photos / coral itself.
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(sx, sy, r - 0.75, 0, Math.PI * 2);
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
