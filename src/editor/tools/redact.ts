// redact.ts — Pure helpers that apply a redaction style to a rect of a
// canvas. Used by the interactive Redact tool.

import type { Rect } from "./cropMath";

export type RedactStyle = 0 | 1 | 2; // Pixelate | Blur | Solid

interface ApplyOpts {
  style: RedactStyle;
  /** 0..1 from the slider; mapped to a pixel-block size or blur radius. */
  strength: number;
  /** 0..1 from the slider; soft alpha at the rect edge. */
  feather: number;
}

/** Mutates `target` in place — applies the redaction to the rect. */
export function applyRedaction(target: HTMLCanvasElement, rect: Rect, opts: ApplyOpts) {
  const { style, strength, feather } = opts;
  const ctx = target.getContext("2d");
  if (!ctx) return;
  const { x, y, w, h } = clipRect(rect, target.width, target.height);
  if (w < 1 || h < 1) return;

  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const offCtx = off.getContext("2d");
  if (!offCtx) return;
  offCtx.drawImage(target, x, y, w, h, 0, 0, w, h);

  if (style === 0) pixelate(off, strength);
  else if (style === 1) blur(off, strength);
  else solid(off);

  if (feather > 0) {
    applyFeather(off, feather);
  }

  ctx.save();
  ctx.drawImage(off, x, y);
  ctx.restore();
}

function clipRect(r: Rect, w: number, h: number): Rect {
  const x = Math.max(0, Math.min(w, Math.floor(r.x)));
  const y = Math.max(0, Math.min(h, Math.floor(r.y)));
  const rw = Math.max(0, Math.min(w - x, Math.ceil(r.w)));
  const rh = Math.max(0, Math.min(h - y, Math.ceil(r.h)));
  return { x, y, w: rw, h: rh };
}

function pixelate(off: HTMLCanvasElement, strength: number) {
  const block = Math.max(2, Math.round(2 + strength * 40));
  const ctx = off.getContext("2d");
  if (!ctx) return;
  const sw = Math.max(1, Math.round(off.width / block));
  const sh = Math.max(1, Math.round(off.height / block));
  // Downscale to a small canvas, then upscale with smoothing off.
  const tiny = document.createElement("canvas");
  tiny.width = sw;
  tiny.height = sh;
  const tctx = tiny.getContext("2d");
  if (!tctx) return;
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, sw, sh);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, off.width, off.height);
  ctx.drawImage(tiny, 0, 0, sw, sh, 0, 0, off.width, off.height);
}

function blur(off: HTMLCanvasElement, strength: number) {
  const radius = Math.max(2, Math.round(2 + strength * 28));
  const ctx = off.getContext("2d");
  if (!ctx) return;
  // Use the native canvas filter — supported in all modern browsers.
  const tmp = document.createElement("canvas");
  tmp.width = off.width;
  tmp.height = off.height;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.filter = `blur(${radius}px)`;
  tctx.drawImage(off, 0, 0);
  ctx.clearRect(0, 0, off.width, off.height);
  ctx.drawImage(tmp, 0, 0);
}

function solid(off: HTMLCanvasElement) {
  const ctx = off.getContext("2d");
  if (!ctx) return;
  // Average color is dimension-invariant, so we sample from a small
  // proxy when the redaction region is large. On a full-res Smart
  // Anonymize bake this drops the `getImageData` allocation from up
  // to ~96 MB on a 24 MP region to ~256 KB on a 256 px proxy — a
  // measurable phone-perf win for the same fill colour.
  const PROBE_LONG_EDGE = 256;
  const long = Math.max(off.width, off.height);
  let probe: HTMLCanvasElement;
  let probeCtx: CanvasRenderingContext2D | null;
  let ownsProbe = false;
  if (long > PROBE_LONG_EDGE) {
    const ratio = PROBE_LONG_EDGE / long;
    const pw = Math.max(1, Math.round(off.width * ratio));
    const ph = Math.max(1, Math.round(off.height * ratio));
    probe = document.createElement("canvas");
    probe.width = pw;
    probe.height = ph;
    probeCtx = probe.getContext("2d");
    if (probeCtx) {
      probeCtx.imageSmoothingQuality = "low";
      probeCtx.drawImage(off, 0, 0, pw, ph);
      ownsProbe = true;
    } else {
      // Couldn't allocate a context — fall back to the full-res
      // sample so we at least produce a color.
      probe = off;
      probeCtx = ctx;
    }
  } else {
    probe = off;
    probeCtx = ctx;
  }
  void ownsProbe; // probe is plain DOM, GC'd when it falls out of scope
  // Average color of the (possibly proxied) region, then fill.
  const sample = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  const stride = 16; // sample every 16th pixel for speed
  for (let i = 0; i < sample.length; i += 4 * stride) {
    r += sample[i] ?? 0;
    g += sample[i + 1] ?? 0;
    b += sample[i + 2] ?? 0;
    n += 1;
  }
  if (n === 0) n = 1;
  ctx.fillStyle = `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
  ctx.fillRect(0, 0, off.width, off.height);
}

function applyFeather(off: HTMLCanvasElement, feather: number) {
  const ctx = off.getContext("2d");
  if (!ctx) return;
  const radius = Math.max(2, Math.round(2 + feather * 30));
  const w = off.width;
  const h = off.height;
  // Build a radial-ish mask: alpha falls off at the edges within `radius`.
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.min(x, w - 1 - x);
      const dy = Math.min(y, h - 1 - y);
      const dist = Math.min(dx, dy);
      if (dist >= radius) continue;
      const a = dist / radius;
      const i = (y * w + x) * 4 + 3;
      d[i] = Math.round((d[i] ?? 255) * a);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Live in-progress preview during drag.
 *
 *  Rather than a flat translucent rect, render the *actual* redaction
 *  style against the source pixels — pixelate via a downscale/upscale
 *  trick, blur via the Canvas2D filter, solid as a flat fill — so the
 *  user sees what the bake will produce before they release. Caller
 *  passes the image-space rect (`imgRect`) plus the same screen-space
 *  rect (`screenRect`) we used previously for the dashed marquee.
 */
export function drawRedactPreview(
  ctx: CanvasRenderingContext2D,
  screenRect: { x: number; y: number; w: number; h: number },
  style: RedactStyle,
  source?: HTMLCanvasElement,
  imgRect?: { x: number; y: number; w: number; h: number },
  strength?: number,
) {
  ctx.save();
  if (source && imgRect && imgRect.w > 0 && imgRect.h > 0 && style !== 2) {
    const sx = Math.max(0, Math.floor(imgRect.x));
    const sy = Math.max(0, Math.floor(imgRect.y));
    const sw = Math.max(1, Math.min(source.width - sx, Math.ceil(imgRect.w)));
    const sh = Math.max(1, Math.min(source.height - sy, Math.ceil(imgRect.h)));
    if (style === 0) {
      // Pixelate: downscale then upscale with smoothing off.
      const cellPx = Math.max(4, Math.round(((strength ?? 0.5) * 0.6 + 0.05) * 64));
      const cellsX = Math.max(1, Math.round(sw / cellPx));
      const cellsY = Math.max(1, Math.round(sh / cellPx));
      const tmp = document.createElement("canvas");
      tmp.width = cellsX;
      tmp.height = cellsY;
      const tctx = tmp.getContext("2d");
      if (tctx) {
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(source, sx, sy, sw, sh, 0, 0, cellsX, cellsY);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          tmp,
          0,
          0,
          cellsX,
          cellsY,
          screenRect.x,
          screenRect.y,
          screenRect.w,
          screenRect.h,
        );
        ctx.imageSmoothingEnabled = true;
      }
    } else {
      // Blur via Canvas2D filter.
      const blurPx = Math.max(2, Math.round(((strength ?? 0.5) * 0.7 + 0.05) * 28));
      ctx.filter = `blur(${blurPx}px)`;
      // Clip so the blur doesn't bleed past the rect.
      ctx.beginPath();
      ctx.rect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
      ctx.clip();
      ctx.drawImage(source, sx, sy, sw, sh, screenRect.x, screenRect.y, screenRect.w, screenRect.h);
      ctx.filter = "none";
    }
  } else {
    ctx.fillStyle =
      style === 2
        ? "rgba(28,24,20,0.85)"
        : style === 1
          ? "rgba(255,255,255,0.20)"
          : "rgba(28,24,20,0.55)";
    ctx.fillRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
  }
  ctx.restore();
  // Dashed marquee on top so the selection bounds stay visible.
  ctx.save();
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
  ctx.setLineDash([]);
  ctx.restore();
}
