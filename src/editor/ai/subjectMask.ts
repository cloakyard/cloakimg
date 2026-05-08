// subjectMask.ts — Central subject-mask service.
//
// One U²-Net inference per source image, shared across every tool
// that asks for it. Whoever triggers detection first pays the cost;
// everyone after that gets a synchronous cache hit. The service is a
// module-level singleton — components subscribe via
// `useSubjectMask()` to drive UI (progress, badges, status), and
// call `request()` to either start detection or grab the cached cut.
//
// Cache key is the source canvas *instance* plus its current
// width/height. Most edits mutate `doc.working` in place (same canvas
// reference, same dims), so the mask survives Adjust / Filter /
// Levels / HSL bakes — only crop / resize / perspective / replace-
// file cause a miss, which is the right behaviour because those are
// the operations that actually move the subject relative to the frame.
//
// The mask is stored as the *cut* canvas the lib produces (subject at
// original colour, background fully transparent). For scope-aware
// blending we just composite via canvas operations — no need to
// extract a single-channel alpha buffer.

import { acquireCanvas, releaseCanvas } from "../doc";
import { aiLog } from "./log";
import {
  AiAbortError,
  type BgQuality,
  isModelCached,
  smartRemoveBackground,
  type SmartRemoveProgress,
} from "./runtime/segment";

export type MaskStatus = "idle" | "loading" | "ready" | "error" | "needs-consent";

export interface MaskState {
  status: MaskStatus;
  progress: SmartRemoveProgress | null;
  error: string | null;
  /** Bumps every time the state changes — useful for components that
   *  want to subscribe via React without setState wrapper. */
  version: number;
  /** True when a detection has ever completed, even if the cache has
   *  since been invalidated. Lets the UI distinguish "first run, model
   *  needs to download" (cold) from "we've done this before, the
   *  detection will be fast" (warm). */
  warm: boolean;
  /** True when the requested model's bytes are already on disk from a
   *  prior session — detection will run instantly without a download
   *  prompt. Updated lazily by `probeModelCache()`. Distinct from
   *  `warm` (which only reflects this session). */
  modelCached: boolean;
  /** When status === "needs-consent", which quality the user is being
   *  asked to download. Lets the dialog render the right MB / label. */
  pendingQuality: BgQuality | null;
  /** True after the user has dismissed the consent dialog at least
   *  once this session. Auto-triggers from panel/scope effects then
   *  no-op so the dialog doesn't re-pop on every status change.
   *  Cleared by an explicit user action (clearMaskDeny — wired to
   *  the panels' "Detection paused — Enable" chip). */
  userDenied: boolean;
}

interface CacheEntry {
  source: HTMLCanvasElement;
  /** Dimensions captured at detection time. We compare against the
   *  source canvas's *current* width/height on every peek — when they
   *  differ (Crop / Resize / Perspective have mutated `doc.working` in
   *  place), the cache is implicitly stale and we drop it. */
  width: number;
  height: number;
  /** RGBA canvas: subject at original colour, bg fully transparent. */
  cut: HTMLCanvasElement;
  /** Downsampled mask copies, keyed by long-edge px. Built lazily by
   *  `peekMaskDownsample` and reused across preview frames so each
   *  per-rAF composite isn't scaling the full-res cut from scratch.
   *  On a 24 MP photo that drops the mask drawImage cost from
   *  ~10–15 ms to under 1 ms per frame. */
  downsamples: Map<number, HTMLCanvasElement>;
}

let cache: CacheEntry | null = null;
let inflight: Promise<HTMLCanvasElement> | null = null;
/** Source canvas the current `inflight` promise is detecting against.
 *  Lets us dedup concurrent calls *only* when they're for the same
 *  image — without it, an `ensureSubjectMask(docB.working)` call that
 *  arrives mid-detection on `docA.working` would silently return docA's
 *  mask. */
let inflightSource: HTMLCanvasElement | null = null;
/** Generation counter for in-flight detections. Bumped by
 *  `invalidateSubjectMask` (and at the start of every fresh detection)
 *  so a detection that started on doc A but finishes after a
 *  `replaceWithFile` to doc B can detect the supersession and skip
 *  writing its stale cut to the cache. */
let inflightGeneration = 0;
/** AbortController for the active detection. Wired through the AI
 *  worker so an explicit cancel actually terminates the inference
 *  thread (the only honest way to stop a running ONNX run). The
 *  controller is rebuilt per detection — aborting one cannot stomp
 *  on a fresh follow-up. */
let inflightAbort: AbortController | null = null;
/** Watchdog timer that aborts the detection if the download bytes
 *  counter doesn't advance for `STALL_TIMEOUT_MS`. Mid-tier mobile
 *  networks can leave a fetch hanging at e.g. 23 % indefinitely;
 *  without this, the dialog sits forever. Re-set on every progress
 *  event; cleared on settle, cancel, or invalidate. Module-scoped so
 *  the cancel / invalidate paths can clear it without threading a
 *  closure through. */
let stallTimer: number | null = null;
const STALL_TIMEOUT_MS = 30000;

function clearStallTimer() {
  if (stallTimer !== null) {
    window.clearTimeout(stallTimer);
    stallTimer = null;
  }
}
/** Per-session consent flag. The first time a tool needs the model
 *  (download not already on disk), the UI flips status to
 *  "needs-consent" and the user has to confirm. After they confirm
 *  once we don't ask again until the page reloads — switching tools
 *  shouldn't require re-consenting. Cached-on-disk models implicitly
 *  count as consented (the user chose them in a prior session). */
let consentGranted = false;
let state: MaskState = {
  status: "idle",
  progress: null,
  error: null,
  version: 0,
  warm: false,
  modelCached: false,
  pendingQuality: null,
  userDenied: false,
};

const listeners = new Set<(s: MaskState) => void>();

function setState(next: Partial<MaskState>) {
  // Tracing every state machine transition (idle → needs-consent →
  // loading → ready, plus error / userDenied flips) is invaluable when
  // a user reports "tap doesn't do anything". Cheap — only fires when
  // status actually changes — and gated behind aiLog's debug switch.
  if (next.status !== undefined && next.status !== state.status) {
    aiLog.debug("subjectMask", `status: ${state.status} → ${next.status}`, {
      hasProgress: !!next.progress,
      hasError: !!next.error,
      pendingQuality: next.pendingQuality ?? state.pendingQuality,
    });
  }
  state = { ...state, ...next, version: state.version + 1 };
  for (const l of listeners) l(state);
}

export function getMaskState(): MaskState {
  return state;
}

export function subscribeMaskState(l: (s: MaskState) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Synchronous read. Returns null when no fresh mask matches the
 *  current source canvas. A dimension change invalidates the cache
 *  in place (Crop / Resize / Perspective mutate `doc.working` width
 *  + height directly, so source instance equality alone isn't
 *  enough). */
export function peekSubjectMask(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (!cache) return null;
  if (cache.source !== source) return null;
  if (cache.width !== source.width || cache.height !== source.height) {
    // Dimensions drifted — drop the stale entry so memory bounds stay
    // honest, and report idle so any subscribed UI clears its
    // "ready" indicator.
    releaseCacheEntry(cache);
    cache = null;
    setState({ status: "idle", progress: null, error: null });
    return null;
  }
  return cache.cut;
}

/** Same identity check as `peekSubjectMask` but returns a downsampled
 *  copy at the requested long-edge cap. Used by preview hooks where
 *  the baked surface is at most ~1440 px on the long edge — drawing
 *  a pre-sized mask is dramatically cheaper than asking the browser
 *  to scale the full-res cut on every preview rAF.
 *
 *  Returns null when there's no fresh mask. When the cut is already
 *  smaller than `longEdge`, returns the cut directly (no point
 *  duplicating a small bitmap). */
export function peekMaskDownsample(
  source: HTMLCanvasElement,
  longEdge: number,
): HTMLCanvasElement | null {
  const cut = peekSubjectMask(source);
  if (!cut || !cache) return null;
  const long = Math.max(cut.width, cut.height);
  if (long <= longEdge) return cut;
  const cached = cache.downsamples.get(longEdge);
  if (cached) return cached;
  const ratio = longEdge / long;
  const w = Math.max(1, Math.round(cut.width * ratio));
  const h = Math.max(1, Math.round(cut.height * ratio));
  const ds = acquireCanvas(w, h);
  const ctx = ds.getContext("2d");
  if (!ctx) return cut;
  // "medium" instead of "high": the downsample is an alpha mask used
  // by `applyMaskScope` at the preview surface (≤1440 px on the long
  // edge). The visual difference between medium and high smoothing
  // on a binary-ish mask isn't perceptible at that scale, but
  // medium runs ~10–30 % faster on mobile drawImage scaling — a real
  // win when this is rebuilt per detection.
  ctx.imageSmoothingQuality = "medium";
  ctx.drawImage(cut, 0, 0, w, h);
  cache.downsamples.set(longEdge, ds);
  return ds;
}

function releaseCacheEntry(entry: CacheEntry) {
  releaseCanvas(entry.cut);
  for (const ds of entry.downsamples.values()) {
    if (ds !== entry.cut) releaseCanvas(ds);
  }
  entry.downsamples.clear();
}

/** Cancel an in-flight detection. Aborts the AI worker (which
 *  terminates the inference thread — there's no graceful interrupt
 *  for ONNX) and resets state to idle so the panels' inline progress
 *  cards clear. No-op when nothing is in flight. */
export function cancelMaskDetection() {
  if (!inflight || !inflightAbort) return;
  inflightAbort.abort();
  inflightGeneration += 1;
  inflight = null;
  inflightSource = null;
  inflightAbort = null;
  clearStallTimer();
  setState({ status: "idle", progress: null, error: null });
}

/** Drop the cached mask. Called by EditorContext when the doc swaps
 *  out (replaceWithFile, resetToOriginal) so the next session starts
 *  clean. `peekSubjectMask` also auto-invalidates on dimension drift,
 *  but explicit calls cover the cases where pixels change without
 *  dimensions changing (Reset, undo through a non-geometry edit).
 *
 *  Also bumps the inflight generation so any detection that started
 *  before this call and is still running won't write its stale cut
 *  back into the cache when it eventually resolves. */
export function invalidateSubjectMask() {
  const hadCache = !!cache;
  const hadInflight = !!inflight;
  if (cache) {
    releaseCacheEntry(cache);
    cache = null;
  }
  if (inflight) {
    // Bump generation so any landing result is discarded as
    // superseded. We DO NOT abort the inflight signal here —
    // aborting cascades through the runtime to a `worker.terminate()`,
    // which kills the warm pipeline cache and forces transformers.js
    // to reload the ONNX model on the next detection (~100–300 ms +
    // the visible ORT warning logs). The inflight detection's
    // bytes were already paid for; let it finish in the background
    // and toss the result. User-initiated cancellation routes
    // through `cancelMaskDetection` and DOES terminate.
    inflightGeneration += 1;
    inflight = null;
    inflightSource = null;
    inflightAbort = null;
    // The watchdog was scoped to the now-orphaned generation. Clear
    // it so a stalled-out timer doesn't fire after invalidate and
    // stomp the next detection's "loading" with a phantom error.
    clearStallTimer();
  }
  if (!hadCache && !hadInflight) return;
  // Don't reset `warm` — the model's still loaded in memory, future
  // detections will be fast.
  setState({ status: "idle", progress: null, error: null });
}

/** Probe the browser's CacheStorage for the requested model and
 *  publish the answer on `state.modelCached`. Cheap (low-thousands of
 *  cache keys at worst); the UI calls this when it needs an honest
 *  "the bytes are already on disk" cue (warm vs cold copy, deciding
 *  whether to skip the consent dialog). Idempotent — repeat calls
 *  just refresh the bit. */
export async function probeModelCache(quality: BgQuality): Promise<boolean> {
  const cached = await isModelCached(quality);
  if (cached) {
    // A cached model implies the user already accepted the download
    // some prior session. Suppress the dialog from now on so a
    // page-reload doesn't re-prompt for an asset they already have.
    consentGranted = true;
  }
  if (state.modelCached !== cached) setState({ modelCached: cached });
  return cached;
}

/** User has accepted the download via the consent dialog. The next
 *  call to `ensureSubjectMask` proceeds straight to the lib. */
export function grantMaskConsent() {
  consentGranted = true;
  if (state.status === "needs-consent" || state.userDenied) {
    setState({ status: "idle", pendingQuality: null, userDenied: false });
  }
}

/** User dismissed the consent dialog. Latch `userDenied` so panel
 *  auto-trigger effects don't immediately re-pop the dialog the next
 *  time their `state.version`-driven dep array fires. The flag stays
 *  set until `clearMaskDeny()` is called from an explicit user action
 *  (e.g. tapping a "Detection paused — Enable" chip). */
export function denyMaskConsent() {
  if (state.status === "needs-consent") {
    setState({ status: "idle", pendingQuality: null, userDenied: true });
  } else if (!state.userDenied) {
    setState({ userDenied: true });
  }
}

/** Reset the deny latch. Called from explicit user actions that
 *  re-opt-into the AI flow ("Enable AI" chip, switching scope from
 *  Whole to non-Whole after a deny, retrying Smart Crop / Smart
 *  Anonymize / Watermark Smart Place). The next `ensureSubjectMask`
 *  call after this re-pops the consent dialog. */
export function clearMaskDeny() {
  if (state.userDenied) setState({ userDenied: false });
}

/** True iff the user (or a prior session) has already authorised
 *  downloading the model bytes. Used by callers that want to know
 *  whether `ensureSubjectMask` will prompt or just run. */
export function hasMaskConsent(): boolean {
  return consentGranted;
}

/** Force the consent / model-picker dialog open from a UI affordance
 *  ("Change model size" link in the Remove BG panel). Re-uses the
 *  existing `needs-consent` status so MaskConsentHost renders the
 *  same picker dialog — no second component to maintain.
 *
 *  Distinguished from a fresh first-time consent by the host: when
 *  `hasMaskConsent()` is already true, the dialog adapts its copy
 *  ("Switch model size" instead of "Download the on-device AI model")
 *  and labels the action button "Use {N} MB" instead of "Download".
 *
 *  Clears the `userDenied` latch as a side-effect — opening the
 *  picker by hand is itself the explicit re-opt-in. */
export function requestModelPicker(currentQuality: BgQuality): void {
  if (state.userDenied) setState({ userDenied: false });
  setState({
    status: "needs-consent",
    progress: null,
    error: null,
    pendingQuality: currentQuality,
  });
}

/** Lazily detect (or return cached). Concurrent callers share a
 *  single in-flight promise so kicking off two scoped tools in quick
 *  succession only runs one inference.
 *
 *  Two-stage gate:
 *    1. If we have no in-memory cache and no consent, surface
 *       `needs-consent` and reject — the UI's MaskOptInDialog will
 *       call `grantMaskConsent` and the caller can retry.
 *    2. Otherwise run the lib through `smartRemoveBackground`.
 *
 *  Already-cached-on-disk models implicitly count as consented — we
 *  don't re-prompt for bytes the user agreed to last time. */
export async function ensureSubjectMask(
  source: HTMLCanvasElement,
  quality: BgQuality = "small",
): Promise<HTMLCanvasElement> {
  const existing = peekSubjectMask(source);
  if (existing) return existing;
  // Only dedup against the inflight promise when it's detecting the
  // *same* source. Otherwise (e.g. user replaceWithFile mid-detection)
  // returning the inflight promise would silently hand the caller a
  // mask for the wrong image.
  if (inflight && inflightSource === source) return inflight;

  if (!consentGranted) {
    // If the user already denied this session, throw silently without
    // re-flipping state — that prevents the auto-trigger loop where
    // dismissing the dialog instantly re-pops it via the panels'
    // useEffect deps. The state-version is unchanged, so subscribers
    // don't re-run their effects from this branch.
    if (state.userDenied) {
      throw new MaskConsentError(quality);
    }
    // Probe the on-disk cache one more time before blocking — a model
    // already downloaded in a prior session counts as implicit
    // consent. This is the *transparent* opt-in: we ask the user
    // exactly once across sessions, then never again as long as the
    // browser keeps the bytes.
    const cached = await isModelCached(quality);
    if (cached) {
      consentGranted = true;
      if (!state.modelCached) setState({ modelCached: true });
    } else {
      setState({
        status: "needs-consent",
        progress: null,
        error: null,
        pendingQuality: quality,
      });
      throw new MaskConsentError(quality);
    }
  }

  setState({
    status: "loading",
    progress: { phase: "download", ratio: 0, label: "Preparing…" },
    error: null,
    pendingQuality: null,
  });

  // Capture the generation this detection belongs to. If
  // `invalidateSubjectMask` (or another fresh detection) bumps the
  // counter while we're awaiting, we discard our result on completion
  // — the caller has already moved on to a different doc/state and
  // wiring our stale cut into the cache would cause the next
  // peekSubjectMask to return geometry from the wrong image.
  inflightGeneration += 1;
  const myGeneration = inflightGeneration;
  inflightSource = source;
  // Fresh AbortController per detection. Cancelling one mid-flight
  // doesn't affect a later detection that the user kicks off after
  // hitting Cancel.
  inflightAbort = new AbortController();
  const myAbort = inflightAbort;
  // Watchdog: surface a stall after STALL_TIMEOUT_MS without progress.
  // Slow networks can leave the model fetch hanging mid-download (23 %
  // forever) without ever erroring on the lib's side; the watchdog
  // converts that indefinite wait into a user-visible "stalled" error
  // with the standard Try Again affordance.
  const armStallTimer = () => {
    if (stallTimer !== null) window.clearTimeout(stallTimer);
    stallTimer = window.setTimeout(() => {
      // Only stall the *current* detection. A respawn that started
      // after our timer was queued would otherwise inherit our abort.
      if (myGeneration !== inflightGeneration) return;
      aiLog.warn("subjectMask", "detection stalled — no progress for STALL_TIMEOUT_MS", {
        quality,
        source: `${source.width}x${source.height}`,
        timeoutMs: STALL_TIMEOUT_MS,
      });
      // Set state explicitly BEFORE aborting so the catch below
      // doesn't overwrite the friendly stall copy with a generic
      // AbortError message. The abort still tears down the worker
      // (the only honest way to stop the lib's fetch).
      setState({
        status: "error",
        progress: null,
        error:
          "Download stalled. This is usually a slow connection — try again, or pick the Fast (~42 MB) tier from Change.",
      });
      myAbort.abort();
    }, STALL_TIMEOUT_MS);
  };
  armStallTimer();
  inflight = (async () => {
    try {
      const cut = await smartRemoveBackground(source, {
        quality,
        signal: myAbort.signal,
        onProgress: (p) => {
          // Don't push progress updates for a superseded detection —
          // the UI may have already returned to idle for a new doc and
          // a late "Detecting subject…" tick would re-flip status.
          if (myGeneration === inflightGeneration) {
            setState({ progress: p });
            // Re-arm the stall watchdog on every progress tick. A
            // genuinely-slow-but-progressing download keeps refreshing
            // the timer and never trips the stall path.
            armStallTimer();
          }
        },
      });
      if (myGeneration !== inflightGeneration) {
        // Detection raced with a doc swap / invalidate. Drop the cut
        // and bail without touching state — the new generation owns
        // the UI now.
        releaseCanvas(cut);
        throw new Error("Subject detection superseded.");
      }
      // Validate that the model actually found a subject. The lib
      // happily returns a fully-transparent cut when there's no
      // recognisable subject (e.g. a landscape, a flat-colour
      // backdrop). Without this check the service would flip to
      // "ready" and every scope-aware tool would silently apply
      // edits to an empty region — preview shows the original, the
      // user thinks "preview is broken". Fail fast with a clear
      // error instead.
      if (!hasOpaqueContent(cut)) {
        releaseCanvas(cut);
        const msg =
          "No subject detected. Try a photo with a clearer foreground (people, animals, products).";
        aiLog.warn("subjectMask", "empty mask returned by model", {
          quality,
          source: `${source.width}x${source.height}`,
        });
        setState({ status: "error", progress: null, error: msg });
        throw new Error(msg);
      }
      // Drop any prior cache (dimensions changed, or simply a stale
      // cut from before the user crop/resized).
      if (cache) releaseCacheEntry(cache);
      cache = {
        source,
        width: source.width,
        height: source.height,
        cut,
        downsamples: new Map(),
      };
      setState({
        status: "ready",
        progress: null,
        error: null,
        warm: true,
        modelCached: true,
      });
      return cut;
    } catch (err) {
      // Superseded errors are silent — they're a cooperative signal
      // from our own generation guard, not a user-visible failure.
      if (myGeneration !== inflightGeneration) {
        aiLog.debug("subjectMask", "detection superseded by newer request", {
          myGeneration,
          currentGeneration: inflightGeneration,
        });
        throw err;
      }
      // User-initiated cancel: drop back to idle without surfacing an
      // error card. cancelMaskDetection() flips status itself, so all
      // we have to do here is rethrow without touching state.
      if (err instanceof AiAbortError) {
        aiLog.debug("subjectMask", "detection cancelled by user");
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      aiLog.error("subjectMask", "detection failed", err, {
        quality,
        source: `${source.width}x${source.height}`,
        priorStatus: state.status,
      });
      // Don't double-write state for the "no subject" branch — that
      // branch already set its own user-friendly error.
      if (state.status !== "error") {
        setState({ status: "error", progress: null, error: msg });
      }
      throw err;
    } finally {
      // Only clear the inflight slot if it's still ours. A newer
      // detection may have already taken over the variables.
      if (myGeneration === inflightGeneration) {
        inflight = null;
        inflightSource = null;
        inflightAbort = null;
        // Stop the watchdog. Leaving it running would let a stale
        // timer fire after a successful detection and stomp the
        // "ready" state with a phantom "Download stalled" error.
        clearStallTimer();
      }
    }
  })();

  return inflight;
}

/** Thrown by `ensureSubjectMask` when the user hasn't yet authorised
 *  downloading the model. Callers can detect this specifically (vs a
 *  detection failure) and stay quiet — the consent dialog renders via
 *  the mask-state subscription, not a thrown-error toast. */
export class MaskConsentError extends Error {
  readonly quality: BgQuality;
  constructor(quality: BgQuality) {
    super("Subject detection paused — user consent required.");
    this.name = "MaskConsentError";
    this.quality = quality;
  }
}

/** Wait until the central mask service settles, given an outstanding
 *  consent request. Resolves with the cached cut once detection
 *  completes for `source`; rejects with `MaskConsentError` if the
 *  user dismisses the consent dialog instead, or with the underlying
 *  error if detection itself fails.
 *
 *  Used by `useSubjectMask().requestExplicit()` so a smart-action
 *  click (Smart Crop, Smart Anonymize, Watermark Smart Place,
 *  Remove BG Apply) can `await` through the entire consent + download
 *  + inference flow rather than throwing as soon as the gate fires.
 *  Without this, the user would have to tap their button a second
 *  time after accepting the dialog. */
export function waitForMaskResolution(
  source: HTMLCanvasElement,
  quality: BgQuality,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      action();
    };
    const check = (s: MaskState) => {
      if (s.status === "ready") {
        const mask = peekSubjectMask(source);
        if (mask) {
          finish(() => resolve(mask));
        } else {
          // Status flipped to "ready" but the cache no longer maps to
          // *our* source — typically a dimension drift or a doc swap
          // raced with the detection. Without this branch the listener
          // would no-op and the smart-action's await would hang
          // forever. Bail as a consent error so the caller's catch
          // (CropTool / RedactPanel / etc.) quietly backs out.
          finish(() => reject(new MaskConsentError(quality)));
        }
        return;
      }
      if (s.status === "error") {
        finish(() => reject(new Error(s.error ?? "Detection failed")));
        return;
      }
      if (s.status === "idle") {
        // Anything that lands at idle without a "ready" along the way
        // (deny, replaceWithFile, resetToOriginal, dimension drift)
        // means our wait won't resolve — bail with the consent error
        // so the smart-action's catch can quietly back out.
        finish(() => reject(new MaskConsentError(quality)));
      }
    };
    const unsubscribe = subscribeMaskState(check);
    // Cover the race where the listener subscribes after the state
    // has already moved past needs-consent — apply the current state
    // synchronously before waiting on transitions.
    check(state);
  });
}

/** Cheap "did the model actually find anything?" probe. The lib
 *  occasionally returns an entirely transparent cut on photos with
 *  no recognisable subject (open landscapes, flat backdrops). We
 *  used to accept that as success and the scoped tools would then
 *  composite against an empty mask — preview reads as "nothing
 *  changed".
 *
 *  We downsample to a 128 px proxy first to bound the `getImageData`
 *  allocation; any opaque pixel above the alpha threshold counts as
 *  "subject present". The proxy also smooths over the case where
 *  detection produced a tiny one-pixel sliver — those wouldn't
 *  produce a usable scope mask anyway. */
const PROBE_LONG_EDGE = 128;
const PROBE_ALPHA_THRESHOLD = 32;

function hasOpaqueContent(cut: HTMLCanvasElement): boolean {
  const long = Math.max(cut.width, cut.height);
  // Proxy down to 128 px on the long edge before getImageData — on a
  // 24 MP cut this drops the allocation from ~96 MB to ~64 KB and
  // the scan from ~200 ms to <2 ms.
  const ratio = Math.min(1, PROBE_LONG_EDGE / long);
  const w = Math.max(1, Math.round(cut.width * ratio));
  const h = Math.max(1, Math.round(cut.height * ratio));
  const proxy = ratio < 1 ? acquireCanvas(w, h) : cut;
  if (proxy !== cut) {
    const pctx = proxy.getContext("2d");
    if (!pctx) {
      releaseCanvas(proxy);
      return true; // can't probe → assume valid; the tool layer will surface its own issues
    }
    pctx.imageSmoothingQuality = "low";
    pctx.drawImage(cut, 0, 0, w, h);
  }
  const ctx = proxy.getContext("2d");
  if (!ctx) {
    if (proxy !== cut) releaseCanvas(proxy);
    return true;
  }
  const data = ctx.getImageData(0, 0, w, h).data;
  let found = false;
  for (let i = 3; i < data.length; i += 4) {
    if ((data[i] ?? 0) > PROBE_ALPHA_THRESHOLD) {
      found = true;
      break;
    }
  }
  if (proxy !== cut) releaseCanvas(proxy);
  return found;
}

/** Axis-aligned subject bounding box in image-space pixels. */
export interface SubjectBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Compute the axis-aligned bbox of the opaque pixels in a mask
 *  canvas, plus optional fractional padding (`0.05` = 5 % of each
 *  side, clamped inside the image). Used by the Smart Crop and Smart
 *  Watermark actions to plant their rect / anchor relative to the
 *  detected subject without requiring the user to drag.
 *
 *  Sampling stride scales with the image so 24 MP photos don't pay
 *  for a full per-pixel walk. Returns null when the mask has no
 *  opaque pixels (detection found nothing). */
export function getSubjectBBox(mask: HTMLCanvasElement, padding = 0.05): SubjectBBox | null {
  const ctx = mask.getContext("2d");
  if (!ctx) return null;
  const w = mask.width;
  const h = mask.height;
  if (w <= 0 || h <= 0) return null;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  // Stride keeps the cost ~constant across image sizes (1024² samples
  // max). The mask is binary-ish (subject opaque, bg transparent) so
  // a coarse stride still finds the bbox accurately within ~1 % of the
  // true edge — well under the padding we're going to add anyway.
  const stride = Math.max(1, Math.round(Math.max(w, h) / 1024));
  for (let y = 0; y < h; y += stride) {
    const rowBase = y * w;
    for (let x = 0; x < w; x += stride) {
      const a = d[(rowBase + x) * 4 + 3] ?? 0;
      if (a > 32) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const padW = Math.round((maxX - minX) * padding);
  const padH = Math.round((maxY - minY) * padding);
  const x = Math.max(0, minX - padW);
  const y = Math.max(0, minY - padH);
  const x2 = Math.min(w, maxX + padW + 1);
  const y2 = Math.min(h, maxY + padH + 1);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** Score how much subject sits inside an axis-aligned region of the
 *  mask. Returns the average alpha (0..255) — lower = emptier. Used
 *  by the Smart Watermark placement to pick the corner that won't
 *  cover a face. */
export function regionCoverage(mask: HTMLCanvasElement, region: SubjectBBox): number {
  const ctx = mask.getContext("2d");
  if (!ctx) return 0;
  const w = Math.max(1, Math.round(region.w));
  const h = Math.max(1, Math.round(region.h));
  const x = Math.max(0, Math.min(mask.width - w, Math.round(region.x)));
  const y = Math.max(0, Math.min(mask.height - h, Math.round(region.y)));
  const data = ctx.getImageData(x, y, w, h).data;
  // Sample every 4th pixel — accurate enough for "which third of the
  // image is busiest" and dramatically faster on big masks.
  let sum = 0;
  let n = 0;
  for (let i = 3; i < data.length; i += 16) {
    sum += data[i] ?? 0;
    n += 1;
  }
  return n > 0 ? sum / n : 0;
}

/** Mask scope: 0 whole image (no compositing), 1 subject only, 2
 *  background only. The numeric values match the toolState segment
 *  indices so they can be passed straight through. */
export type MaskScope = 0 | 1 | 2;

/** Composite `baked` over `original` using `mask`. Returns a fresh
 *  pooled canvas matching the baked dimensions. Caller is responsible
 *  for `releaseCanvas` once the result has been read.
 *
 *  When `scope` is 0 returns `baked` unchanged (still the caller's
 *  canvas — caller already owns its lifecycle).
 *
 *  Mask resolution doesn't have to match — the browser scales it
 *  during the composite. We deliberately don't pre-resize because
 *  preview baked surfaces are tiny (≤1440 px on the long edge) and a
 *  scaled drawImage costs <2 ms. */
export function applyMaskScope(
  original: HTMLCanvasElement,
  baked: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  scope: MaskScope,
): HTMLCanvasElement {
  if (scope === 0) return baked;
  if (original.width !== baked.width || original.height !== baked.height) {
    // Defensive: scope blending only makes sense at matched dimensions.
    return baked;
  }
  const out = acquireCanvas(baked.width, baked.height);
  const ctx = out.getContext("2d");
  if (!ctx) return baked;

  if (scope === 1) {
    // Subject scope: keep baked where mask is opaque, original elsewhere.
    ctx.drawImage(baked, 0, 0);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0, baked.width, baked.height);
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(original, 0, 0);
  } else {
    // Background scope: keep baked where mask is transparent, original
    // (subject pixels) elsewhere.
    ctx.drawImage(baked, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(mask, 0, 0, baked.width, baked.height);
    ctx.globalCompositeOperation = "destination-over";
    ctx.drawImage(original, 0, 0);
  }
  ctx.globalCompositeOperation = "source-over";
  return out;
}

/** Scope-aware finishing pass shared by every panel that bakes
 *  whole-image then composites against the subject mask:
 *  Adjust · Filter · HSL · Levels. The four panels used to repeat
 *  this 11-line block verbatim, with subtly different catch
 *  comments — a future scoped tool was destined to copy the wrong
 *  variant. The function takes ownership of `baked` (releases it
 *  back to the canvas pool when a scoped composite replaces it)
 *  and returns whichever canvas now holds the pixels the caller
 *  should commit. Caller is still responsible for `releaseCanvas`
 *  on the *returned* canvas after `copyInto(doc.working, …)`.
 *
 *  Whole scope (0) is a no-op — return `baked` untouched. Subject /
 *  background scopes try to fetch the mask via the existing peek →
 *  request fallback; on detection failure we degrade to whole-image
 *  rather than dropping the user's edit on the floor (matches the
 *  contract every panel had before this was extracted). */
export async function applyScopedBake(
  baked: HTMLCanvasElement,
  original: HTMLCanvasElement,
  scope: MaskScope,
  subjectMask: { peek: () => HTMLCanvasElement | null; request: () => Promise<HTMLCanvasElement> },
): Promise<HTMLCanvasElement> {
  if (scope === 0) return baked;
  let mask: HTMLCanvasElement | null = null;
  try {
    mask = subjectMask.peek() ?? (await subjectMask.request());
  } catch {
    // Fall through to whole-image bake.
    return baked;
  }
  const scoped = applyMaskScope(original, baked, mask, scope);
  if (scoped !== baked) releaseCanvas(baked);
  return scoped;
}
