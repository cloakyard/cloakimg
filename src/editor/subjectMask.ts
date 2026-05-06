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

import { acquireCanvas, releaseCanvas } from "./doc";
import {
  type BgQuality,
  isModelCached,
  smartRemoveBackground,
  type SmartRemoveProgress,
} from "./tools/smartRemoveBg";

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
};

const listeners = new Set<(s: MaskState) => void>();

function setState(next: Partial<MaskState>) {
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
  ctx.imageSmoothingQuality = "high";
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

/** Drop the cached mask. Called by EditorContext when the doc swaps
 *  out (replaceWithFile, resetToOriginal) so the next session starts
 *  clean. `peekSubjectMask` also auto-invalidates on dimension drift,
 *  but explicit calls cover the cases where pixels change without
 *  dimensions changing (Reset, undo through a non-geometry edit). */
export function invalidateSubjectMask() {
  if (!cache) return;
  releaseCacheEntry(cache);
  cache = null;
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
  if (state.status === "needs-consent") {
    setState({ status: "idle", pendingQuality: null });
  }
}

/** User dismissed the consent dialog. Clear the pending state so the
 *  panel UI returns to its idle shape — the user can pick a different
 *  scope or quality and the dialog will reappear. */
export function denyMaskConsent() {
  if (state.status === "needs-consent") {
    setState({ status: "idle", pendingQuality: null });
  }
}

/** True iff the user (or a prior session) has already authorised
 *  downloading the model bytes. Used by callers that want to know
 *  whether `ensureSubjectMask` will prompt or just run. */
export function hasMaskConsent(): boolean {
  return consentGranted;
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
  if (inflight) return inflight;

  if (!consentGranted) {
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

  inflight = (async () => {
    try {
      const cut = await smartRemoveBackground(source, {
        quality,
        onProgress: (p) => setState({ progress: p }),
      });
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
      const msg = err instanceof Error ? err.message : String(err);
      setState({ status: "error", progress: null, error: msg });
      throw err;
    } finally {
      inflight = null;
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
