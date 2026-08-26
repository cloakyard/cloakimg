/// <reference lib="webworker" />
// exportCodec.worker.ts — Serial worker for the heavyweight modern
// image encoders. Pixel buffers move in and encoded bytes move out as
// transferables, keeping AVIF/HEIC work off the UI thread.

import { encodeAvifPixels } from "./avifCodec";
import { encodeHeicPixels } from "./heifCodec";

export type WorkerCodecFormat = "avif" | "heic";

export interface ExportCodecRequest {
  id: number;
  format: WorkerCodecFormat;
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  quality: number;
}

export type ExportCodecResponse =
  | { id: number; ok: true; bytes: Uint8Array }
  | { id: number; ok: false; message: string };

declare const self: DedicatedWorkerGlobalScope;

async function handle(req: ExportCodecRequest): Promise<void> {
  try {
    const bytes =
      req.format === "heic"
        ? await encodeHeicPixels(req.rgba, req.width, req.height, req.quality)
        : await encodeAvifPixels(req.rgba, req.width, req.height, req.quality);
    const response: ExportCodecResponse = { id: req.id, ok: true, bytes };
    self.postMessage(response, [bytes.buffer]);
  } catch (error) {
    const response: ExportCodecResponse = {
      id: req.id,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
}

// WASM module instances are not guaranteed to be re-entrant. Chain
// requests so a thumbnail estimate and a full export cannot enter the
// same encoder concurrently after a quick Download click.
let queue = Promise.resolve();
self.addEventListener("message", (event: MessageEvent<ExportCodecRequest>) => {
  queue = queue.then(() => handle(event.data));
});
