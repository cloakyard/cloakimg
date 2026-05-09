/// <reference lib="webworker" />
// segmentHandler.ts — Worker-side handler for the "segment" AI request
// kind. Extracted from the original monolithic worker.ts so the
// dispatcher (worker.ts) becomes a thin top-level router and the
// segmentation-specific logic gets its own home.
//
// The same MRU-of-1 pipeline cache the original used. Switching tiers
// (q8 → fp16 → fp32) within segmentation evicts the previous slot —
// keeping all three warm would tie up ~300 MB of GPU memory for a flow
// that only ever uses one at a time. Switching capabilities (segment
// → detect-face later) is a different module's slot, so they don't
// evict each other.

import {
  type DataType,
  type DeviceType,
  pipeline,
  type ProgressInfo,
  RawImage,
} from "@huggingface/transformers";
import { aiLog } from "../../log";
import { createProgressAggregator } from "../progress";
import type { AiResultResponse, AiSegmentRequest } from "../types";
import {
  bitmapToRawImage,
  deviceOrder,
  postError,
  postProgress,
  postResult,
  rawImageToBitmap,
} from "./shared";

// transformers.js v4's BackgroundRemovalPipeline._call returns
// post-processed RawImage[] when fed an array. We always pass an array
// so the return shape is unambiguous and array-indexing is well-defined.
type SegmenterFn = (input: (RawImage | Blob | string)[]) => Promise<RawImage[]>;

interface CachedSegmenter {
  key: string;
  pipeline: Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }>;
}

let currentPipeline: CachedSegmenter | null = null;

function pipelineKey(model: string, dtype: string, device: "webgpu" | "wasm"): string {
  return `${model}::${dtype}::${device}`;
}

export async function handleSegment(req: AiSegmentRequest): Promise<void> {
  const order = deviceOrder(req.device);

  aiLog.debug("worker", "handleSegment", {
    id: req.id,
    model: req.model,
    dtype: req.dtype,
    deviceOrder: order,
    bitmap: `${req.bitmap.width}x${req.bitmap.height}`,
  });

  // Decode the input bitmap once — reuse across device retries so a
  // WebGPU failure doesn't redo the pixel read.
  const inputImage = bitmapToRawImage(req.bitmap, RawImage);
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
      const outputs = await segmenter([inputImage]);
      const out = outputs[0];
      if (!out) throw new Error("Segmenter returned no output image");
      postProgress(req.id, { phase: "decode", ratio: 0.9, label: "Finalising…" });
      const outputBitmap = rawImageToBitmap(out);
      const result: AiResultResponse = {
        id: req.id,
        type: "result",
        resultKind: "segment",
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
      postResult(result, [outputBitmap]);
      return;
    } catch (err) {
      lastErr = err;
      aiLog.warn("worker", `segmentation failed on ${device}`, {
        id: req.id,
        model: req.model,
        dtype: req.dtype,
        message: err instanceof Error ? err.message : String(err),
      });
      const failingKey = pipelineKey(req.model, req.dtype, device);
      if (currentPipeline?.key === failingKey) currentPipeline = null;
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

function getSegmenter(
  req: AiSegmentRequest,
  device: "webgpu" | "wasm",
): Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }> {
  const key = pipelineKey(req.model, req.dtype, device);
  if (currentPipeline?.key === key) return currentPipeline.pipeline;
  const built = buildSegmenter(req, device);
  currentPipeline = { key, pipeline: built };
  return built;
}

async function buildSegmenter(
  req: AiSegmentRequest,
  device: "webgpu" | "wasm",
): Promise<{ segmenter: SegmenterFn; device: "webgpu" | "wasm" }> {
  const aggregator = createProgressAggregator("Downloading model…");
  const progress_callback = (data: ProgressInfo) => {
    if (data.status !== "progress") return;
    const next = aggregator.push(data.file ?? "model", data.loaded ?? 0, data.total ?? 0);
    if (next) postProgress(req.id, next);
  };

  const segmenter = (await pipeline("background-removal", req.model, {
    device: device as DeviceType,
    dtype: req.dtype as DataType,
    progress_callback,
  })) as unknown as SegmenterFn;
  return { segmenter, device };
}
