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

import {
  type DataType,
  type DeviceType,
  env,
  LogLevel,
  pipeline,
  type ProgressInfo,
  RawImage,
} from "@huggingface/transformers";
import { aiLog } from "../log";
import { createProgressAggregator } from "./progress";
import type {
  AiErrorResponse,
  AiProgressResponse,
  AiReadyResponse,
  AiRequest,
  AiResultResponse,
  AiSegmentRequest,
  AiSelfErrorResponse,
} from "./types";

// Disable filesystem-backed local model loading — we ship the bytes
// from the HF CDN and let the browser cache them. `useBrowserCache` is
// true by default in browser environments, but pinning it makes the
// intent explicit.
env.allowLocalModels = false;
env.useBrowserCache = true;
// `useWasmCache` (new in v4) preloads the ONNX Runtime WASM factory
// (.mjs) cross-origin from jsdelivr, converts it to a blob URL, and
// then has ORT dynamic-import from that blob. In our PWA + module-
// worker context this path is fragile: a cross-origin blob import
// can fail with an opaque ErrorEvent (no message, no filename) that
// the worker's self.onerror can't intercept, and the user sees the
// generic "AI module failed to start" fallback even though the
// upstream model bytes are reachable.
//
// Disabling the preload reverts to v3's behaviour: ORT fetches the
// WASM directly via its built-in loader on first inference. The
// runtime files are small (~few hundred KB) and `useBrowserCache`
// still caches the *model* (6–25 MB Xenova/modnet ONNX) which is the
// part actually worth caching for offline use.
env.useWasmCache = false;
// Suppress transformers.js + ONNX Runtime info / warning chatter.
// v4 unified the verbosity controls: `env.logLevel` propagates down
// to ORT via `env.backends.onnx.setLogLevel`, replacing the
// `env.backends.onnx.{logLevel,wasm.logLevel}` knobs we had to set
// by hand in v3. The v4 release also hides ORT's WebGPU node-
// assignment warnings by default, so the bulk of the noise we used
// to fight is now gone — but pinning `LogLevel.ERROR` keeps the
// console focused on actual failures across browsers.
env.logLevel = LogLevel.ERROR;

// transformers.js v4's `BackgroundRemovalPipeline._call` returns the
// post-processed image as a single `RawImage` when fed a single input,
// or `RawImage[]` when fed an array. We always pass an array so the
// return is unambiguous and array-indexing works for the caller.
type SegmenterFn = (input: (RawImage | Blob | string)[]) => Promise<RawImage[]>;

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

// Capture errors thrown OUTSIDE a request handler — top-level module
// faults, an unhandled rejection from a stray promise, an error in a
// callback we didn't await. Post them as `self-error` messages so the
// main-thread runtime can render a real error to the user instead of
// the opaque "AI worker crashed (see browser console for details)"
// fallback that an empty ErrorEvent produces.
self.onerror = (event) => {
  // `event` is either an ErrorEvent (DOM workers) or a string + url +
  // lineno tuple (older browsers). We normalise to a string message.
  const message = typeof event === "string" ? event : (event.message ?? "Unknown worker error");
  const filename = typeof event === "string" ? undefined : event.filename;
  const errorObj =
    typeof event === "string" ? undefined : event.error instanceof Error ? event.error : undefined;
  postSelfError(buildErrorMessage(message, filename), errorObj?.stack);
};
self.onunhandledrejection = (event) => {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  postSelfError(`Unhandled rejection: ${message}`, stack);
};

// Post the ready ping AFTER the imports above have evaluated. If the
// transformers.js module itself fails to load (CORS, syntax error, a
// browser without WebAssembly support, etc.), we never reach this
// line — the main thread's getWorker() readiness promise rejects
// with a clear "model runtime failed to initialize" instead of an
// opaque ErrorEvent. The ping is `postMessage`, not `postProgress`,
// so the ready handshake survives even when no request id is
// outstanding.
postReady();

async function handleSegment(req: AiSegmentRequest) {
  const requested = req.device ?? "auto";
  // Try WebGPU first when the caller asked for "auto" (or explicitly
  // for WebGPU). On a shader-compile failure we retry once with WASM
  // so the user still gets a working result on older Intel iGPUs.
  const order: ("webgpu" | "wasm")[] =
    requested === "wasm" ? ["wasm"] : requested === "webgpu" ? ["webgpu"] : ["webgpu", "wasm"];

  aiLog.debug("worker", "handleSegment", {
    id: req.id,
    model: req.model,
    dtype: req.dtype,
    deviceOrder: order,
    bitmap: `${req.bitmap.width}x${req.bitmap.height}`,
  });

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
      // Wrap in an array so v4's pipeline always returns `RawImage[]`
      // and the [0] index below is well-defined. Passing a bare
      // RawImage made v4 return a single object — `outputs[0]` then
      // landed on RawImage's missing numeric property and we threw
      // "Segmenter returned no output image" on every device.
      const outputs = await segmenter([inputImage]);
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
      aiLog.debug("worker", "segmentation succeeded", {
        id: req.id,
        device: actualDevice,
        out: `${out.width}x${out.height}`,
      });
      // Transfer the bitmap — zero-copy back to the main thread.
      self.postMessage(result, [outputBitmap]);
      return;
    } catch (err) {
      lastErr = err;
      // Per-device failure: log root cause (WebGPU shader compile,
      // WASM fetch failure, model 404, etc.) so the browser console
      // captures it before we fall through to the next backend. Drop
      // the failing pipeline so the retry actually reloads with the
      // next device — otherwise a WebGPU shader compile failure would
      // be re-served from cache on every call.
      aiLog.warn("worker", `segmentation failed on ${device}`, {
        id: req.id,
        model: req.model,
        dtype: req.dtype,
        message: err instanceof Error ? err.message : String(err),
      });
      const failingKey = pipelineKey(req.model, req.dtype, device);
      if (currentPipeline?.key === failingKey) currentPipeline = null;
      // Fall through to the next device in the order list.
    }
  }
  aiLog.error("worker", "segmentation failed on all backends", lastErr, {
    id: req.id,
    model: req.model,
    dtype: req.dtype,
    triedDevices: order,
  });
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
  // transformers.js v4 ships a proper `ProgressInfo` discriminated
  // union — we narrow on `status === "progress"` (per-file byte
  // tick) and ignore the lifecycle events ("initiate" / "download" /
  // "done" / "ready" / "progress_total") that don't move our bar.
  // The aggregator already merges per-file counts into a single
  // monotonic ratio, so we don't need v4's new aggregated
  // `progress_total` event.
  const progress_callback = (data: ProgressInfo) => {
    if (data.status !== "progress") return;
    const next = aggregator.push(data.file ?? "model", data.loaded ?? 0, data.total ?? 0);
    if (next) postProgress(req.id, next);
  };

  // v4 publishes `DataType` and `DeviceType` as proper exports, so
  // we can drop the `as any` escapes we needed in v3. `req.dtype`
  // travels over postMessage as a plain string from the main thread,
  // so we narrow it through the published `DataType` union here —
  // the runtime check is still authoritative, but this lets the
  // compiler catch typos at the request-construction site.
  const segmenter = (await pipeline("background-removal", req.model, {
    device: device as DeviceType,
    dtype: req.dtype as DataType,
    progress_callback,
  })) as unknown as SegmenterFn;
  return { segmenter, device };
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
  const rawMessage = err instanceof Error ? err.message : String(err);
  // Map common low-level errors to actionable user-facing copy. The
  // raw message lands in the console log; this string is what shows
  // up in the dialog. Order matters — we match the most specific
  // patterns first.
  const message = friendlyErrorMessage(rawMessage);
  const msg: AiErrorResponse = { id, type: "error", message, fatal };
  self.postMessage(msg);
}

function postReady() {
  const msg: AiReadyResponse = { type: "ready" };
  self.postMessage(msg);
}

function postSelfError(message: string, stack?: string) {
  const msg: AiSelfErrorResponse = { type: "self-error", message, stack };
  self.postMessage(msg);
}

function buildErrorMessage(message: string, filename?: string): string {
  const friendly = friendlyErrorMessage(message);
  // `filename` for ESM workers is usually a chunk URL — useful for
  // debugging but noise for the user. Fold it into a parenthetical
  // only when the error didn't get matched to a friendlier copy
  // (i.e. when we're falling back to the raw runtime message).
  if (friendly !== message || !filename) return friendly;
  return `${friendly} (${filename})`;
}

/** Heuristic mapping of opaque transformer / ORT / fetch errors to
 *  copy a user can act on. Keep this defensive — every branch must
 *  fall back to the original message rather than swallow it. */
function friendlyErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  // Storage quota — Cache API / IndexedDB ran out of space mid-write.
  // Not the same as "OOM"; the user needs to clear browser storage,
  // not pick a smaller model.
  if (
    lower.includes("quotaexceeded") ||
    lower.includes("quota exceeded") ||
    lower.includes("storage full") ||
    lower.includes("disk is full")
  ) {
    return "Browser storage is full — the model bytes can't be cached. Clear some space in browser settings or use a private tab to try once without caching.";
  }
  // Browser-initiated abort — different from our explicit user
  // cancel. Common on mobile when the OS suspends a backgrounded
  // tab mid-fetch. We catch this BEFORE the generic "network"
  // branch because AbortError messages often start with "fetch failed".
  if (
    lower.includes("aborterror") ||
    lower.includes("the user aborted") ||
    lower.includes("the operation was aborted") ||
    lower.includes("request aborted")
  ) {
    return "Download was interrupted by the browser. This usually happens after a long pause — try again to resume.";
  }
  // Network / fetch failures — the model bytes never arrived. Most
  // common cause for a first-download crash on flaky mobile networks.
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("err_") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return "Couldn't reach the model server. Check your connection and try again.";
  }
  // OOM / allocation failure — rare with the modnet tiers (under
  // 30 MB) but still possible on memory-starved devices.
  if (
    lower.includes("out of memory") ||
    lower.includes("oom") ||
    lower.includes("allocation failed") ||
    lower.includes("rangeerror") ||
    lower.includes("array buffer allocation failed")
  ) {
    return "This device ran out of memory loading the model. Try the Fast (~6 MB) tier, or switch to the Chroma keyer for flat backgrounds.";
  }
  // WebAssembly compile errors — usually a browser without WASM SIMD
  // / threads, or a corrupt cache entry.
  if (lower.includes("webassembly") || lower.includes("wasm")) {
    return "The on-device runtime didn't compile in this browser. Try a recent Chrome / Safari, or use the Chroma keyer.";
  }
  // 404 / 403 from the HF CDN — the model was retired or the user
  // typed a bad model id (shouldn't happen for our pinned models, but
  // surfaces as a real error rather than "AI worker crashed").
  if (lower.includes("404") || lower.includes("not found")) {
    return "The model files weren't found on the server. The CloakIMG team may have updated them — try reloading the page.";
  }
  // Worker module load — this comes from our own self.onerror when
  // transformers.js itself failed to import inside the worker.
  if (lower.includes("importscripts") || lower.includes("syntax")) {
    return "AI module failed to load. Reload the page and try again.";
  }
  return raw || "AI worker hit an unexpected error.";
}
