// useSubjectMask.ts — React hook on top of the subject-mask service.
// Components subscribe to `state` (status / progress / error) and use
// `request()` to lazily trigger detection. The doc from EditorContext
// is threaded in here so consumers don't have to re-import it
// everywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorReadOnly, useToolState } from "../EditorContext";
import type { BgQuality } from "./runtime/segment";
import {
  clearMaskDeny,
  denyMaskConsent,
  ensureSubjectMask,
  getMaskState,
  grantMaskConsent,
  invalidateSubjectMask,
  MaskConsentError,
  type MaskState,
  peekMaskDownsample,
  peekSubjectMask,
  probeModelCache,
  subscribeMaskState,
  waitForMaskResolution,
} from "./subjectMask";

const QUALITY_KEYS: BgQuality[] = ["small", "medium", "large"];

export interface UseSubjectMask {
  state: MaskState;
  /** Currently selected quality tier as a friendly enum. Mirrors
   *  `bgQuality` from toolState so callers don't have to map indices
   *  themselves. */
  quality: BgQuality;
  /** Returns the cached cut canvas if it matches the current doc.
   *  Sync — does not trigger a load. */
  peek: () => HTMLCanvasElement | null;
  /** Returns a cached downsampled copy of the mask at `longEdge` px
   *  on the long side, falling back to the full-res cut when the
   *  source is already small. Use this from preview hooks where the
   *  baked surface is itself downsampled — pre-sizing the mask once
   *  is much cheaper than asking the browser to scale the full-res
   *  cut on every preview rAF. */
  peekDownsample: (longEdge: number) => HTMLCanvasElement | null;
  /** Trigger detection if needed. Returns the cut canvas on success.
   *  Concurrent callers share the same in-flight promise. May reject
   *  with `MaskConsentError` when the user hasn't authorised the
   *  download yet — callers should let the dialog handle that path
   *  rather than treating it as a failure toast.
   *
   *  This is the *passive* request — it respects `state.userDenied`
   *  and won't re-pop the dialog after a dismiss (used by useEffect
   *  auto-triggers so dismissing actually sticks). For an *explicit
   *  user action* (clicking Smart Crop, Smart Anonymize, Apply on
   *  Remove BG, etc.) reach for `requestExplicit` instead — it
   *  clears the deny latch first so the dialog re-opens. */
  request: () => Promise<HTMLCanvasElement>;
  /** Like `request`, but clears the deny latch first. Use this from
   *  any user-initiated control where the click itself signals
   *  "yes, I want the AI" — the consent dialog should reopen even if
   *  the user dismissed it earlier in the session. */
  requestExplicit: () => Promise<HTMLCanvasElement>;
  /** User accepted the model download. Clears `needs-consent` state
   *  and lets a follow-up `request()` proceed. */
  grantConsent: () => void;
  /** User dismissed the consent dialog. Returns to idle without
   *  starting a download, and latches `userDenied` so panel
   *  auto-trigger effects don't immediately re-pop the dialog. */
  denyConsent: () => void;
  /** Explicit user re-opt-in after a previous dismiss. Clears the
   *  deny latch AND fires detection so the dialog reopens (or, for an
   *  already-cached model, runs detection straight away). Wired to
   *  the panels' "Detection paused — Enable" chip. */
  resumeAfterDeny: () => Promise<void>;
  /** Drop the cached mask + reset state to idle. */
  invalidate: () => void;
}

export function useSubjectMask(): UseSubjectMask {
  const { doc } = useEditorReadOnly();
  const { bgQuality } = useToolState();
  const quality = QUALITY_KEYS[bgQuality] ?? "small";
  const [state, setState] = useState<MaskState>(() => getMaskState());

  useEffect(() => {
    setState(getMaskState());
    return subscribeMaskState(setState);
  }, []);

  // Probe the on-disk cache when the chosen quality changes so the
  // warm/cold copy and the consent dialog have an honest picture of
  // whether the user actually faces a fresh download. Probing is
  // cheap (low-thousands of cache keys at worst) and the result is
  // memoised on the mask state.
  //
  // ALSO: if the user actively switches tiers after a mask has
  // already been detected, drop the cached cut so a follow-up
  // request runs detection at the new quality. Without this the
  // cache key is `source + dims` and the existing (lower-quality)
  // mask gets reused, silently negating the upgrade. We track the
  // *previous* quality in a ref so the first mount (where prev ===
  // current) doesn't invalidate — only real transitions do.
  //
  // CRITICAL: skip invalidation while a detection is already inflight
  // for the new quality. The consent-dialog flow patches `bgQuality`
  // and *then* fires `startDetection` synchronously in the same
  // event handler, so by the time React commits and this effect
  // runs, an inflight detection for the new quality already exists.
  // Calling invalidateSubjectMask here would bump the generation
  // counter and silently discard that detection's result on
  // completion — exactly the "no progress shown, then nothing
  // happens" symptom the user reported on first download. We only
  // want to drop the cache when there's no in-flight detection to
  // race; the consent flow's own invalidation is implicit (a fresh
  // ensureSubjectMask call writes to the cache slot directly).
  const prevQualityRef = useRef(quality);
  useEffect(() => {
    if (prevQualityRef.current !== quality) {
      if (state.status !== "loading") {
        invalidateSubjectMask();
      }
      prevQualityRef.current = quality;
    }
    void probeModelCache(quality);
  }, [quality, state.status]);

  const peek = useCallback(() => {
    if (!doc) return null;
    return peekSubjectMask(doc.working);
  }, [doc]);

  const peekDownsample = useCallback(
    (longEdge: number) => {
      if (!doc) return null;
      return peekMaskDownsample(doc.working, longEdge);
    },
    [doc],
  );

  const request = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!doc) throw new Error("No document open");
    return ensureSubjectMask(doc.working, quality);
  }, [doc, quality]);

  const requestExplicit = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!doc) throw new Error("No document open");
    // Clear the deny latch first — the user just clicked an
    // AI-powered button, which is the explicit "yes I want this"
    // signal the latch was waiting for. Without this, every
    // user-facing AI button silently no-ops after a single dismiss.
    clearMaskDeny();
    try {
      return await ensureSubjectMask(doc.working, quality);
    } catch (err) {
      // Consent gate fired — the host dialog is now up. Instead of
      // bouncing the smart action's promise rejection, *wait* for the
      // user to either accept (resolves with the mask) or dismiss
      // (rejects with MaskConsentError, which the caller's catch
      // already swallows quietly). This turns "tap, accept, tap
      // again" into a single tap that resumes after consent.
      if (err instanceof MaskConsentError) {
        return waitForMaskResolution(doc.working, quality);
      }
      throw err;
    }
  }, [doc, quality]);

  const grantConsent = useCallback(() => {
    grantMaskConsent();
  }, []);

  const denyConsent = useCallback(() => {
    denyMaskConsent();
  }, []);

  const resumeAfterDeny = useCallback(async (): Promise<void> => {
    if (!doc) return;
    clearMaskDeny();
    try {
      await ensureSubjectMask(doc.working, quality);
    } catch {
      // Either bounces to the consent dialog (state.status flips to
      // needs-consent — the host renders it) or surfaces a real error
      // (state.error → DetectionErrorCard). Either way the panel
      // sees the result via subscription, not via this throw.
    }
  }, [doc, quality]);

  const invalidate = useCallback(() => {
    invalidateSubjectMask();
  }, []);

  return useMemo(
    () => ({
      state,
      quality,
      peek,
      peekDownsample,
      request,
      requestExplicit,
      grantConsent,
      denyConsent,
      resumeAfterDeny,
      invalidate,
    }),
    [
      denyConsent,
      grantConsent,
      invalidate,
      peek,
      peekDownsample,
      quality,
      request,
      requestExplicit,
      resumeAfterDeny,
      state,
    ],
  );
}
