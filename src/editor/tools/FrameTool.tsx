// FrameTool.tsx — Inset border (Solid / Polaroid / Double / Rounded)
// around the working image. The live preview paints into the canvas's
// screen-space overlay via the same drawFrame helper that the bake
// uses against the working canvas, so what-you-see is what-you-get.
// Bake into history happens automatically on tool switch / Export
// via registerPendingApply — no explicit Apply button.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColorPicker } from "../ColorPicker";
import { copyInto, createCanvas } from "../doc";
import { useEditor } from "../EditorContext";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import { PropRow, Slider } from "../atoms";
import type { ToolState } from "../toolState";

export const FRAME_STYLES = ["Solid", "Polaroid", "Double", "Rounded"] as const;
const MAX_FRAME_PX = 200;
const STYLE_THUMB_PX = 64;

export function FrameTool() {
  const paintOverlay = useCallback((ctx: CanvasRenderingContext2D, t: Transform, ts: ToolState) => {
    const w = ts.frameWidth;
    if (w <= 0) return;
    const sx = t.ox;
    const sy = t.oy;
    const sw = t.iw * t.scale;
    const sh = t.ih * t.scale;
    const sb = w * t.scale;
    drawFrame(ctx, ts.frameStyle, sx, sy, sw, sh, sb, ts.frameColor);
  }, []);
  useStageProps({ paintOverlay });
  return null;
}

export function FramePanel() {
  const { toolState, patchTool, doc, commit, registerPendingApply } = useEditor();
  const w = toolState.frameWidth;

  const apply = useCallback(() => {
    if (!doc || w <= 0) return;
    const out = createCanvas(doc.width, doc.height);
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(doc.working, 0, 0);
    drawFrame(ctx, toolState.frameStyle, 0, 0, doc.width, doc.height, w, toolState.frameColor);
    copyInto(doc.working, out);
    patchTool("frameWidth", 0);
    commit("Frame");
  }, [commit, doc, patchTool, toolState.frameColor, toolState.frameStyle, w]);

  // Square thumb of doc.working for the style preview row, refreshed
  // whenever the working canvas reference changes (open / undo / new
  // commits). Cached so panel re-renders during a slider drag don't
  // re-thumb the source on every frame.
  const [sourceThumb, setSourceThumb] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!doc?.working) {
      setSourceThumb(null);
      return;
    }
    setSourceThumb(makeSquareThumb(doc.working, STYLE_THUMB_PX));
  }, [doc?.working]);

  // Pre-render each style at its panel-thumbnail size with the user's
  // current frame width and colour, so the preview matches what Apply
  // will produce.
  const styleThumbUrls = useMemo(() => {
    if (!sourceThumb) return null;
    const previewWidth = Math.max(2, Math.round((w / MAX_FRAME_PX) * 14) || 8);
    return FRAME_STYLES.map((_, idx) => {
      const out = createCanvas(STYLE_THUMB_PX, STYLE_THUMB_PX);
      const ctx = out.getContext("2d");
      if (!ctx) return "";
      ctx.drawImage(sourceThumb, 0, 0);
      drawFrame(ctx, idx, 0, 0, STYLE_THUMB_PX, STYLE_THUMB_PX, previewWidth, toolState.frameColor);
      return out.toDataURL("image/png");
    });
  }, [sourceThumb, w, toolState.frameColor]);

  // Auto-bake the frame preview if the user navigates away mid-edit.
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (w <= 0) {
      registerPendingApply(null);
      return;
    }
    registerPendingApply(() => applyRef.current());
    return () => registerPendingApply(null);
  }, [registerPendingApply, w]);

  return (
    <>
      <PropRow label="Style">
        <div className="grid grid-cols-4 gap-1.5">
          {FRAME_STYLES.map((name, i) => {
            const active = i === toolState.frameStyle;
            const thumbUrl = styleThumbUrls?.[i];
            return (
              <button
                key={name}
                type="button"
                onClick={() => patchTool("frameStyle", i)}
                aria-pressed={active}
                aria-label={name}
                className={`cursor-pointer overflow-hidden rounded-md bg-page-bg p-0 dark:bg-dark-page-bg ${
                  active
                    ? "border-2 border-coral-500"
                    : "border border-border dark:border-dark-border"
                }`}
              >
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={name}
                    className="block aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full bg-page-bg dark:bg-dark-page-bg" />
                )}
                <div className="px-1 py-0.5 text-center text-[9.5px] font-semibold">{name}</div>
              </button>
            );
          })}
        </div>
      </PropRow>
      <PropRow label="Width" value={`${w} px`}>
        <Slider
          value={Math.min(1, w / MAX_FRAME_PX)}
          accent={w > 0}
          onChange={(v) => patchTool("frameWidth", Math.round(v * MAX_FRAME_PX))}
        />
      </PropRow>
      <PropRow label="Color">
        <ColorPicker value={toolState.frameColor} onChange={(c) => patchTool("frameColor", c)} />
      </PropRow>
      <div className="text-[11.5px] leading-relaxed text-text-muted dark:text-dark-text-muted">
        {hintFor(toolState.frameStyle)}
      </div>
    </>
  );
}

function hintFor(style: number): string {
  switch (style) {
    case 1:
      return "Polaroid: thin top/sides with a thicker bottom card. Pairs well with a white frame colour.";
    case 2:
      return "Double: a thin outer band, a small gap, then a thinner inner line.";
    case 3:
      return "Rounded: solid frame with rounded inner corners — gives the image a rounded-card look.";
    default:
      return "Solid: a uniform inset border on all four sides.";
  }
}

/** Paint the chosen frame style over `(x, y, w, h)` with `border` pixels
 *  of inset thickness. Shared between the live preview and the Apply
 *  bake so they always agree visually. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  style: number,
  x: number,
  y: number,
  w: number,
  h: number,
  border: number,
  color: string,
) {
  ctx.save();
  ctx.fillStyle = color;
  switch (style) {
    case 1:
      drawPolaroid(ctx, x, y, w, h, border);
      break;
    case 2:
      drawDouble(ctx, x, y, w, h, border);
      break;
    case 3:
      drawRounded(ctx, x, y, w, h, border);
      break;
    default:
      drawSolidInset(ctx, x, y, w, h, border);
  }
  ctx.restore();
}

function drawSolidInset(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
) {
  const cb = Math.min(b, w / 2, h / 2);
  ctx.fillRect(x, y, w, cb);
  ctx.fillRect(x, y + h - cb, w, cb);
  ctx.fillRect(x, y + cb, cb, h - 2 * cb);
  ctx.fillRect(x + w - cb, y + cb, cb, h - 2 * cb);
}

function drawPolaroid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
) {
  // Bottom strip is ~3x the side thickness. Cap so it never exceeds
  // half the image height (otherwise the inner viewport vanishes).
  const top = Math.min(b, w / 2, h / 4);
  const bottom = Math.min(b * 3, h - top - 8);
  ctx.fillRect(x, y, w, top);
  ctx.fillRect(x, y + h - bottom, w, bottom);
  ctx.fillRect(x, y + top, top, h - top - bottom);
  ctx.fillRect(x + w - top, y + top, top, h - top - bottom);
}

function drawDouble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
) {
  const outer = Math.max(1, b * 0.35);
  const gap = b * 0.45;
  const inner = Math.max(1, b - outer - gap);
  drawSolidInset(ctx, x, y, w, h, outer);
  const offset = outer + gap;
  drawSolidInset(ctx, x + offset, y + offset, w - 2 * offset, h - 2 * offset, inner);
}

function drawRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
) {
  // Frame fills the area between the canvas edge and a rounded inner
  // window. evenodd fill rule punches the inner window out of the
  // outer rect.
  const r = Math.min(b * 1.2, (w - 2 * b) / 2, (h - 2 * b) / 2);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.roundRect(x + b, y + b, w - 2 * b, h - 2 * b, r);
  ctx.fill("evenodd");
}

/** Centre-cropped square thumb for the panel style preview row. */
function makeSquareThumb(src: HTMLCanvasElement, size: number): HTMLCanvasElement {
  const out = createCanvas(size, size);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.imageSmoothingQuality = "high";
  const ratio = Math.min(src.width, src.height) / size;
  const cw = size * ratio;
  const ch = size * ratio;
  const cx = (src.width - cw) / 2;
  const cy = (src.height - ch) / 2;
  ctx.drawImage(src, cx, cy, cw, ch, 0, 0, size, size);
  return out;
}
