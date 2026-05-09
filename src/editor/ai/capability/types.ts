// types.ts — Generic AI capability primitives.
//
// One state-machine + one consent flow, parameterised by:
//   • TResult — the per-capability inference output (a cut canvas for
//     segmentation, a list of face boxes for detection, an OCR result,
//     a depth map, an inpainted bitmap, …).
//   • TTier — the tier-descriptor shape, opaque to the service layer
//     so each capability can carry whatever runtime-specific fields
//     its worker handler needs (HF repo + dtype today, a raw ONNX URL
//     tomorrow).
//
// Why this exists: the original segmentation service grew rich state-
// machine logic (consent, deny latch, in-flight dedup, abort, watchdog,
// generation counter, wait-for-resolution). Re-implementing that for
// each new capability would copy ~400 lines per pipeline and any bug
// fix would have to land 15× — exactly the trap the bgModels.ts header
// already warned about. The primitives in this file extract that logic
// once so a new capability is "register a tier family + provide a
// runner" rather than "fork the service from scratch."

import type { Layout } from "../../types";

/** All on-device AI pipeline kinds the editor knows about today. New
 *  capabilities add a string here AND register a worker handler under
 *  the same key — the worker dispatcher is keyed on this union so the
 *  type system catches an unregistered handler at compile time.
 *
 *  Scope note: OCR / document text extraction is intentionally absent.
 *  CloakIMG is positioned as a Photoshop / Lightroom alternative for
 *  photo work; document text flows live in the sibling product CloakPDF.
 *  Don't add an OCR kind here without a deliberate scope reset. */
export type CapabilityKind =
  // Segmentation — subject vs background. Drives Adjust scope, Filter
  // scope, Levels scope, HSL scope, Portrait blur, Remove BG, Smart
  // Crop / Anonymize / Watermark.
  | "segment"
  // Face detection — boxes (and, in a future tier, landmarks via
  // MediaPipe Face Landmarker). Drives Smart Auto-Anonymize "Faces"
  // and the future "blur faces in screenshots" action.
  | "detect-face"
  // Monocular depth estimation. Drives depth-aware portrait blur,
  // 3D parallax export, atmospheric haze.
  | "depth"
  // Inpainting / object removal (LaMa-class).
  | "inpaint"
  // Image super-resolution (Real-ESRGAN-class).
  | "upscale"
  // Adversarial perturbation for reverse-search defense.
  | "cloak-perturb"
  // Image captioning for alt-text generation.
  | "alt-text"
  // AI-generated-image detector (synthetic content classifier).
  | "ai-detect";

/** State-machine status. Identical surface to the legacy MaskStatus
 *  so existing consent UI can render either flavor. */
export type CapabilityStatus = "idle" | "loading" | "ready" | "error" | "needs-consent";

export interface CapabilityProgress {
  /** Phases the UI distinguishes:
   *    • download — model + tokenizer / preprocessor configs streaming
   *    • inference — the network actually running (no granular % from
   *      ONNX runtime, so the UI shows an indeterminate stripe)
   *    • decode — converting the result back to a canvas / box list /
   *      depth map / etc. */
  phase: "download" | "inference" | "decode";
  /** 0..1, monotonic within a phase. */
  ratio: number;
  /** Human-readable label the panel can show ("Loading model…",
   *  "Detecting faces…", "Reading text…"). */
  label: string;
  /** Bytes downloaded so far (download phase only). */
  bytesDownloaded?: number;
  /** Total bytes expected for the model files. */
  bytesTotal?: number;
}

/** Per-capability state. `result` is intentionally opaque — capabilities
 *  cache however they need (segment keeps a per-source-canvas + dim
 *  cache; face detect can keep a per-source-canvas list of boxes;
 *  OCR keeps a per-source line list). The service primitive doesn't
 *  reach inside it. */
export interface CapabilityState<TResult> {
  status: CapabilityStatus;
  progress: CapabilityProgress | null;
  error: string | null;
  /** Bumps every time the state changes — useful for components that
   *  want a stable identity-changes signal without setState plumbing. */
  version: number;
  /** True when the capability has ever produced a result this session.
   *  Lets UI distinguish "first run, model needs to download" (cold)
   *  from "we've done this before, inference will be fast" (warm). */
  warm: boolean;
  /** True when the requested model's bytes are already on disk. */
  modelCached: boolean;
  /** When status === "needs-consent", which tier id the user is being
   *  asked to download. Lets the dialog render the right MB / label. */
  pendingTierId: string | null;
  /** True after the user dismissed the consent dialog at least once
   *  this session. Auto-triggers from panel/scope effects then no-op
   *  so the dialog doesn't re-pop on every status change. Cleared by
   *  an explicit user action (resume / opt-in chip). */
  userDenied: boolean;
  /** Last successful inference result, if any. Capabilities that need
   *  more nuanced caching (e.g. per-source-canvas with stale-on-resize)
   *  ignore this and keep their own cache; simpler capabilities can
   *  use it directly. */
  result: TResult | null;
  /** Backend the most recent inference ran on. Surfaced in the panel
   *  read-out ("Running on WebGPU"). Null until first success. */
  device: "webgpu" | "wasm" | null;
}

/** Per-tier descriptor consumed by the consent dialog and the worker
 *  handler. UI surfaces read the friendly fields (label, mb, strength,
 *  tradeoff, etc.); the worker handler reads `runtimeRef` to learn
 *  which model file to load.
 *
 *  `runtimeRef` is opaque so each capability picks its own shape:
 *    • Transformers.js capabilities: { kind: "hf", repo, dtype }
 *    • MediaPipe Tasks capabilities: { modelUrl, wasmBaseUrl }
 *    • Future ONNX-bundled-with-app: { kind: "asset", path }
 *  The worker handler narrows on the discriminator. */
export interface CapabilityTier<TRuntimeRef = unknown> {
  /** Stable id used by the persisted preference and the cache probe.
   *  Decoupled from the underlying model so a future model swap doesn't
   *  invalidate users' saved tier preferences. */
  id: string;
  /** Numeric index into the family's tier array. Mirrors the toolState
   *  index so callers can patchTool without re-deriving the order. */
  index: number;
  /** User-facing tier name shown on radio rows + panel readout. */
  label: string;
  /** Approximate download size in MB. Real size resolves once the
   *  network responds; this is the pre-flight estimate so the dialog
   *  shows "0 / 84 MB" before the lib's first chunk arrives. */
  mb: number;
  /** Pre-computed `mb * 1024 * 1024`. Avoids re-multiplying at every
   *  consumer that wants bytes (e.g. DetectionProgressCard's
   *  expectedTotal, friendly stall copy). */
  bytes: number;
  /** Primary hint line — answers "why pick this tier?". */
  strength: string;
  /** Trade-off line — what the user gives up. Honest about cost. */
  tradeoff: string;
  /** When true, dialog tags the tier with a "Recommended" pill. */
  recommended?: boolean;
  /** When true, hidden on the small-screen mobile layout. Used for
   *  tiers whose download size is impractical for phone storage. */
  desktopAndTabletOnly?: boolean;
  /** Worker-handler-specific reference. Opaque to the service. */
  runtimeRef: TRuntimeRef;
}

/** Capability-family descriptor — one per pipeline. Holds the tier
 *  list and the consent + status copy. The result type is owned by
 *  the matching service instance, not the family — families are
 *  shared across UI surfaces that don't need to know the inference
 *  output shape. */
export interface CapabilityFamily<TRuntimeRef = unknown> {
  /** Internal id, used for analytics, persistence keys, and the worker
   *  handler key. */
  id: string;
  /** Worker-dispatcher kind (matches AiRequest.kind). */
  kind: CapabilityKind;
  /** Display label if a future settings panel surfaces a model
   *  picker. */
  label: string;
  /** Inference long-edge cap fed to the worker. Each model has its
   *  own intrinsic preprocessor input size; sending bigger pixels is
   *  wasted memory. */
  inferenceLongEdge: number;
  /** Ordered small → large. */
  tiers: readonly CapabilityTier<TRuntimeRef>[];
  /** Copy variants used by the generic consent dialog. Per-capability
   *  so the dialog reads as the right tool ("Download the AI face
   *  detector" vs "Download the AI subject model" vs "Download the
   *  text reader"). */
  consent: ConsentCopy;
  /** Localised status copy used by the generic progress card so each
   *  capability's progress text reads naturally ("Detecting faces…"
   *  vs "Detecting subject…" vs "Reading text…"). */
  status: StatusCopy;
}

export interface ConsentCopy {
  /** Title shown in the consent dialog header (first download). */
  title: string;
  /** Title shown when the user re-opens the picker to switch tiers. */
  switchTitle: string;
  /** Body paragraph above the tier picker. */
  body: string;
  /** Body paragraph in switch mode. */
  switchBody: string;
  /** Privacy bullets shown at the bottom of the dialog. */
  privacy: readonly string[];
  /** Verb used on the primary button when downloading ("Download"). */
  downloadVerb: string;
  /** Verb used on the primary button when the picked tier is already
   *  cached ("Use"). */
  useVerb: string;
}

export interface StatusCopy {
  /** Inline progress card label fallback ("Detecting subject…"). */
  inProgressLabel: string;
  /** Indeterminate-phase swap-in ("Connecting…" — used while the model
   *  is being fetched but no bytes have arrived yet). */
  connectingLabel: string;
  /** Ready chip default text. */
  readyMessage: string;
  /** Friendly "this is paused, opt back in" copy. */
  pausedMessage: string;
}

/** Per-capability stall-watchdog config. Some pipelines (segmentation
 *  on a 168 MB tier over flaky mobile) want a long timeout; lighter
 *  pipelines (a 330 KB face detector) can be much stricter. */
export interface StallConfig {
  /** ms without progress that counts as a stall. Default 30s. */
  timeoutMs: number;
  /** Friendly error message when the stall fires. Includes a
   *  recommendation to switch to a smaller tier when the family has
   *  one. */
  message: string;
}

/** Helper for filtering a tier list to what should be visible at the
 *  given layout. Mobile drops the `desktopAndTabletOnly` tiers. */
export function tiersForLayout<R>(
  tiers: readonly CapabilityTier<R>[],
  layout: Layout,
): CapabilityTier<R>[] {
  if (layout === "mobile") return tiers.filter((t) => !t.desktopAndTabletOnly);
  return [...tiers];
}

/** Lookup tier by stable id. Throws on miss because a missing tier is
 *  a registry-level bug — surfacing it as a real error in dev beats a
 *  silent fall-through to a "default" tier with the wrong copy. */
export function tierById<R>(tiers: readonly CapabilityTier<R>[], id: string): CapabilityTier<R> {
  const t = tiers.find((x) => x.id === id);
  if (!t) throw new Error(`capability: no tier registered for id "${id}"`);
  return t;
}

/** Lookup tier by numeric index. Falls back to the first tier on a
 *  miss (covers stale persistence after a future migration). */
export function tierByIndex<R>(
  tiers: readonly CapabilityTier<R>[],
  index: number,
): CapabilityTier<R> {
  return tiers[index] ?? tiers[0]!;
}

/** Translate stable id → numeric index (for toolState-style persistence). */
export function indexForTier<R>(tiers: readonly CapabilityTier<R>[], id: string): number {
  return tiers.findIndex((t) => t.id === id);
}
