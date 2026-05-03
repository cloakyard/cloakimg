// lanczos.worker.ts — Web-worker host for the Lanczos-3 resample.
//
// Receives a `Uint8ClampedArray` of source pixels (transferred without
// a copy), runs `lanczosResampleBuffer` off the main thread, and posts
// the resulting destination buffer back to the caller. The DOM-side
// hand-off (HTMLCanvasElement / ImageData) lives in lanczos.ts, since
// workers don't have access to those types.

import { lanczosResampleBuffer } from "./lanczos";

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

self.addEventListener("message", (e: MessageEvent<WorkerRequest>) => {
  const { id, srcData, sw, sh, dstW, dstH } = e.data;
  const dstData = lanczosResampleBuffer(srcData, sw, sh, dstW, dstH);
  const response: WorkerResponse = { id, dstData };
  // Transfer the destination buffer back so we don't pay a structured
  // clone for the (potentially large) result either.
  (self as unknown as Worker).postMessage(response, [dstData.buffer]);
});
