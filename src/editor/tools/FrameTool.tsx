// FrameTool.tsx — Inset border around the working image, in any of
// several styles (Solid, Polaroid, Double, Rounded, Modern with EXIF
// strip, Cinema letterbox, vintage Film strip, soft Vignette). The
// live preview paints into the canvas's screen-space overlay via the
// same drawFrame helper that the bake uses against the working
// canvas, so what-you-see is what-you-get. Bake into history happens
// automatically on tool switch / Export via registerPendingApply —
// no explicit Apply button.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PropRow, Slider } from "../atoms";
import { ColorPicker } from "../ColorPicker";
import { copyInto, createCanvas, snapshot } from "../doc";
import { useEditor } from "../EditorContext";
import type { Transform } from "../ImageCanvas";
import { useStageProps } from "../StageHost";
import type { ToolState } from "../toolState";
import { useApplyOnToolSwitch } from "../useApplyOnToolSwitch";
import type { ExifData } from "./exif";

export const FRAME_STYLES = [
  "Solid",
  "Polaroid",
  "Double",
  "Rounded",
  "Capture",
  "Cinema",
  "Film",
  "Vignette",
] as const;
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
  // Capture exif (and the file-name / dimensions fallback) so styles
  // like Capture can render real camera metadata in their bottom
  // strip — and degrade to filename + WxH when EXIF is absent.
  // Closing over them (rather than threading them through
  // paintOverlay's signature) keeps the StageProps shape stable.
  const { doc } = useEditor();
  const exif = doc?.exif ?? null;
  const fileName = doc?.fileName ?? null;
  const imageW = doc?.width ?? 0;
  const imageH = doc?.height ?? 0;
  const paintOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, t: Transform, ts: ToolState) => {
      const w = ts.frameWidth;
      if (w <= 0) return;
      const sx = t.ox;
      const sy = t.oy;
      const sw = t.iw * t.scale;
      const sh = t.ih * t.scale;
      const sb = w * t.scale;
      drawFrame(ctx, ts.frameStyle, sx, sy, sw, sh, sb, ts.frameColor, {
        exif,
        fileName,
        imageW,
        imageH,
      });
    },
    [exif, fileName, imageW, imageH],
  );
  useStageProps({ paintOverlay });
  return null;
}

export function FramePanel() {
  const { toolState, patchTool, doc, commit, peekLastCommitLabel, undo, layout } = useEditor();
  const isMobile = layout === "mobile";
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
    drawFrame(ctx, toolState.frameStyle, 0, 0, doc.width, doc.height, w, toolState.frameColor, {
      exif: doc.exif,
      fileName: doc.fileName,
      imageW: doc.width,
      imageH: doc.height,
    });
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
      drawFrame(
        ctx,
        idx,
        0,
        0,
        STYLE_THUMB_PX,
        STYLE_THUMB_PX,
        previewWidth,
        toolState.frameColor,
        {
          thumb: true,
        },
      );
      return out.toDataURL("image/png");
    });
  }, [sourceThumb, w, shorterImageSide, toolState.frameColor]);

  // Auto-bake the frame preview if the user navigates away mid-edit.
  // `w > 0` is the panel's "anything to bake?" predicate — Frame is
  // dirty when the slider is non-zero (zero w = identity = no-op).
  useApplyOnToolSwitch(apply, w > 0);

  return (
    <>
      <PropRow label="Style">
        {/* On mobile the styles reflow into a single horizontally
            scrolling row so the panel stays short and the canvas above
            keeps its height. Desktop keeps the 4-up grid where vertical
            space is plentiful. Same trade FilterPanel makes. */}
        <div
          // See FilterPanel for the full rationale — `.scroll-thin`
          // no longer carries `overscroll-behavior: contain`, so this
          // horizontal scroller no longer blocks vertical pans from
          // chaining to the parent panel.
          className={
            isMobile
              ? "scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
              : "grid grid-cols-4 gap-1.5"
          }
        >
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
                  isMobile ? "w-18 shrink-0" : ""
                } ${
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
                <div className="px-1 py-0.75 text-center text-[10px] font-semibold">{name}</div>
              </button>
            );
          })}
        </div>
      </PropRow>
      <PropRow label="Width" value={`${w} px`}>
        <Slider
          value={maxFramePx > 0 ? Math.min(1, w / maxFramePx) : 0}
          accent={w > 0}
          defaultValue={0}
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
    case 4:
      return "Capture: polaroid card stamped with the photo's camera data — model, ƒ-stop, shutter, ISO, focal. When EXIF isn't available, the file name and pixel dimensions take its place.";
    case 5:
      return "Cinema: black letterbox bars on top and bottom — that 2.39:1 movie-still look. Frame colour is ignored.";
    case 6:
      return "Film: vintage film strip with sprocket holes top and bottom. Frame colour sets the strip — try black or sepia.";
    case 7:
      return "Vignette: soft radial darkening at the corners — no hard frame. Slider controls how strong the fade is.";
    default:
      return "Solid: a uniform inset border on all four sides.";
  }
}

/** Optional render hints. `exif` is consulted by the Capture style;
 *  `fileName` and `imageW`/`imageH` are the elegant fallback when
 *  EXIF is absent (screenshots, edited images, non-JPEGs). `thumb`
 *  switches text-bearing styles to a compact graphic representation
 *  that's still readable in the 64-px panel preview. */
interface DrawFrameOpts {
  exif?: ExifData | null;
  fileName?: string | null;
  imageW?: number;
  imageH?: number;
  thumb?: boolean;
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
  opts: DrawFrameOpts = {},
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
    case 4:
      drawModern(ctx, x, y, w, h, border, color, opts);
      break;
    case 5:
      drawCinema(ctx, x, y, w, h, border);
      break;
    case 6:
      drawFilm(ctx, x, y, w, h, border, color);
      break;
    case 7:
      drawVignette(ctx, x, y, w, h, border);
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

// ── Modern ──────────────────────────────────────────────────────────
// A polaroid card whose bottom strip carries the photo's camera
// metadata (camera body, ƒ-stop, shutter, ISO, focal length) with
// small geometric icons. Useful as a portfolio/social-post overlay.
function drawModern(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
  color: string,
  opts: DrawFrameOpts,
) {
  // Side margin matches polaroid; bottom is wider so two text lines
  // (camera + settings) breathe. Capped so the inner image survives.
  // Thumb previews use a slimmer strip (3× instead of 6×) so the
  // photo area still reads at 64 px — a real-render-proportioned
  // strip would swallow almost the entire thumbnail.
  const side = Math.min(b, w / 2, h / 6);
  const bottomMul = opts.thumb ? 3 : 6;
  const bottomMax = Math.min(b * bottomMul, h - side - 8);
  const bottom = Math.max(side * 2, bottomMax);

  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, side);
  ctx.fillRect(x, y + h - bottom, w, bottom);
  ctx.fillRect(x, y + side, side, h - side - bottom);
  ctx.fillRect(x + w - side, y + side, side, h - side - bottom);

  const ink = isLightHex(color) ? "#1a1a1a" : "#f5f5f5";
  const sub = isLightHex(color) ? "#777" : "#bbb";
  const stripTop = y + h - bottom;
  const padX = side * 1.4;

  if (opts.thumb) {
    // Real text would round to ~1 px on a 64-px thumb. Draw a bold
    // title bar plus a row of four short, varied-width bars — one per
    // metric in the real settings line — so the style reads as
    // "title + camera metadata" at panel-preview size. Plain dots
    // looked generic; typographic bars hint at actual values.
    const titleH = Math.max(2, Math.round(bottom * 0.18));
    const titleY = stripTop + bottom * 0.32;
    ctx.fillStyle = ink;
    ctx.fillRect(x + padX, titleY - titleH / 2, (w - 2 * padX) * 0.72, titleH);

    const subH = Math.max(1.5, Math.round(bottom * 0.12));
    const subY = stripTop + bottom * 0.66;
    const innerW = w - 2 * padX;
    const widths = [0.18, 0.22, 0.2, 0.16];
    const gap = innerW * 0.04;
    let gx = x + padX;
    ctx.fillStyle = sub;
    for (const ratio of widths) {
      const segW = innerW * ratio;
      ctx.fillRect(gx, subY - subH / 2, segW, subH);
      gx += segW + gap;
    }
    return;
  }

  const settings = formatSettings(opts.exif);
  const hasExif = settings.length > 0 || !!opts.exif?.Make || !!opts.exif?.Model;
  const titleText = hasExif
    ? formatCameraLine(opts.exif)
    : prettyFileName(opts.fileName) || "Untitled";
  const titleFont = Math.max(10, bottom * 0.17);
  const settingFont = Math.max(8, bottom * 0.12);
  const iconSize = settingFont * 1.15;

  const innerWidth = w - 2 * padX;
  const lineY = stripTop + bottom * 0.7;
  const rightLimit = x + w - padX;

  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.font = `600 ${titleFont}px "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif`;
  // Truncate long file names / camera strings with an ellipsis so a
  // 60-char filename doesn't run off the matte. Measurement happens
  // in the title font we just set.
  ctx.fillText(fitText(ctx, titleText, innerWidth), x + padX, stripTop + bottom * 0.34);

  ctx.fillStyle = sub;
  ctx.font = `500 ${settingFont}px "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif`;

  if (hasExif) {
    // Settings row: [icon] value · [icon] value · …  Skip silently
    // when a metric is missing so the row stays clean for partial EXIF.
    let cursorX = x + padX;
    const iconGap = iconSize * 0.4;
    const groupGap = iconSize * 1.1;
    for (const item of settings) {
      const textW = ctx.measureText(item.text).width;
      if (cursorX + iconSize + iconGap + textW > rightLimit) break;
      drawMetricIcon(ctx, item.kind, cursorX + iconSize / 2, lineY, iconSize, sub);
      ctx.fillStyle = sub;
      ctx.fillText(item.text, cursorX + iconSize + iconGap, lineY);
      cursorX += iconSize + iconGap + textW + groupGap;
    }
  } else {
    // No EXIF — render an honest, well-formed subtitle from what we
    // do know (image dimensions and format) so the frame doesn't
    // shout "missing data" at the viewer.
    ctx.fillText(fitText(ctx, formatFallbackLine(opts), innerWidth), x + padX, lineY);
  }
}

// ── Cinema ──────────────────────────────────────────────────────────
// Pure-black letterbox bars top + bottom (no side bars) for the
// classic 2.39:1 film-still look. Frame colour is intentionally
// ignored — letterboxes are always black.
function drawCinema(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
) {
  const bar = Math.min(b * 1.6, h / 3);
  ctx.fillStyle = "#000000";
  ctx.fillRect(x, y, w, bar);
  ctx.fillRect(x, y + h - bar, w, bar);
}

// ── Film ────────────────────────────────────────────────────────────
// Vintage film strip: solid border on top + bottom in `color`, then
// regularly spaced rounded "sprocket holes" punched through. Holes
// are filled with a contrasting tone derived from the strip colour so
// black film shows white holes and white film shows dark holes.
function drawFilm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
  color: string,
) {
  const strip = Math.min(b, h / 4);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, strip);
  ctx.fillRect(x, y + h - strip, w, strip);

  const holeH = strip * 0.5;
  const holeW = holeH * 1.5;
  const holeR = holeH * 0.22;
  const holeColor = isLightHex(color) ? "#1a1a1a" : "#f5f5f5";
  // Fit a whole number of holes evenly; keep at least 4 across so the
  // pattern reads as film even on narrow images.
  const desired = Math.max(4, Math.floor(w / (holeW * 1.9)));
  const totalHoleW = desired * holeW;
  const gap = (w - totalHoleW) / (desired + 1);
  const yTop = y + (strip - holeH) / 2;
  const yBot = y + h - strip + (strip - holeH) / 2;

  ctx.fillStyle = holeColor;
  for (let i = 0; i < desired; i++) {
    const cx = x + gap + i * (holeW + gap);
    ctx.beginPath();
    ctx.roundRect(cx, yTop, holeW, holeH, holeR);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cx, yBot, holeW, holeH, holeR);
    ctx.fill();
  }
}

// ── Vignette ────────────────────────────────────────────────────────
// Soft radial darkening from the corners — no hard frame edge.
// Strength scales with the slider so the user can dial in anything
// from a hint of falloff to a heavy vintage burn.
function drawVignette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  b: number,
) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const innerR = Math.min(w, h) * 0.32;
  const outerR = Math.hypot(w / 2, h / 2);
  // Map slider position (b relative to image's max sensible frame) to
  // a 0..1 strength so the effect is comparable across image sizes.
  const refMax = Math.min(w, h) * MAX_FRAME_FRACTION;
  const strength = Math.max(0, Math.min(1, b / refMax));
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, `rgba(0,0,0,${(0.3 + strength * 0.55).toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

// ── Modern: text + icon helpers ────────────────────────────────────
type MetricKind = "aperture" | "shutter" | "iso" | "focal";

interface MetricEntry {
  kind: MetricKind;
  text: string;
}

function formatCameraLine(exif: ExifData | null | undefined): string {
  const make = (exif?.Make ?? "").trim();
  const model = (exif?.Model ?? "").trim();
  // Manufacturers often duplicate the make in the model string (e.g.
  // "FUJIFILM" + "FUJIFILM X-T4") — strip the prefix when present.
  if (make && model.toLowerCase().startsWith(make.toLowerCase())) {
    return model.toUpperCase();
  }
  if (make && model) return `${make} ${model}`.toUpperCase();
  return (model || make || "").toUpperCase();
}

/** Strip the file extension and uppercase what's left so it reads as
 *  a deliberate title in the Capture frame's first line, rather than
 *  a raw filename like "img_0042.jpg". */
function prettyFileName(name: string | null | undefined): string {
  if (!name) return "";
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf(".");
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return stem.toUpperCase();
}

/** Subtitle when the photo has no EXIF: dimensions plus the file's
 *  format, formed from whatever the doc carries. Renders as e.g.
 *  "6048 × 8064 · JPG" or just "6048 × 8064" when the extension is
 *  unknown. */
function formatFallbackLine(opts: DrawFrameOpts): string {
  const parts: string[] = [];
  if (opts.imageW && opts.imageH) {
    parts.push(`${opts.imageW} × ${opts.imageH}`);
  }
  const ext = extractExtension(opts.fileName);
  if (ext) parts.push(ext.toUpperCase());
  return parts.join("  ·  ");
}

function extractExtension(name: string | null | undefined): string {
  if (!name) return "";
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Truncate `text` with an ellipsis so it fits within `maxWidth` in
 *  the ctx's *current* font. Binary search keeps it cheap even for
 *  very long inputs. Caller is responsible for setting `ctx.font`
 *  before calling. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || !text) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  if (ctx.measureText(ellipsis).width > maxWidth) return "";
  let lo = 0;
  let hi = text.length;
  let best = ellipsis;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function formatSettings(exif: ExifData | null | undefined): MetricEntry[] {
  if (!exif) return [];
  const out: MetricEntry[] = [];
  if (exif.FNumber) out.push({ kind: "aperture", text: exif.FNumber });
  if (exif.ExposureTime) out.push({ kind: "shutter", text: exif.ExposureTime });
  if (exif.ISO) out.push({ kind: "iso", text: `ISO ${exif.ISO}` });
  if (exif.FocalLength) out.push({ kind: "focal", text: exif.FocalLength });
  return out;
}

function drawMetricIcon(
  ctx: CanvasRenderingContext2D,
  kind: MetricKind,
  cx: number,
  cy: number,
  size: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(0.8, size * 0.085);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (kind) {
    case "aperture": {
      // Iris diaphragm — outer ring with six tangent blade lines that
      // form the characteristic hexagonal opening at the centre. Each
      // blade starts at a vertex on the rim and runs to a point ~half
      // the radius along the next-but-one direction, recreating the
      // overlap of real iris blades.
      const r = size * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a1 = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const a2 = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
        ctx.lineTo(cx + Math.cos(a2) * r * 0.55, cy + Math.sin(a2) * r * 0.55);
        ctx.stroke();
      }
      break;
    }
    case "shutter": {
      // Stopwatch — small crown bar + post at 12, body circle, and a
      // hand pointing toward 1 o'clock. Reads as "elapsed time" which
      // matches the ExposureTime metric better than a plain clock.
      const r = size * 0.36;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.1, cy - r - size * 0.14);
      ctx.lineTo(cx + size * 0.1, cy - r - size * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r - size * 0.14);
      ctx.lineTo(cx, cy - r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * 0.5, cy - r * 0.45);
      ctx.stroke();
      break;
    }
    case "iso": {
      // Image sensor — rounded square with a faint internal cross
      // that splits it into four quadrants. Reads as "sensor / pixels"
      // which matches the sensitivity metric.
      const r = size * 0.38;
      ctx.beginPath();
      ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.55);
      ctx.lineTo(cx, cy + r * 0.55);
      ctx.moveTo(cx - r * 0.55, cy);
      ctx.lineTo(cx + r * 0.55, cy);
      ctx.stroke();
      break;
    }
    case "focal": {
      // FOV cone — apex up, opening at the bottom. Reads as a lens'
      // angle of view, which is what focal length controls.
      const halfH = size * 0.4;
      const halfW = size * 0.36;
      ctx.beginPath();
      ctx.moveTo(cx, cy - halfH);
      ctx.lineTo(cx - halfW, cy + halfH);
      ctx.lineTo(cx + halfW, cy + halfH);
      ctx.closePath();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** Rough luminance test on a #rgb / #rrggbb hex. Used to pick a
 *  contrasting ink colour when the matte is user-chosen. */
function isLightHex(hex: string): boolean {
  const m = hex.replace("#", "");
  const expand =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  if (expand.length < 6) return true;
  const r = parseInt(expand.slice(0, 2), 16);
  const g = parseInt(expand.slice(2, 4), 16);
  const b = parseInt(expand.slice(4, 6), 16);
  // Rec. 601 luma; 0.55 threshold lands grey #808080 on the dark side
  // (so the ink picks white) which matches what people perceive.
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
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
