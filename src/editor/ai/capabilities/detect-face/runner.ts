// runner.ts — Main-thread MediaPipe FaceDetector runner.
//
// Why main-thread (and not the AI worker like segmentation)?
// MediaPipe's Tasks Web SDK uses Emscripten's `importScripts` to load
// its WASM glue. Module workers (which Vite produces with
// `new Worker(url, { type: "module" })`) don't expose `importScripts`,
// so the FilesetResolver call inside a module worker fails with
// "ModuleFactory not set." A classic worker would work, but spinning
// up a second runtime alongside the existing transformers.js worker
// just for one capability isn't worth the bundle / lifecycle cost.
//
// Inference itself is ~50 ms on a typical 1 MP photo (CPU delegate)
// and faster on GPU — the main-thread block is imperceptible. The
// download phase still streams progress through the same `onProgress`
// hook the panel UI subscribes to.

import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import { aiLog } from "../../log";
import type { FaceBox } from "../../runtime/types";

interface CachedDetector {
  modelUrl: string;
  wasmBaseUrl: string;
  delegate: "GPU" | "CPU";
  scoreThreshold: number;
  instance: FaceDetector;
}

let currentDetector: CachedDetector | null = null;
/** Cached model bytes by URL. Survives a GPU → CPU delegate switch
 *  inside the same call so we don't pay the network round-trip twice.
 *  The browser's HTTP + service-worker cache handle the cross-call
 *  case. */
let cachedBytes: { url: string; bytes: Uint8Array } | null = null;
/** Cached FilesetResolver vision pack — loading the WASM is the
 *  expensive bit, stash it across detector rebuilds. */
let cachedVision: {
  wasmBaseUrl: string;
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
} | null = null;

export interface RunDetectArgs {
  source: HTMLCanvasElement;
  modelUrl: string;
  wasmBaseUrl: string;
  scoreThreshold?: number;
  /** Same hint vocabulary as the worker handlers — auto/webgpu both
   *  prefer the GPU delegate, wasm forces CPU. Auto-falls-back to CPU
   *  on a GPU init failure. */
  device?: "auto" | "webgpu" | "wasm";
  signal?: AbortSignal;
  onProgress?: (p: {
    phase: "download" | "inference" | "decode";
    ratio: number;
    label: string;
    bytesDownloaded?: number;
    bytesTotal?: number;
  }) => void;
}

export async function runFaceDetect(args: RunDetectArgs): Promise<{
  faces: FaceBox[];
  device: "webgpu" | "wasm";
}> {
  const scoreThreshold = args.scoreThreshold ?? 0.5;
  const order = mapDeviceOrder(args.device);

  // Fetch model bytes (with progress) before touching MediaPipe so the
  // user sees the download bar fill regardless of which delegate ends
  // up running inference.
  const bytes = await loadModelBytes(args);
  if (args.signal?.aborted) throw makeAbortError();

  const vision = await getVision(args);
  if (args.signal?.aborted) throw makeAbortError();

  let lastErr: unknown = null;
  for (const delegate of order) {
    try {
      const detector = await getDetector(args, vision, bytes, delegate, scoreThreshold);
      if (args.signal?.aborted) throw makeAbortError();
      args.onProgress?.({ phase: "inference", ratio: 0, label: "Detecting faces…" });
      const result = detector.detect(args.source);
      args.onProgress?.({ phase: "decode", ratio: 0.9, label: "Finalising…" });
      const faces = mapDetections(
        result.detections,
        args.source.width,
        args.source.height,
        scoreThreshold,
      );
      aiLog.debug(
        "subjectMask",
        `[face-detect] inference done raw=${result.detections.length} kept=${faces.length} delegate=${delegate} src=${args.source.width}x${args.source.height} threshold=${scoreThreshold} boxes=${JSON.stringify(faces.map((f) => `${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.width)}x${Math.round(f.height)}@${f.score.toFixed(2)}`))}`,
      );
      return { faces, device: delegate === "GPU" ? "webgpu" : "wasm" };
    } catch (err) {
      lastErr = err;
      if (currentDetector?.delegate === delegate) {
        try {
          currentDetector.instance.close();
        } catch {
          // best-effort
        }
        currentDetector = null;
      }
    }
  }

  throw lastErr ?? new Error("Face detection failed on every available delegate.");
}

async function getDetector(
  args: RunDetectArgs,
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  bytes: Uint8Array,
  delegate: "GPU" | "CPU",
  scoreThreshold: number,
): Promise<FaceDetector> {
  if (
    currentDetector &&
    currentDetector.modelUrl === args.modelUrl &&
    currentDetector.wasmBaseUrl === args.wasmBaseUrl &&
    currentDetector.delegate === delegate &&
    currentDetector.scoreThreshold === scoreThreshold
  ) {
    return currentDetector.instance;
  }
  const instance = await FaceDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetBuffer: bytes,
      delegate,
    },
    runningMode: "IMAGE",
    minDetectionConfidence: scoreThreshold,
  });
  currentDetector = {
    modelUrl: args.modelUrl,
    wasmBaseUrl: args.wasmBaseUrl,
    delegate,
    scoreThreshold,
    instance,
  };
  return instance;
}

async function getVision(
  args: RunDetectArgs,
): Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> {
  if (cachedVision && cachedVision.wasmBaseUrl === args.wasmBaseUrl) return cachedVision.vision;
  const vision = await FilesetResolver.forVisionTasks(args.wasmBaseUrl);
  cachedVision = { wasmBaseUrl: args.wasmBaseUrl, vision };
  return vision;
}

async function loadModelBytes(args: RunDetectArgs): Promise<Uint8Array> {
  if (cachedBytes && cachedBytes.url === args.modelUrl) return cachedBytes.bytes;

  args.onProgress?.({
    phase: "download",
    ratio: 0,
    label: "Loading face detection model…",
  });
  const resp = await fetch(args.modelUrl, { signal: args.signal });
  if (!resp.ok) {
    throw new Error(`Couldn't load face detection model (${resp.status} ${resp.statusText})`);
  }
  const totalHeader = resp.headers.get("content-length");
  const total = totalHeader ? parseInt(totalHeader, 10) : 0;

  if (!resp.body || total === 0) {
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    cachedBytes = { url: args.modelUrl, bytes };
    args.onProgress?.({
      phase: "download",
      ratio: 1,
      label: "Loading face detection model…",
      bytesDownloaded: bytes.length,
      bytesTotal: bytes.length,
    });
    return bytes;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    if (args.signal?.aborted) {
      reader.cancel().catch(() => undefined);
      throw makeAbortError();
    }
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    args.onProgress?.({
      phase: "download",
      ratio: loaded / total,
      label: "Loading face detection model…",
      bytesDownloaded: loaded,
      bytesTotal: total,
    });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  cachedBytes = { url: args.modelUrl, bytes };
  return bytes;
}

function mapDetections(
  detections: ReadonlyArray<{
    boundingBox?: { originX: number; originY: number; width: number; height: number };
    categories: ReadonlyArray<{ score: number }>;
  }>,
  imageWidth: number,
  imageHeight: number,
  scoreThreshold: number,
): FaceBox[] {
  const out: FaceBox[] = [];
  for (const det of detections) {
    const box = det.boundingBox;
    if (!box) continue;
    const score = det.categories[0]?.score ?? 0;
    if (score < scoreThreshold) continue;
    const x = Math.max(0, box.originX);
    const y = Math.max(0, box.originY);
    const x2 = Math.min(imageWidth, box.originX + box.width);
    const y2 = Math.min(imageHeight, box.originY + box.height);
    const w = x2 - x;
    const h = y2 - y;
    if (w <= 0 || h <= 0) continue;
    out.push({ x, y, width: w, height: h, score });
  }
  return out;
}

function mapDeviceOrder(hint: RunDetectArgs["device"]): ("GPU" | "CPU")[] {
  if (hint === "wasm") return ["CPU"];
  if (hint === "webgpu") return ["GPU"];
  return ["GPU", "CPU"];
}

function makeAbortError(): Error {
  const err = new Error("Face detection aborted");
  err.name = "AbortError";
  return err;
}
