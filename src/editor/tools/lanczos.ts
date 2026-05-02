// lanczos.ts — Lanczos-3 separable resample for high-quality downsizing.
// Pure function over canvases. Slower than the browser's native bilinear
// drawImage but produces noticeably crisper photos at moderate (2×–10×)
// downscales. Only worth running when the source is at least ~1.4× the
// target on the long edge — below that the gain over native is invisible.

import { createCanvas } from "../doc";

const A = 3; // Lanczos kernel radius

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function lanczos(x: number): number {
  if (x === 0) return 1;
  if (x <= -A || x >= A) return 0;
  return sinc(x) * sinc(x / A);
}

interface AxisWeights {
  /** For each output pixel: list of (sourceIndex, weight) pairs. */
  starts: Int32Array;
  lengths: Int32Array;
  indices: Int32Array;
  weights: Float32Array;
}

function buildAxis(srcSize: number, dstSize: number): AxisWeights {
  const ratio = srcSize / dstSize;
  // For upscales (ratio < 1) we still use kernel radius A; for downscales
  // we widen the kernel to capture more samples per output.
  const filterScale = Math.max(1, ratio);
  const support = A * filterScale;

  const starts = new Int32Array(dstSize);
  const lengths = new Int32Array(dstSize);

  // First pass: figure out total weight count.
  let total = 0;
  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) * ratio - 0.5;
    const left = Math.max(0, Math.floor(center - support + 0.5));
    const right = Math.min(srcSize - 1, Math.floor(center + support + 0.5));
    starts[i] = left;
    lengths[i] = right - left + 1;
    total += lengths[i] ?? 0;
  }

  const indices = new Int32Array(total);
  const weights = new Float32Array(total);

  let cursor = 0;
  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) * ratio - 0.5;
    const left = starts[i] ?? 0;
    const len = lengths[i] ?? 0;
    let sum = 0;
    for (let k = 0; k < len; k++) {
      const srcIdx = left + k;
      const w = lanczos((srcIdx - center) / filterScale);
      indices[cursor + k] = srcIdx;
      weights[cursor + k] = w;
      sum += w;
    }
    // Normalise to preserve brightness.
    if (sum !== 0) {
      const inv = 1 / sum;
      for (let k = 0; k < len; k++) {
        weights[cursor + k] = (weights[cursor + k] ?? 0) * inv;
      }
    }
    cursor += len;
  }

  return { starts, lengths, indices, weights };
}

/**
 * Resample `src` to `dstW × dstH` using Lanczos-3 separable filtering.
 * Returns a new canvas; does not mutate src.
 */
export function lanczosResample(
  src: HTMLCanvasElement,
  dstW: number,
  dstH: number,
): HTMLCanvasElement {
  const sw = src.width;
  const sh = src.height;
  if (sw === dstW && sh === dstH) {
    const out = createCanvas(dstW, dstH);
    out.getContext("2d")?.drawImage(src, 0, 0);
    return out;
  }
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) return fallback(src, dstW, dstH);
  const srcImg = sctx.getImageData(0, 0, sw, sh);
  const srcData = srcImg.data;

  // Horizontal pass: src (sw × sh) → tmp (dstW × sh)
  const xWeights = buildAxis(sw, dstW);
  const tmp = new Float32Array(dstW * sh * 4);
  for (let y = 0; y < sh; y++) {
    const srcRow = y * sw * 4;
    const tmpRow = y * dstW * 4;
    let cursor = 0;
    for (let x = 0; x < dstW; x++) {
      const start = xWeights.starts[x] ?? 0;
      const len = xWeights.lengths[x] ?? 0;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = 0; k < len; k++) {
        const idx = (xWeights.indices[cursor + k] ?? start) - start + start;
        const w = xWeights.weights[cursor + k] ?? 0;
        const off = srcRow + idx * 4;
        r += (srcData[off] ?? 0) * w;
        g += (srcData[off + 1] ?? 0) * w;
        b += (srcData[off + 2] ?? 0) * w;
        a += (srcData[off + 3] ?? 0) * w;
      }
      tmp[tmpRow + x * 4] = r;
      tmp[tmpRow + x * 4 + 1] = g;
      tmp[tmpRow + x * 4 + 2] = b;
      tmp[tmpRow + x * 4 + 3] = a;
      cursor += len;
    }
  }

  // Vertical pass: tmp (dstW × sh) → out (dstW × dstH)
  const yWeights = buildAxis(sh, dstH);
  const out = createCanvas(dstW, dstH);
  const octx = out.getContext("2d");
  if (!octx) return fallback(src, dstW, dstH);
  const outImg = octx.createImageData(dstW, dstH);
  const outData = outImg.data;

  for (let x = 0; x < dstW; x++) {
    let cursor = 0;
    for (let y = 0; y < dstH; y++) {
      const start = yWeights.starts[y] ?? 0;
      const len = yWeights.lengths[y] ?? 0;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let k = 0; k < len; k++) {
        const srcIdx = yWeights.indices[cursor + k] ?? start;
        const w = yWeights.weights[cursor + k] ?? 0;
        const off = srcIdx * dstW * 4 + x * 4;
        r += (tmp[off] ?? 0) * w;
        g += (tmp[off + 1] ?? 0) * w;
        b += (tmp[off + 2] ?? 0) * w;
        a += (tmp[off + 3] ?? 0) * w;
      }
      const off = (y * dstW + x) * 4;
      outData[off] = clamp255(r);
      outData[off + 1] = clamp255(g);
      outData[off + 2] = clamp255(b);
      outData[off + 3] = clamp255(a);
      cursor += len;
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out;
}

function fallback(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
  }
  return out;
}

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}
