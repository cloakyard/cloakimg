// exportCodec.ts — Main-thread bridge to the AVIF/HEIC codec worker.

import type {
  ExportCodecRequest,
  ExportCodecResponse,
  WorkerCodecFormat,
} from "./exportCodec.worker";

interface PendingCall {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  timeout: number;
  mime: string;
}

const pending = new Map<number, PendingCall>();
let worker: Worker | null = null;
let nextId = 0;
const ENCODE_TIMEOUT_MS = 120_000;

function rejectAll(error: Error): void {
  for (const call of pending.values()) {
    window.clearTimeout(call.timeout);
    call.reject(error);
  }
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    throw new Error("Modern image export needs WebAssembly and Web Worker support");
  }

  worker = new Worker(new URL("./exportCodec.worker.ts", import.meta.url), {
    type: "module",
    name: "cloakimg-export-codec",
  });
  worker.onmessage = (event: MessageEvent<ExportCodecResponse>) => {
    const response = event.data;
    const call = pending.get(response.id);
    if (!call) return;
    pending.delete(response.id);
    window.clearTimeout(call.timeout);
    if (response.ok) {
      const ownedBytes = new Uint8Array(response.bytes);
      call.resolve(new Blob([ownedBytes.buffer], { type: call.mime }));
    } else {
      call.reject(new Error(response.message));
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "The image codec worker stopped unexpectedly");
    rejectAll(error);
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export function encodeModernCanvas(
  canvas: HTMLCanvasElement,
  format: WorkerCodecFormat,
  quality: number,
): Promise<Blob> {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return Promise.reject(new Error("Could not read export pixels"));

  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const id = ++nextId;
  const mime = format === "heic" ? "image/heic" : "image/avif";

  return new Promise<Blob>((resolve, reject) => {
    let codecWorker: Worker;
    try {
      codecWorker = getWorker();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const timeout = window.setTimeout(() => {
      const call = pending.get(id);
      if (!call) return;
      pending.delete(id);
      call.reject(new Error(`${format.toUpperCase()} export timed out`));
    }, ENCODE_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timeout, mime });

    const request: ExportCodecRequest = {
      id,
      format,
      rgba,
      width: canvas.width,
      height: canvas.height,
      quality,
    };
    codecWorker.postMessage(request, [rgba.buffer]);
  });
}
