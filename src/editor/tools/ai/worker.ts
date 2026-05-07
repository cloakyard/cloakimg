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
//   • Caching the pipeline by `<model, dtype>` here means quality
//     switches don't pay the dynamic-import or warm-up cost twice.
//
// The worker is a single dispatch table keyed by `kind`. New pipelines
// (face detection, OCR, depth) become new branches here and a new
// variant in types.ts — the main-thread runtime is untouched.

import { env, pipeline, type RawImage } from "@huggingface/transformers";
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

type SegmenterFn = (input: Blob | string) => Promise<RawImage[]>;

// Keyed by `<repo>::<dtype>::<device>`. Holding the resolved pipeline
// lets a quality switch inside the same session reuse the loader for
// any tier the user already touched.
const pipelineCache = new Map<
  string,
  Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }>
>();

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

  let lastErr: unknown = null;
  for (const device of order) {
    try {
      const { segmenter, device: actualDevice } = await getSegmenter(req, device);
      postProgress(req.id, {
        phase: "inference",
        ratio: 0,
        label: "Detecting subject…",
      });
      const outputs = await segmenter(req.blob);
      const out = outputs[0];
      if (!out) throw new Error("Segmenter returned no output image");
      postProgress(req.id, { phase: "decode", ratio: 0.9, label: "Finalising…" });
      const pngBlob = await rawImageToPngBlob(out);
      const pngBytes = await pngBlob.arrayBuffer();
      const result: AiResultResponse = {
        id: req.id,
        type: "result",
        pngBytes,
        width: out.width,
        height: out.height,
        device: actualDevice,
      };
      // Transfer the PNG bytes — zero-copy back to the main thread.
      self.postMessage(result, [pngBytes]);
      return;
    } catch (err) {
      lastErr = err;
      // Drop the failing pipeline from the cache so the retry actually
      // reloads with the next device. Without this, a WebGPU shader
      // compile failure would be re-served from cache on every call.
      const key = pipelineKey(req.model, req.dtype, device);
      pipelineCache.delete(key);
      // Fall through to the next device in the order list.
    }
  }
  postError(req.id, lastErr, true);
}

function pipelineKey(model: string, dtype: string, device: "webgpu" | "wasm"): string {
  return `${model}::${dtype}::${device}`;
}

async function getSegmenter(
  req: AiSegmentRequest,
  device: "webgpu" | "wasm",
): Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }> {
  const key = pipelineKey(req.model, req.dtype, device);
  let cached = pipelineCache.get(key);
  if (!cached) {
    cached = buildSegmenter(req, device);
    pipelineCache.set(key, cached);
  }
  return cached;
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
    if (!isProgressEvent(data)) return;
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

interface ProgressEvent {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
}

function isProgressEvent(data: unknown): data is ProgressEvent {
  if (!data || typeof data !== "object") return false;
  const d = data as { status?: unknown; loaded?: unknown; total?: unknown };
  if (typeof d.status !== "string") return false;
  // Accept the per-file download progress events. transformers.js
  // also emits "initiate" / "download" / "done" / "ready" without
  // bytes — those don't move the bar.
  if (d.status !== "progress" && d.status !== "download") return false;
  return typeof d.loaded === "number" && typeof d.total === "number";
}

async function rawImageToPngBlob(img: RawImage): Promise<Blob> {
  // RawImage.toBlob() relies on OffscreenCanvas inside the worker —
  // available in every browser we support. Quality 1.0 keeps the
  // alpha lossless; PNG is lossless regardless but the option is
  // there for parity with the imgly-era encoder call.
  const blob = await img.toBlob("image/png", 1.0);
  return blob as Blob;
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
