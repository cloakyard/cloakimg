/// <reference lib="webworker" />
// depthHandler.ts — Worker-side handler for the "depth" AI request kind.
// Mirrors segmentHandler.ts: an MRU-of-1 pipeline cache keyed on
// model+dtype+device, a WebGPU→WASM fallback loop, and progress
// aggregation across the model's files.
//
// The one structural difference from segmentation: the depth pipeline
// returns `{ predicted_depth, depth }` where `depth` is a SINGLE-channel
// RawImage (the visualised inverse-depth map). shared.ts's
// `rawImageToBitmap` interprets 1-channel as *alpha over black* (correct
// for a segmentation cut, wrong for a depth map we want to read as a
// luminance value). So we convert locally to a grayscale RGBA bitmap
// (R=G=B=depth, A=255) — the relight bake reads any colour channel as
// the depth value.

import {
  type DataType,
  type DeviceType,
  pipeline,
  type ProgressInfo,
  RawImage,
} from "@huggingface/transformers";
import { aiLog } from "../../log";
import { bytesForDepthModel } from "../depthModels";
import { createProgressAggregator } from "../progress";
import type { AiDepthRequest, AiResultResponse } from "../types";
import { bitmapToRawImage, deviceOrder, postError, postProgress, postResult } from "./shared";

// transformers.js DepthEstimationPipeline._call returns a single
// `{ predicted_depth, depth }` object for a single input. `depth` is the
// visualised RawImage (1 channel for the small model).
type DepthOutput = { depth: RawImage };
type DepthEstimatorFn = (input: RawImage) => Promise<DepthOutput>;

interface CachedDepthEstimator {
  key: string;
  pipeline: Promise<{ estimator: DepthEstimatorFn; device: "webgpu" | "wasm" }>;
}

let currentPipeline: CachedDepthEstimator | null = null;

function pipelineKey(model: string, dtype: string, device: "webgpu" | "wasm"): string {
  return `${model}::${dtype}::${device}`;
}

/** Convert the model's (single-channel) depth RawImage into a grayscale
 *  RGBA ImageBitmap (R=G=B=depth, A=255). Falls through to a straight
 *  copy if a future model emits 3- or 4-channel depth visualisations. */
function depthToGrayscaleBitmap(img: RawImage): ImageBitmap {
  const w = img.width;
  const h = img.height;
  const offscreen = new OffscreenCanvas(w, h);
  const ctx = offscreen.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable in worker");
  const imageData = ctx.createImageData(w, h);
  const src = img.data;
  const dst = imageData.data;
  const ch = img.channels;
  for (let p = 0, j = 0; j < dst.length; p += ch, j += 4) {
    const v = src[p] ?? 0;
    dst[j] = v;
    dst[j + 1] = v;
    dst[j + 2] = v;
    dst[j + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return offscreen.transferToImageBitmap();
}

export async function handleDepth(req: AiDepthRequest): Promise<void> {
  const order = deviceOrder(req.device);

  aiLog.debug("worker", "handleDepth", {
    id: req.id,
    model: req.model,
    dtype: req.dtype,
    deviceOrder: order,
    bitmap: `${req.bitmap.width}x${req.bitmap.height}`,
  });

  const inputImage = bitmapToRawImage(req.bitmap, RawImage);
  req.bitmap.close();

  let lastErr: unknown = null;
  for (const device of order) {
    try {
      const { estimator, device: actualDevice } = await getEstimator(req, device);
      postProgress(req.id, { phase: "inference", ratio: 0, label: "Estimating depth…" });
      const output = await estimator(inputImage);
      const depth = output.depth;
      if (!depth) throw new Error("Depth estimator returned no depth map");
      postProgress(req.id, { phase: "decode", ratio: 0.9, label: "Finalising…" });
      const outputBitmap = depthToGrayscaleBitmap(depth);
      const result: AiResultResponse = {
        id: req.id,
        type: "result",
        resultKind: "depth",
        bitmap: outputBitmap,
        width: depth.width,
        height: depth.height,
        device: actualDevice,
      };
      aiLog.debug("worker", "depth succeeded", {
        id: req.id,
        device: actualDevice,
        out: `${depth.width}x${depth.height}`,
      });
      postResult(result, [outputBitmap]);
      return;
    } catch (err) {
      lastErr = err;
      aiLog.warn("worker", `depth failed on ${device}`, {
        id: req.id,
        model: req.model,
        dtype: req.dtype,
        message: err instanceof Error ? err.message : String(err),
      });
      const failingKey = pipelineKey(req.model, req.dtype, device);
      if (currentPipeline?.key === failingKey) currentPipeline = null;
    }
  }
  aiLog.error("worker", "depth failed on all backends", lastErr, {
    id: req.id,
    model: req.model,
    dtype: req.dtype,
    triedDevices: order,
  });
  postError(req.id, lastErr, true);
}

function getEstimator(
  req: AiDepthRequest,
  device: "webgpu" | "wasm",
): Promise<{ estimator: DepthEstimatorFn; device: "webgpu" | "wasm" }> {
  const key = pipelineKey(req.model, req.dtype, device);
  if (currentPipeline?.key === key) return currentPipeline.pipeline;
  const built = buildEstimator(req, device);
  currentPipeline = { key, pipeline: built };
  return built;
}

async function buildEstimator(
  req: AiDepthRequest,
  device: "webgpu" | "wasm",
): Promise<{ estimator: DepthEstimatorFn; device: "webgpu" | "wasm" }> {
  const aggregator = createProgressAggregator(
    "Downloading model…",
    bytesForDepthModel(req.model, req.dtype),
  );
  const progress_callback = (data: ProgressInfo) => {
    if (data.status !== "progress") return;
    const next = aggregator.push(data.file ?? "model", data.loaded ?? 0, data.total ?? 0);
    if (next) postProgress(req.id, next);
  };

  const estimator = (await pipeline("depth-estimation", req.model, {
    device: device as DeviceType,
    dtype: req.dtype as DataType,
    progress_callback,
  })) as unknown as DepthEstimatorFn;
  return { estimator, device };
}
