// family.ts — Capability family for MediaPipe BlazeFace face detection.
// Defines the (single, today) tier the user can download and the
// consent / status copy the generic dialog renders.
//
// We picked MediaPipe Tasks Web for face detection because the same
// SDK + WASM payload also covers Face Landmarker, Image Segmenter,
// Interactive Segmenter, Object Detector, and Pose Landmarker — every
// future tier we add reuses the cached WASM rather than shipping a
// second runtime.
//
// We use the FULL-RANGE BlazeFace model (~1 MB) rather than the
// short-range variant (~225 KB). Short-range is selfie-tuned: it
// expects the face to occupy ~25 %+ of the frame width. CloakIMG is a
// general photo editor — typical shots are full-body / group / street
// photos where each face is 5–15 % of the frame. Full-range handles
// faces from 0 to 5 m and reliably detects what short-range misses on
// these shots. Caught in production on a 24 MP full-body portrait that
// short-range silently returned zero faces for; full-range found the
// face on the same input. The 800 KB extra is a fair trade for "it
// works on the photos people actually edit."

import type { CapabilityFamily, CapabilityTier } from "../../capability/types";

/** Same-origin path the bundler serves the BlazeFace full-range
 *  `.tflite` from. The file lives in
 *  `public/models/face/blaze_face_full_range.tflite` (~1.04 MB,
 *  Apache-2.0, downloaded from Google's mediapipe-models bucket at
 *  build prep time). Same-origin keeps the privacy-first promise
 *  honest — model bytes don't pass through any third-party CDN. */
export const BLAZEFACE_MODEL_URL = "/models/face/blaze_face_full_range.tflite";

/** Pinned version of `@mediapipe/tasks-vision` whose WASM bundle the
 *  FilesetResolver loads. Pinning a version (rather than `latest`)
 *  makes the runtime API + WASM ABI deterministic across deploys —
 *  the family controls the URL, so an upgrade is a one-line change
 *  here plus a `pnpm add` of the matching version. */
export const TASKS_VISION_VERSION = "0.10.35";

/** Base URL the MediaPipe FilesetResolver fetches its WASM bundle
 *  from. Library code only — version-pinned for reproducibility, no
 *  user pixels cross this boundary. Mirrors how transformers.js loads
 *  ORT WASM today (`env.useWasmCache=false` in worker.ts). */
export const TASKS_VISION_WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

interface FaceTierRuntimeRef {
  /** Same-origin URL the worker fetches the model from. */
  modelUrl: string;
  /** Base URL of the MediaPipe Tasks WASM bundle. */
  wasmBaseUrl: string;
}

const STANDARD_TIER: CapabilityTier<FaceTierRuntimeRef> = {
  id: "standard",
  index: 0,
  label: "Standard",
  // ~1.04 MB; rounded to whole MB for the dialog copy. The bytes field
  // stays exact for the byte-count progress readout.
  mb: 1,
  bytes: 1_083_786,
  strength: "Detects every face in a photo, screenshot, or group shot — on this device.",
  tradeoff: "First-time use downloads ~1 MB of model bytes plus a one-off MediaPipe runtime.",
  recommended: true,
  runtimeRef: {
    modelUrl: BLAZEFACE_MODEL_URL,
    wasmBaseUrl: TASKS_VISION_WASM_BASE,
  },
};

/** Public family descriptor. The detect-face service constructs its
 *  CapabilityService<FaceBox[]> with this family — every consent
 *  prompt and progress card renders from the copy below. */
export const DETECT_FACE_FAMILY: CapabilityFamily<FaceTierRuntimeRef> = {
  id: "blazeface-full-range",
  kind: "detect-face",
  label: "MediaPipe BlazeFace",
  // Inference long-edge is informational here — MediaPipe handles its
  // own resize internally. Kept on the family for symmetry with the
  // segmentation surface, which the consent dialog inspects.
  inferenceLongEdge: 192,
  tiers: [STANDARD_TIER],
  consent: {
    title: "Download face detection",
    switchTitle: "About face detection",
    body: "Smart Auto-Anonymize uses an on-device face detector (MediaPipe BlazeFace, by Google) to find every face in a photo and redact each one individually. The model is ~1 MB and runs entirely in this browser — no image ever leaves your device.",
    switchBody:
      "The face detector is already on this device. Re-running detection costs nothing and the model never re-downloads.",
    privacy: [
      "Model + your image stay in this browser tab.",
      "One download — cached for future visits, even offline.",
      "No analytics, telemetry, or remote calls of any kind.",
    ],
    downloadVerb: "Download",
    useVerb: "Use",
  },
  status: {
    inProgressLabel: "Detecting faces…",
    connectingLabel: "Loading model…",
    readyMessage: "Faces detected.",
    pausedMessage: "Face detection paused.",
  },
};
