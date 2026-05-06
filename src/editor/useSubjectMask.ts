// useSubjectMask.ts — React hook on top of the subject-mask service.
// Components subscribe to `state` (status / progress / error) and use
// `request()` to lazily trigger detection. The doc from EditorContext
// is threaded in here so consumers don't have to re-import it
// everywhere.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorReadOnly, useToolState } from "./EditorContext";
import {
  clearMaskDeny,
  denyMaskConsent,
  ensureSubjectMask,
  getMaskState,
  grantMaskConsent,
  invalidateSubjectMask,
  type MaskState,
  peekMaskDownsample,
  peekSubjectMask,
  probeModelCache,
  subscribeMaskState,
} from "./subjectMask";
import type { BgQuality } from "./tools/smartRemoveBg";

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
   *  rather than treating it as a failure toast. */
  request: () => Promise<HTMLCanvasElement>;
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
  useEffect(() => {
    void probeModelCache(quality);
  }, [quality]);

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
      resumeAfterDeny,
      state,
    ],
  );
}
