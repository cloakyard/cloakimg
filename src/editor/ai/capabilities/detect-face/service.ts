// service.ts — Face-detection service. Thin facade over the generic
// CapabilityService primitive that:
//   • Owns the BlazeFace family (one tier today).
//   • Probes "has the user accepted face detection in any prior session?"
//     via a localStorage marker — same-origin assets don't have a
//     useful CacheStorage signal, so the marker stands in for "implicit
//     consent on subsequent visits".
//   • Wraps `runAi({kind: "detect-face", ...})` as the runner the
//     service hands the worker.
//
// Public API mirrors the segmentation surface so panels read the same
// way for every AI capability:
//   • `ensureFaceDetections(source)` — kick off (or grab cached);
//     throws CapabilityConsentError when consent is needed.
//   • `peekFaceDetections(source)` — sync read; null when not ready.
//   • `subscribeFaceState(listener)` / `getFaceState()` — UI bindings.
//   • Plus the lifecycle controls the hook surfaces (cancel, invalidate,
//     grant/denyConsent, requestTierPicker).

import { CapabilityService, type RunnerArgs } from "../../capability/service";
import type { CapabilityState } from "../../capability/types";
import type { FaceBox } from "../../runtime/types";
import { BLAZEFACE_MODEL_URL, DETECT_FACE_FAMILY, TASKS_VISION_WASM_BASE } from "./family";
import { runFaceDetect } from "./runner";

/** Storage key for the per-session "user has consented to face
 *  detection" marker. Persisted across sessions so the consent dialog
 *  doesn't re-pop on every reload after the first accept — same UX
 *  as the segment family's HF cache probe. */
const CONSENT_KEY = "cloakimg:detect-face:consented";

function isFaceConsented(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    // Private mode quotas / cross-site iframe restrictions: treat as
    // "not consented" so the user gets the dialog. They've still got
    // the option to accept; we just can't remember next time.
    return false;
  }
}

function markFaceConsented(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(CONSENT_KEY, "1");
  } catch {
    // Best-effort — see above.
  }
}

/** Drop the consented marker. Useful for QA / a future "reset AI
 *  permissions" affordance. Not surfaced today. */
export function clearFaceConsent(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Best-effort.
  }
}

const service = new CapabilityService<FaceBox[]>({
  family: DETECT_FACE_FAMILY,
  // Same-origin asset: cache check is implicit via localStorage. Once
  // the user accepts the consent dialog we mark the flag and treat
  // future calls as already-cached so the dialog stays away. If the
  // user clears site data, the flag goes too and the dialog re-pops
  // on the next call — matches the segment family's behaviour after
  // a CacheStorage clear.
  isTierCached: async () => isFaceConsented(),
  // First face detection cold-start includes the MediaPipe WASM
  // download (one-off) plus the .tflite. 30 s matches segmentation —
  // tight enough to surface a hung CDN, loose enough to ride out a
  // slow 3G connection on the first run.
  stall: {
    timeoutMs: 30_000,
    message:
      "Face detection didn't respond. Reload the page and try again — your image stayed on this device.",
  },
});

export function getFaceState(): CapabilityState<FaceBox[]> {
  return service.getState();
}

export function subscribeFaceState(listener: (s: CapabilityState<FaceBox[]>) => void): () => void {
  return service.subscribe(listener);
}

export function peekFaceDetections(source: HTMLCanvasElement): FaceBox[] | null {
  return service.peek(source);
}

export function cancelFaceDetection(): void {
  service.cancel();
}

export function invalidateFaceDetection(): void {
  service.invalidate();
}

export function grantFaceConsent(): void {
  service.grantConsent();
  markFaceConsented();
}

export function denyFaceConsent(): void {
  service.denyConsent();
}

export function clearFaceDeny(): void {
  service.clearDeny();
}

export function hasFaceConsent(): boolean {
  return service.hasConsent() || isFaceConsented();
}

export function requestFaceTierPicker(): void {
  service.requestTierPicker(DETECT_FACE_FAMILY.tiers[0]!.id);
}

export async function probeFaceConsent(): Promise<boolean> {
  return service.probeCacheForTier(DETECT_FACE_FAMILY.tiers[0]!);
}

/** Ensure face detections for `source` exist in cache, running
 *  inference if they don't. Concurrent calls for the same source
 *  share one in-flight promise. May reject with CapabilityConsentError
 *  the first time — caller should let the host dialog handle that
 *  flow rather than treating it as a failure. */
export async function ensureFaceDetections(source: HTMLCanvasElement): Promise<FaceBox[]> {
  const tier = DETECT_FACE_FAMILY.tiers[0]!;
  return service.run(source, tier, faceDetectRunner);
}

/** Wait for an in-flight or pending consent flow to settle — used by
 *  smart actions that want to await across the consent dialog without
 *  re-tapping the user. */
export function waitForFaceResolution(source: HTMLCanvasElement): Promise<FaceBox[]> {
  const tier = DETECT_FACE_FAMILY.tiers[0]!;
  return service.waitForResolution(source, tier.id);
}

// —————————————— Runner ——————————————
//
// MediaPipe Tasks Web runs on the main thread (see runner.ts header
// for the why). The runner exposes the same shape as the worker-bound
// segment runner — `source` + `signal` + `onProgress` — so the
// CapabilityService primitive talks to it identically.

async function faceDetectRunner({ source, signal, onProgress }: RunnerArgs): Promise<FaceBox[]> {
  const { faces } = await runFaceDetect({
    source,
    modelUrl: BLAZEFACE_MODEL_URL,
    wasmBaseUrl: TASKS_VISION_WASM_BASE,
    device: "auto",
    signal,
    onProgress,
  });
  // First successful detection counts as implicit consent acceptance
  // — the user kicked off the operation and now has bytes on disk.
  markFaceConsented();
  return faces;
}
