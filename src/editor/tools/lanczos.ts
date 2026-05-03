// lanczos.ts — Lanczos-3 separable resample for high-quality downsizing.
// Pure function over canvases. Slower than the browser's native bilinear
// drawImage but produces noticeably crisper photos at moderate (2×–10×)
// downscales. Only worth running when the source is at least ~1.4× the
// target on the long edge — below that the gain over native is invisible.
//
// The convolution kernel runs on the main thread by default, but
// `lanczosResampleAsync` ships the work into a Web Worker (lazy-spun)
// so big resizes don't lock up the UI. The DOM-touching parts
// (HTMLCanvasElement, ImageData hand-off) stay on the main thread; the
// worker only sees raw Uint8ClampedArray payloads transferred without
// a copy.

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

/** Pure pixel-buffer convolution. Lives in its own function so the
 *  worker can call it without pulling in any DOM types. */
export function lanczosResampleBuffer(
  srcData: Uint8ClampedArray,
  sw: number,
  sh: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const xWeights = buildAxis(sw, dstW);
  const tmp = new Float32Array(dstW * sh * 4);
  for (let y = 0; y < sh; y++) {
    const srcRow = y * sw * 4;
    const tmpRow = y * dstW * 4;
    let cursor = 0;
    for (let x = 0; x < dstW; x++) {
      const len = xWeights.lengths[x] ?? 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < len; k++) {
        const idx = xWeights.indices[cursor + k] ?? 0;
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

  const yWeights = buildAxis(sh, dstH);
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  for (let x = 0; x < dstW; x++) {
    let cursor = 0;
    for (let y = 0; y < dstH; y++) {
      const len = yWeights.lengths[y] ?? 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = 0; k < len; k++) {
        const srcIdx = yWeights.indices[cursor + k] ?? 0;
        const w = yWeights.weights[cursor + k] ?? 0;
        const off = srcIdx * dstW * 4 + x * 4;
        r += (tmp[off] ?? 0) * w;
        g += (tmp[off + 1] ?? 0) * w;
        b += (tmp[off + 2] ?? 0) * w;
        a += (tmp[off + 3] ?? 0) * w;
      }
      const off = (y * dstW + x) * 4;
      dst[off] = clamp255(r);
      dst[off + 1] = clamp255(g);
      dst[off + 2] = clamp255(b);
      dst[off + 3] = clamp255(a);
      cursor += len;
    }
  }
  return dst;
}

/**
 * Resample `src` to `dstW × dstH` using Lanczos-3 separable filtering.
 * Returns a new canvas; does not mutate src. Synchronous — locks the
 * main thread for the duration of the convolution. Prefer
 * `lanczosResampleAsync` for any image larger than a few megapixels.
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
  const out = createCanvas(dstW, dstH);
  const octx = out.getContext("2d");
  if (!octx) return fallback(src, dstW, dstH);
  const dst = lanczosResampleBuffer(srcImg.data, sw, sh, dstW, dstH);
  // Use createImageData + .set so we sidestep TS's strict
  // `Uint8ClampedArray<ArrayBuffer>` requirement on the ImageData
  // constructor — we just need the bytes copied into the canvas's
  // own ImageData object.
  const outImg = octx.createImageData(dstW, dstH);
  outImg.data.set(dst);
  octx.putImageData(outImg, 0, 0);
  return out;
}

/**
 * Async variant — runs the convolution inside a Web Worker so the UI
 * thread stays interactive. Falls back to the synchronous path if the
 * worker can't be created or the runtime doesn't expose `Worker`.
 */
export async function lanczosResampleAsync(
  src: HTMLCanvasElement,
  dstW: number,
  dstH: number,
): Promise<HTMLCanvasElement> {
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

  try {
    const worker = await getWorker();
    if (!worker) return lanczosResample(src, dstW, dstH);
    const dst = await runOnWorker(worker, srcImg.data, sw, sh, dstW, dstH);
    const out = createCanvas(dstW, dstH);
    const octx = out.getContext("2d");
    if (!octx) return fallback(src, dstW, dstH);
    const outImg = octx.createImageData(dstW, dstH);
    outImg.data.set(dst);
    octx.putImageData(outImg, 0, 0);
    return out;
  } catch {
    // Worker construction or messaging failed — fall back to the
    // synchronous path so Apply still produces a result.
    return lanczosResample(src, dstW, dstH);
  }
}

interface WorkerRequest {
  id: number;
  srcData: Uint8ClampedArray;
  sw: number;
  sh: number;
  dstW: number;
  dstH: number;
}
interface WorkerResponse {
  id: number;
  dstData: Uint8ClampedArray;
}

let cachedWorker: Worker | null = null;
let workerPromise: Promise<Worker | null> | null = null;
let nextRequestId = 0;
const pending = new Map<number, (data: Uint8ClampedArray) => void>();

async function getWorker(): Promise<Worker | null> {
  if (cachedWorker) return cachedWorker;
  if (workerPromise) return workerPromise;
  if (typeof Worker === "undefined") return null;
  workerPromise = (async () => {
    try {
      const w = new Worker(new URL("./lanczos.worker.ts", import.meta.url), { type: "module" });
      w.addEventListener("message", (e: MessageEvent<WorkerResponse>) => {
        const cb = pending.get(e.data.id);
        if (cb) {
          pending.delete(e.data.id);
          cb(e.data.dstData);
        }
      });
      cachedWorker = w;
      return w;
    } catch {
      return null;
    } finally {
      workerPromise = null;
    }
  })();
  return workerPromise;
}

function runOnWorker(
  worker: Worker,
  srcData: Uint8ClampedArray,
  sw: number,
  sh: number,
  dstW: number,
  dstH: number,
): Promise<Uint8ClampedArray> {
  return new Promise((resolve) => {
    const id = ++nextRequestId;
    pending.set(id, resolve);
    // Transfer the source buffer so we don't pay a structured-clone
    // copy of a potentially-huge ArrayBuffer just to ship it across.
    const req: WorkerRequest = { id, srcData, sw, sh, dstW, dstH };
    worker.postMessage(req, [srcData.buffer]);
  });
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
