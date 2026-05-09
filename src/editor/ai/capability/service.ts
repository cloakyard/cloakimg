// service.ts — Generic AI capability service.
//
// One state machine, one consent flow, one in-flight tracker, one
// watchdog — parameterised by the capability's result type. Drop-in
// replacement for hand-rolling the state machine inside every new
// pipeline (subjectMask.ts, smartFaces.ts, smartOcr.ts, …).
//
// Built by extracting the segmentation service's logic verbatim —
// every transition, every guard, every comment — and turning the
// result-shape into a generic. The behaviour MUST stay identical so
// the existing segmentation flow keeps working bit-for-bit when it
// migrates onto this primitive.
//
// What the service owns:
//   • State (status, progress, error, version, warm, modelCached,
//     pendingTierId, userDenied, result, device)
//   • Subscriber set + setState helper
//   • In-flight promise dedup (per-source identity)
//   • Abort + 30s stall watchdog (per-capability override)
//   • Generation counter for invalidation safety
//   • Per-session consent latch
//   • Disk-cache probe with implicit consent on hit
//   • Wait-for-resolution helper (used by smart-action awaits)
//   • Per-source-canvas result cache with dim-drift invalidation
//
// What the service does NOT own (kept in capability-specific code):
//   • The actual inference call (passed in as a runner callback)
//   • Capability-specific result post-processing (downsamples, bbox
//     extraction, region scoring, mask blending, …)
//   • Tool-panel UI bindings (those go through the React hook
//     primitive, ./hook.ts).

import { aiLog } from "../log";
import {
  type CapabilityFamily,
  type CapabilityProgress,
  type CapabilityState,
  type StallConfig,
  type CapabilityTier,
} from "./types";

const DEFAULT_STALL_TIMEOUT_MS = 30_000;
const DEFAULT_STALL_MESSAGE =
  "Download stalled. This is usually a slow connection — try again, or pick a smaller tier.";

/** Thrown by `run()` when the user hasn't yet authorised downloading
 *  the model. Callers detect this specifically (vs an inference error)
 *  and stay quiet — the consent dialog renders via the state
 *  subscription, not a thrown-error toast. */
export class CapabilityConsentError extends Error {
  readonly tierId: string;
  constructor(tierId: string) {
    super("Capability paused — user consent required.");
    this.name = "CapabilityConsentError";
    this.tierId = tierId;
  }
}

/** Thrown when the caller's signal aborts mid-inference. Mirrors
 *  AiAbortError in the worker runtime so the existing abort-handling
 *  catch blocks (which already check `err.name === "AiAbortError"`)
 *  also work for capabilities. */
export class CapabilityAbortError extends Error {
  constructor() {
    super("Capability inference aborted");
    this.name = "AiAbortError";
  }
}

/** Cache entry — kept by the service so capabilities don't all repeat
 *  the per-source / dim-drift dance. Capabilities with bespoke caching
 *  (e.g. segmentation's downsample cache) hang their extra cache off
 *  this entry's `extra` slot via `peekExtra()` / `setExtra()`. */
interface CacheEntry<TResult> {
  source: HTMLCanvasElement;
  width: number;
  height: number;
  result: TResult;
  /** Free-form per-capability cache slot. Stored by service so the
   *  invalidate path drops it alongside the result. */
  extra: unknown;
}

/** What the service hands the runner callback. */
export interface RunnerArgs {
  source: HTMLCanvasElement;
  signal: AbortSignal;
  onProgress: (p: CapabilityProgress) => void;
  /** The picked tier — runner uses `tier.runtimeRef` to know which
   *  model to load. */
  tier: CapabilityTier<unknown>;
}

/** Result-validation hook. Called after a runner resolves but before
 *  the result lands in the cache or state. Return `null` to mark the
 *  result invalid (capability sets `error` and rejects the promise);
 *  return the (possibly transformed) result to commit it. Used by
 *  segmentation to verify the mask wasn't fully transparent. */
export type ResultValidator<TResult> = (
  result: TResult,
) => { ok: true; value: TResult } | { ok: false; error: string };

export interface ServiceOptions<TResult> {
  family: CapabilityFamily;
  /** Override the stall watchdog timeout + message. */
  stall?: Partial<StallConfig>;
  /** Called when a cached or in-flight result is dropped (superseded,
   *  invalidated, replaced). Use this to release pooled resources
   *  (e.g. segmentation releases canvases back to the canvas pool). */
  onResultDropped?: (result: TResult) => void;
  /** Optional validator — see `ResultValidator`. */
  validate?: ResultValidator<TResult>;
  /** Called by `probeCacheForTier` to ask whether a tier's bytes are
   *  on disk. The capability provides its own probe (HF cache for
   *  transformers.js, custom CacheStorage for direct ORT). */
  isTierCached: (tier: CapabilityTier<unknown>) => Promise<boolean>;
}

type Listener<TResult> = (state: CapabilityState<TResult>) => void;

/** Generic capability service. One instance per capability — each
 *  capability module instantiates and re-exports their own. */
export class CapabilityService<TResult> {
  private readonly family: CapabilityFamily;
  private readonly stallTimeoutMs: number;
  private readonly stallMessage: string;
  private readonly onResultDropped?: (result: TResult) => void;
  private readonly validate?: ResultValidator<TResult>;
  private readonly isTierCached: (tier: CapabilityTier<unknown>) => Promise<boolean>;

  private cache: CacheEntry<TResult> | null = null;
  private inflight: Promise<TResult> | null = null;
  /** Source canvas the current `inflight` promise is detecting against.
   *  Lets us dedup concurrent calls *only* when they're for the same
   *  image — without it, an `ensure(docB.working)` call that arrives
   *  mid-detection on `docA.working` would silently return docA's
   *  result. */
  private inflightSource: HTMLCanvasElement | null = null;
  /** Generation counter for in-flight detections. Bumped by
   *  `invalidate()` (and at the start of every fresh detection) so a
   *  detection that started on doc A but finishes after a swap to
   *  doc B can detect the supersession and skip writing its stale
   *  result to the cache. */
  private inflightGeneration = 0;
  /** AbortController for the active detection. Wired through the AI
   *  worker so an explicit cancel actually terminates the inference
   *  thread (the only honest way to stop a running ONNX run). */
  private inflightAbort: AbortController | null = null;
  /** Watchdog timer that aborts the detection if download bytes don't
   *  advance for `stallTimeoutMs`. */
  private stallTimer: number | null = null;
  /** Per-session consent flag. The first time a tool needs the model
   *  (download not already on disk), the UI flips status to
   *  "needs-consent" and the user has to confirm. After they confirm
   *  once we don't ask again until the page reloads. Cached-on-disk
   *  models implicitly count as consented. */
  private consentGranted = false;

  private state: CapabilityState<TResult>;
  private readonly listeners = new Set<Listener<TResult>>();

  constructor(options: ServiceOptions<TResult>) {
    this.family = options.family;
    this.stallTimeoutMs = options.stall?.timeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    this.stallMessage = options.stall?.message ?? DEFAULT_STALL_MESSAGE;
    this.onResultDropped = options.onResultDropped;
    this.validate = options.validate;
    this.isTierCached = options.isTierCached;
    this.state = {
      status: "idle",
      progress: null,
      error: null,
      version: 0,
      warm: false,
      modelCached: false,
      pendingTierId: null,
      userDenied: false,
      result: null,
      device: null,
    };
  }

  // —————————————— State / subscription ——————————————

  getState(): CapabilityState<TResult> {
    return this.state;
  }

  subscribe(l: Listener<TResult>): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private setState(next: Partial<CapabilityState<TResult>>): void {
    if (next.status !== undefined && next.status !== this.state.status) {
      aiLog.debug(
        "subjectMask",
        `[${this.family.id}] status: ${this.state.status} → ${next.status}`,
        {
          hasProgress: !!next.progress,
          hasError: !!next.error,
          pendingTierId: next.pendingTierId ?? this.state.pendingTierId,
        },
      );
    }
    this.state = { ...this.state, ...next, version: this.state.version + 1 };
    for (const l of this.listeners) l(this.state);
  }

  // —————————————— Cache ——————————————

  /** Synchronous read. Returns null when no fresh result matches the
   *  current source canvas. A dimension change invalidates the cache
   *  in place (callers may resize the source canvas via Crop / Resize
   *  / Perspective without changing its identity). */
  peek(source: HTMLCanvasElement): TResult | null {
    if (!this.cache) return null;
    if (this.cache.source !== source) return null;
    if (this.cache.width !== source.width || this.cache.height !== source.height) {
      this.releaseCache();
      this.setState({ status: "idle", progress: null, error: null });
      return null;
    }
    return this.cache.result;
  }

  /** Read the per-capability extra slot for the cached entry. */
  peekExtra<T>(source: HTMLCanvasElement): T | null {
    if (!this.peek(source)) return null;
    return (this.cache?.extra ?? null) as T | null;
  }

  /** Write the per-capability extra slot for the cached entry. No-op
   *  when there's no fresh cache for `source`. */
  setExtra(source: HTMLCanvasElement, extra: unknown): void {
    if (!this.peek(source)) return;
    if (!this.cache) return;
    this.cache.extra = extra;
  }

  private releaseCache(): void {
    if (!this.cache) return;
    if (this.onResultDropped) this.onResultDropped(this.cache.result);
    this.cache = null;
  }

  // —————————————— Consent / disk cache ——————————————

  /** Probe disk for `tierId`'s bytes. On hit: implicitly grant consent
   *  (the user already accepted the download in a prior session) and
   *  publish `state.modelCached = true`. */
  async probeCacheForTier(tier: CapabilityTier<unknown>): Promise<boolean> {
    const cached = await this.isTierCached(tier);
    if (cached) this.consentGranted = true;
    if (this.state.modelCached !== cached) this.setState({ modelCached: cached });
    return cached;
  }

  grantConsent(): void {
    this.consentGranted = true;
    // Don't transition status to "idle" here. The original
    // segmentation flow used to (and still does) bounce through idle
    // because the consent host *also* spins a fresh detection inside
    // its own download-modal flow, which reaches setState({loading})
    // soon enough that nothing observably stalls.
    //
    // For lighter capabilities (face-detect, future PII OCR) the host
    // doesn't show a download modal — it just fires the follow-up
    // request and lets the in-panel spinner do the work. The
    // smart-action's `waitForResolution` is subscribed during the
    // consent dialog, and bouncing through idle synchronously fires
    // the listener BEFORE the follow-up request can land "loading"
    // — the wait rejects with a CapabilityConsentError, the smart
    // action exits, the dialog UI even hides, but no detection ever
    // ran. (Reproduced: probe-face-detect.mjs caught this in
    // production.)
    //
    // The clean fix is to clear pendingTierId + userDenied flags
    // without changing status. The follow-up request transitions
    // needs-consent → loading directly (no idle in between), so the
    // wait helper observes a continuous, monotonic path.
    if (this.state.pendingTierId !== null || this.state.userDenied) {
      this.setState({ pendingTierId: null, userDenied: false });
    }
  }

  /** Explicit close for the consent dialog without toggling
   *  consent. Used by hosts that re-open the picker for an already-
   *  granted user (e.g. "Change model size") and want to dismiss
   *  without firing a follow-up detection. Distinct from
   *  `denyConsent`, which latches `userDenied` to keep the dialog
   *  away. */
  dismissConsentDialog(): void {
    if (this.state.status === "needs-consent") {
      this.setState({ status: "idle", pendingTierId: null });
    }
  }

  denyConsent(): void {
    if (this.state.status === "needs-consent") {
      this.setState({ status: "idle", pendingTierId: null, userDenied: true });
    } else if (!this.state.userDenied) {
      this.setState({ userDenied: true });
    }
  }

  /** Reset the deny latch. Called from explicit user actions that
   *  re-opt-into the AI flow (resume chip, switching scope, retrying
   *  a smart action). The next `run` call after this re-pops the
   *  consent dialog. */
  clearDeny(): void {
    if (this.state.userDenied) this.setState({ userDenied: false });
  }

  hasConsent(): boolean {
    return this.consentGranted;
  }

  /** Force the consent / model-picker dialog open from a UI affordance
   *  ("Change model size" link). Re-uses the existing `needs-consent`
   *  status so a single host renders the same picker dialog. */
  requestTierPicker(currentTierId: string): void {
    if (this.state.userDenied) this.setState({ userDenied: false });
    this.setState({
      status: "needs-consent",
      progress: null,
      error: null,
      pendingTierId: currentTierId,
    });
  }

  // —————————————— Lifecycle ——————————————

  /** Cancel an in-flight detection. Aborts the AI worker and resets
   *  state to idle so subscribed UIs clear their progress. */
  cancel(): void {
    if (!this.inflight || !this.inflightAbort) return;
    this.inflightAbort.abort();
    this.inflightGeneration += 1;
    this.inflight = null;
    this.inflightSource = null;
    this.inflightAbort = null;
    this.clearStallTimer();
    this.setState({ status: "idle", progress: null, error: null });
  }

  /** Drop the cached result + bump the in-flight generation. Called
   *  by EditorContext when the doc swaps out (replaceWithFile,
   *  resetToOriginal). Does NOT abort an inflight call — the bytes
   *  are already paid for; the generation bump just discards the
   *  result on completion. */
  invalidate(): void {
    const hadCache = !!this.cache;
    const hadInflight = !!this.inflight;
    if (this.cache) this.releaseCache();
    if (this.inflight) {
      this.inflightGeneration += 1;
      this.inflight = null;
      this.inflightSource = null;
      this.inflightAbort = null;
      this.clearStallTimer();
    }
    if (!hadCache && !hadInflight) return;
    this.setState({ status: "idle", progress: null, error: null });
  }

  // —————————————— Run ——————————————

  /** Run the capability for `source` at `tier`. Concurrent callers for
   *  the same source share one in-flight promise. May throw
   *  `CapabilityConsentError` when the user hasn't authorised the
   *  model — caller should let the consent dialog handle that path
   *  rather than treating it as a failure toast. */
  async run(
    source: HTMLCanvasElement,
    tier: CapabilityTier<unknown>,
    runner: (args: RunnerArgs) => Promise<TResult>,
  ): Promise<TResult> {
    const existing = this.peek(source);
    if (existing) return existing;
    if (this.inflight && this.inflightSource === source) return this.inflight;

    if (!this.consentGranted) {
      if (this.state.userDenied) {
        // Stay quiet — re-flipping state would create a re-pop loop
        // with auto-trigger effects that depend on `state.version`.
        throw new CapabilityConsentError(tier.id);
      }
      const cached = await this.isTierCached(tier);
      if (cached) {
        this.consentGranted = true;
        if (!this.state.modelCached) this.setState({ modelCached: true });
      } else {
        this.setState({
          status: "needs-consent",
          progress: null,
          error: null,
          pendingTierId: tier.id,
        });
        throw new CapabilityConsentError(tier.id);
      }
    }

    this.setState({
      status: "loading",
      progress: { phase: "download", ratio: 0, label: "Preparing…" },
      error: null,
      pendingTierId: null,
    });

    this.inflightGeneration += 1;
    const myGeneration = this.inflightGeneration;
    this.inflightSource = source;
    this.inflightAbort = new AbortController();
    const myAbort = this.inflightAbort;

    const armStallTimer = () => {
      if (this.stallTimer !== null) window.clearTimeout(this.stallTimer);
      this.stallTimer = window.setTimeout(() => {
        if (myGeneration !== this.inflightGeneration) return;
        aiLog.warn(
          "subjectMask",
          `[${this.family.id}] detection stalled — no progress for ${this.stallTimeoutMs}ms`,
          {
            source: `${source.width}x${source.height}`,
            tier: tier.id,
          },
        );
        this.setState({
          status: "error",
          progress: null,
          error: this.stallMessage,
        });
        myAbort.abort();
      }, this.stallTimeoutMs);
    };
    armStallTimer();

    this.inflight = (async () => {
      try {
        const raw = await runner({
          source,
          signal: myAbort.signal,
          tier,
          onProgress: (p) => {
            if (myGeneration === this.inflightGeneration) {
              this.setState({ progress: p });
              armStallTimer();
            }
          },
        });

        if (myGeneration !== this.inflightGeneration) {
          // Detection raced with a doc swap / invalidate. Drop the
          // result and bail without touching state — the new
          // generation owns the UI now.
          if (this.onResultDropped) this.onResultDropped(raw);
          throw new Error(`[${this.family.id}] detection superseded.`);
        }

        // Pin `value` to Awaited<TResult> so the validator's TResult
        // assignment compiles. For all reasonable TResults (canvas,
        // box list, depth map) Awaited<TResult> === TResult, but TS's
        // strict structural check needs the explicit annotation.
        let value: Awaited<TResult> = raw;
        if (this.validate) {
          const verdict = this.validate(raw);
          if (!verdict.ok) {
            if (this.onResultDropped) this.onResultDropped(raw);
            aiLog.warn("subjectMask", `[${this.family.id}] validator rejected result`, {
              source: `${source.width}x${source.height}`,
              tier: tier.id,
              error: verdict.error,
            });
            this.setState({ status: "error", progress: null, error: verdict.error });
            throw new Error(verdict.error);
          }
          value = verdict.value as Awaited<TResult>;
        }

        if (this.cache) this.releaseCache();
        this.cache = {
          source,
          width: source.width,
          height: source.height,
          result: value,
          extra: null,
        };
        this.setState({
          status: "ready",
          progress: null,
          error: null,
          warm: true,
          modelCached: true,
          result: value,
        });
        return value;
      } catch (err) {
        if (myGeneration !== this.inflightGeneration) {
          aiLog.debug("subjectMask", `[${this.family.id}] detection superseded by newer request`, {
            myGeneration,
            currentGeneration: this.inflightGeneration,
          });
          throw err;
        }
        if (err instanceof Error && err.name === "AiAbortError") {
          aiLog.debug("subjectMask", `[${this.family.id}] detection cancelled by user`);
          throw err;
        }
        const msg = err instanceof Error ? err.message : String(err);
        aiLog.error("subjectMask", `[${this.family.id}] detection failed`, err, {
          source: `${source.width}x${source.height}`,
          tier: tier.id,
        });
        if (this.state.status !== "error") {
          this.setState({ status: "error", progress: null, error: msg });
        }
        throw err;
      } finally {
        if (myGeneration === this.inflightGeneration) {
          this.inflight = null;
          this.inflightSource = null;
          this.inflightAbort = null;
          this.clearStallTimer();
        }
      }
    })();

    return this.inflight;
  }

  /** Wait until the service settles for an outstanding consent request
   *  (or in-flight detection) for `source`. Resolves with the result;
   *  rejects with `CapabilityConsentError` if the user dismisses the
   *  dialog. Used by smart-action buttons so a click that triggers
   *  consent + download + inference all unblocks on a single tap.
   *
   *  Note: the wait resolves on the FIRST "ready" the service reaches
   *  after subscription. Caller is responsible for calling this only
   *  while a relevant operation is pending (otherwise it can resolve
   *  off a stale detection — or hang). */
  waitForResolution(source: HTMLCanvasElement, tierId: string): Promise<TResult> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        action();
      };
      const check = (s: CapabilityState<TResult>) => {
        if (s.status === "ready") {
          const result = this.peek(source);
          if (result !== null) {
            finish(() => resolve(result));
          } else {
            finish(() => reject(new CapabilityConsentError(tierId)));
          }
          return;
        }
        if (s.status === "error") {
          finish(() => reject(new Error(s.error ?? "Detection failed")));
          return;
        }
        if (s.status === "idle") {
          finish(() => reject(new CapabilityConsentError(tierId)));
        }
      };
      const unsubscribe = this.subscribe(check);
      check(this.state);
    });
  }

  /** Family this service was constructed with. Lets capability code
   *  read tier metadata without holding a separate reference. */
  getFamily(): CapabilityFamily {
    return this.family;
  }

  // —————————————— Internals ——————————————

  private clearStallTimer(): void {
    if (this.stallTimer !== null) {
      window.clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }
}
