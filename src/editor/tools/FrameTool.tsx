// FrameTool.tsx — Inset border (Solid / Polaroid / Double / Rounded)
// around the working image. The live preview paints into the canvas's
// screen-space overlay via the same drawFrame helper that the bake
// uses against the working canvas, so what-you-see is what-you-get.
// Bake into history happens automatically on tool switch / Export
// via registerPendingApply — no explicit Apply button.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PropRow, Slider } from "../atoms";
import { ColorPicker } from "../ColorPicker";
import { copyInto, createCanvas, snapshot } from "../doc";
import { useEditor } from "../EditorContext";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { ToolState } from "../toolState";

export const FRAME_STYLES = ["Solid", "Polaroid", "Double", "Rounded"] as const;
// Slider max is 15% of the shorter image side (with a 60 px floor so
// tiny images still get a usable range). A fixed 200-px ceiling looks
// like a hairline on a 6 kpx photo, which made the tool feel broken.
const MAX_FRAME_FRACTION = 0.15;
const MIN_MAX_FRAME_PX = 60;
const STYLE_THUMB_PX = 64;
// Floor for the panel-thumbnail border so each style's character
// (polaroid bottom, double rings, rounded corners) is always readable
// even when the actual frame-to-image ratio rounds down to ~0 px on
// the 64-px thumb.
const MIN_THUMB_BORDER_PX = 7;

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
  const { toolState, patchTool, doc, commit, registerPendingApply, peekLastCommitLabel, undo } =
    useEditor();
  const w = toolState.frameWidth;

  // Slider range scales with the image's shorter side so the same
  // slider position produces a visually equivalent frame across a
  // thumbnail and a 6 kpx photo.
  const maxFramePx = useMemo(
    () => (doc ? frameMaxFor(doc.width, doc.height) : MIN_MAX_FRAME_PX),
    [doc],
  );

  // Frame source — the working canvas as it looked BEFORE any frame
  // we're currently editing. Each Apply re-draws the frame on top of
  // this source instead of the live working canvas, so changing style
  // or width mid-session never stacks one frame on top of another.
  // Lifecycle:
  //   • If we re-enter the Frame tool sitting on our own previous
  //     "Frame" commit, undo it first so the snapshot below captures
  //     the true pre-frame state — re-editing a frame replaces it
  //     instead of layering another one.
  //   • Snapshot once per (doc.working) reference so it survives
  //     copyInto mutations from our own Apply calls.
  //   • Re-snapshot when the user opens a new image / crop / etc.
  const frameSourceRef = useRef<HTMLCanvasElement | null>(null);
  const seededDocRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!doc?.working) {
      frameSourceRef.current = null;
      seededDocRef.current = null;
      return;
    }
    if (seededDocRef.current === doc.working) return;
    seededDocRef.current = doc.working;
    if (peekLastCommitLabel() === "Frame") {
      // Replace, don't stack. undo() is async but copyInto-into-working
      // runs synchronously in the undo path, and the snapshot below
      // happens after the next render — so by then the working canvas
      // is back to the pre-frame state.
      void undo().then(() => {
        if (doc?.working) frameSourceRef.current = snapshot(doc.working);
      });
    } else {
      frameSourceRef.current = snapshot(doc.working);
    }
    const cap = frameMaxFor(doc.width, doc.height);
    if (toolState.frameWidth <= 0) {
      patchTool("frameWidth", defaultFrameWidth(doc.width, doc.height));
    } else if (toolState.frameWidth > cap) {
      patchTool("frameWidth", cap);
    }
  }, [
    doc?.working,
    doc?.width,
    doc?.height,
    toolState.frameWidth,
    patchTool,
    peekLastCommitLabel,
    undo,
    doc,
  ]);

  const apply = useCallback(() => {
    if (!doc || w <= 0) return;
    const source = frameSourceRef.current ?? doc.working;
    const out = createCanvas(doc.width, doc.height);
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(source, 0, 0);
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

  // Pre-render each style at its panel-thumbnail size. Border width
  // is the actual frame-to-image ratio mapped onto the 64-px thumb
  // (so the preview is a true scaled-down photo of what Apply will
  // bake), with a small floor so the four styles always read as
  // visually distinct even at very thin frame widths.
  const shorterImageSide = doc ? Math.max(1, Math.min(doc.width, doc.height)) : 0;
  const styleThumbUrls = useMemo(() => {
    if (!sourceThumb || shorterImageSide <= 0) return null;
    const exactPreviewPx = (w / shorterImageSide) * STYLE_THUMB_PX;
    const previewWidth = Math.max(MIN_THUMB_BORDER_PX, Math.round(exactPreviewPx));
    return FRAME_STYLES.map((_, idx) => {
      const out = createCanvas(STYLE_THUMB_PX, STYLE_THUMB_PX);
      const ctx = out.getContext("2d");
      if (!ctx) return "";
      ctx.drawImage(sourceThumb, 0, 0);
      drawFrame(ctx, idx, 0, 0, STYLE_THUMB_PX, STYLE_THUMB_PX, previewWidth, toolState.frameColor);
      return out.toDataURL("image/png");
    });
  }, [sourceThumb, w, shorterImageSide, toolState.frameColor]);

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
          value={maxFramePx > 0 ? Math.min(1, w / maxFramePx) : 0}
          accent={w > 0}
          onChange={(v) => patchTool("frameWidth", Math.round(v * maxFramePx))}
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

/** Slider ceiling for the current image. 15 % of the shorter side
 *  (with a 60-px floor for tiny inputs) keeps a thick frame visible
 *  without ever swallowing the photo. */
function frameMaxFor(width: number, height: number): number {
  const shorter = Math.max(1, Math.min(width, height));
  return Math.max(MIN_MAX_FRAME_PX, Math.round(shorter * MAX_FRAME_FRACTION));
}

/** Initial proportional width when the user opens the tool on a new
 *  image — ~3 % of the shorter side, clamped to a sensible band. */
function defaultFrameWidth(width: number, height: number): number {
  const shorter = Math.max(1, Math.min(width, height));
  return Math.max(8, Math.min(frameMaxFor(width, height), Math.round(shorter * 0.03)));
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
