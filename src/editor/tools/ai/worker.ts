/// <reference lib="webworker" />
// worker.ts — Web Worker that hosts transformers.js pipelines.
//
// Why a worker we own (vs running transformers.js on the main thread):
//   • Inference stays off the editor's render path — the editor stays
//     interactive even mid-detection on a slow phone.
//   • We can abort cleanly via `worker.terminate()` from the runtime.
//     transformers.js + ONNX runtime have no graceful interrupt; the
//     only way to actually stop a running inference is to kill its
//     thread. Owning the worker means we own that lever.
//   • We control the pipeline cache and the wire format — input and
//     output both travel as transferable ImageBitmaps, so a typical
//     detection avoids ~130 ms of PNG encode/decode that the Blob
//     path would burn.
//
// The worker is a single dispatch table keyed by `kind`. New pipelines
// (face detection, OCR, depth) become new branches here and a new
// variant in types.ts — the main-thread runtime is untouched.

import { env, pipeline, RawImage } from "@huggingface/transformers";
import { createProgressAggregator } from "./progress";
import type {
  AiErrorResponse,
  AiProgressResponse,
  AiRequest,
  AiResultResponse,
  AiSegmentRequest,
} from "./types";

// Disable filesystem-backed local model loading — we ship the bytes
// from the HF CDN and let the browser cache them. `useBrowserCache` is
// already true by default in v3, but pinning it makes the intent
// explicit.
env.allowLocalModels = false;
env.useBrowserCache = true;

type SegmenterFn = (input: RawImage | Blob | string) => Promise<RawImage[]>;

interface CachedPipeline {
  key: string;
  pipeline: Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }>;
}

// Most-recently-used slot only. The previous shape (unbounded Map)
// would keep three pipelines alive if the user toggled all three
// quality tiers — ~300 MB+ of GPU memory for a flow that only ever
// uses one at a time. Single slot keeps the worst-case memory bounded
// while still avoiding the warm-up cost when the user runs detection
// twice in a row at the same tier. Tier switches re-instantiate from
// CacheStorage (~100–300 ms), which is negligible next to inference.
let currentPipeline: CachedPipeline | null = null;

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (e: MessageEvent<AiRequest>) => {
  const req = e.data;
  if (req.kind === "segment") {
    void handleSegment(req).catch((err) => {
      postError(req.id, err, true);
    });
  } else {
    // Unreachable today — added so adding a new kind in types.ts
    // surfaces as a TS exhaustiveness error here, not a silent drop.
    const _exhaustive: never = req.kind;
    void _exhaustive;
  }
};

async function handleSegment(req: AiSegmentRequest) {
  const requested = req.device ?? "auto";
  // Try WebGPU first when the caller asked for "auto" (or explicitly
  // for WebGPU). On a shader-compile failure we retry once with WASM
  // so the user still gets a working result on older Intel iGPUs.
  const order: ("webgpu" | "wasm")[] =
    requested === "wasm" ? ["wasm"] : requested === "webgpu" ? ["webgpu"] : ["webgpu", "wasm"];

  // Decode the input bitmap once. We reuse `inputImage` across
  // device retries so a WebGPU failure doesn't mean redoing the
  // pixel read. The bitmap is closed afterward — keeping it alive
  // would pin GPU memory we no longer need.
  const inputImage = bitmapToRawImage(req.bitmap);
  req.bitmap.close();

  let lastErr: unknown = null;
  for (const device of order) {
    try {
      const { segmenter, device: actualDevice } = await getSegmenter(req, device);
      postProgress(req.id, {
        phase: "inference",
        ratio: 0,
        label: "Detecting subject…",
      });
      const outputs = await segmenter(inputImage);
      const out = outputs[0];
      if (!out) throw new Error("Segmenter returned no output image");
      postProgress(req.id, { phase: "decode", ratio: 0.9, label: "Finalising…" });
      const outputBitmap = rawImageToBitmap(out);
      const result: AiResultResponse = {
        id: req.id,
        type: "result",
        bitmap: outputBitmap,
        width: out.width,
        height: out.height,
        device: actualDevice,
      };
      // Transfer the bitmap — zero-copy back to the main thread.
      self.postMessage(result, [outputBitmap]);
      return;
    } catch (err) {
      lastErr = err;
      // Drop the failing pipeline so the retry actually reloads with
      // the next device. Without this, a WebGPU shader compile
      // failure would be re-served from cache on every call.
      const failingKey = pipelineKey(req.model, req.dtype, device);
      if (currentPipeline?.key === failingKey) currentPipeline = null;
      // Fall through to the next device in the order list.
    }
  }
  postError(req.id, lastErr, true);
}

function pipelineKey(model: string, dtype: string, device: "webgpu" | "wasm"): string {
  return `${model}::${dtype}::${device}`;
}

function getSegmenter(
  req: AiSegmentRequest,
  device: "webgpu" | "wasm",
): Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }> {
  const key = pipelineKey(req.model, req.dtype, device);
  if (currentPipeline?.key === key) return currentPipeline.pipeline;
  // Replacing the slot drops the previous pipeline reference. ONNX
  // runtime's inference session and any GPU-resident weights become
  // GC-eligible once the next session takes over — there's no
  // explicit dispose call in transformers.js v3 to make that
  // immediate, so we rely on JS GC to release the bytes when memory
  // pressure builds.
  const built = buildSegmenter(req, device);
  currentPipeline = { key, pipeline: built };
  return built;
}

async function buildSegmenter(
  req: AiSegmentRequest,
  device: "webgpu" | "wasm",
): Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }> {
  const aggregator = createProgressAggregator("Downloading model…");
  // transformers.js' progress callback fires with several status
  // shapes. We only care about per-file byte counts during the
  // initial download — everything else maps to a phase change the
  // worker emits explicitly (inference, decode).
  const progress_callback = (data: unknown) => {
    if (!isHfProgressEvent(data)) return;
    const file = data.file ?? "model";
    const loaded = data.loaded ?? 0;
    const total = data.total ?? 0;
    const next = aggregator.push(file, loaded, total);
    if (next) postProgress(req.id, next);
  };

  // The `as any` here is the narrowest concession to transformers.js'
  // overloaded pipeline() typing — its `device` union accepts
  // "webgpu" / "wasm" / "cpu" but the published .d.ts doesn't expose
  // every combination cleanly. The runtime check is the actual
  // contract.
  const segmenter = (await pipeline("background-removal", req.model, {
    // biome-ignore lint/suspicious/noExplicitAny: see comment above
    device: device as any,
    // biome-ignore lint/suspicious/noExplicitAny: dtype enum mismatch with .d.ts
    dtype: req.dtype as any,
    progress_callback,
  })) as unknown as SegmenterFn;
  return { segmenter, device };
}

interface HfProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function isHfProgressEvent(data: unknown): data is HfProgressEvent {
  if (!data || typeof data !== "object") return false;
  const d = data as { status?: unknown; loaded?: unknown; total?: unknown };
  if (typeof d.status !== "string") return false;
  // Accept the per-file download progress events. transformers.js
  // also emits "initiate" / "download" / "done" / "ready" without
  // bytes — those don't move the bar.
  if (d.status !== "progress" && d.status !== "download") return false;
  return typeof d.loaded === "number" && typeof d.total === "number";
}

/** Convert the incoming source bitmap to a RawImage transformers.js
 *  can ingest. Path: bitmap → OffscreenCanvas → getImageData →
 *  RawImage. Skips a PNG decode that `RawImage.fromBlob` would
 *  otherwise pay (~50–100 ms on a 12 MP photo). */
function bitmapToRawImage(bitmap: ImageBitmap): RawImage {
  const w = bitmap.width;
  const h = bitmap.height;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable in worker");
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  return new RawImage(imageData.data, w, h, 4);
}

/** Paint the model's RawImage output into an OffscreenCanvas and hand
 *  back a transferable ImageBitmap. Replaces the older path that
 *  PNG-encoded the result here and PNG-decoded it on the main thread
 *  — saves ~130 ms per detection on large images.
 *
 *  Channel handling is conservative: background-removal pipelines
 *  always return RGBA today, but the function fans out to handle 1-
 *  or 3-channel returns so a future model swap (e.g. BiRefNet
 *  variants that return a single-channel mask) works without a
 *  worker rewrite. */
function rawImageToBitmap(img: RawImage): ImageBitmap {
  const w = img.width;
  const h = img.height;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable in worker");
  const imageData = ctx.createImageData(w, h);
  const src = img.data;
  const dst = imageData.data;
  if (img.channels === 4) {
    dst.set(src);
  } else if (img.channels === 3) {
    // RGB → RGBA with full alpha. Defensive: today's pipeline doesn't
    // hit this, but a model swap that yields RGB without applying
    // its own alpha would otherwise produce a black canvas.
    for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
      dst[j] = src[i] ?? 0;
      dst[j + 1] = src[i + 1] ?? 0;
      dst[j + 2] = src[i + 2] ?? 0;
      dst[j + 3] = 255;
    }
  } else if (img.channels === 1) {
    // Single-channel mask — interpret as alpha over a black RGB.
    // Callers that want the original colour overlay can composite
    // this over the source canvas.
    for (let i = 0; i < src.length; i++) {
      const a = src[i] ?? 0;
      const j = i * 4;
      dst[j] = 0;
      dst[j + 1] = 0;
      dst[j + 2] = 0;
      dst[j + 3] = a;
    }
  } else {
    throw new Error(`Unsupported channel count from segmenter: ${img.channels}`);
  }
  ctx.putImageData(imageData, 0, 0);
  // transferToImageBitmap detaches the OffscreenCanvas's backing
  // store into a transferable ImageBitmap — no extra copy.
  return offscreen.transferToImageBitmap();
}

function postProgress(id: string, progress: AiProgressResponse["progress"]) {
  const msg: AiProgressResponse = { id, type: "progress", progress };
  self.postMessage(msg);
}

function postError(id: string, err: unknown, fatal: boolean) {
  const message = err instanceof Error ? err.message : String(err);
  const msg: AiErrorResponse = { id, type: "error", message, fatal };
  self.postMessage(msg);
}
