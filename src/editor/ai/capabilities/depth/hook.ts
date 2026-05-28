// hook.ts — React binding around the depth service. Mirrors
// detect-face/hook.ts: subscribes to service state, threads the active
// document's `working` canvas through peek / request, and surfaces the
// consent helpers the host modal needs.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorReadOnly } from "../../../EditorContext";
import { CapabilityConsentError } from "../../capability/service";
import type { CapabilityState } from "../../capability/types";
import {
  cancelDepth,
  clearDepthDeny,
  denyDepthConsent,
  ensureDepth,
  getDepthState,
  grantDepthConsent,
  hasDepthConsent,
  invalidateDepth,
  peekDepth,
  probeDepthCache,
  requestDepthTierPicker,
  subscribeDepthState,
  waitForDepthResolution,
} from "./service";

export interface UseDepth {
  state: CapabilityState<HTMLCanvasElement>;
  /** Sync read of the cached depth map (source-resolution grayscale
   *  canvas). Null until detected for the current document. */
  peek: () => HTMLCanvasElement | null;
  /** Lazy estimate. Respects the deny latch — auto-trigger effects use
   *  this so a dismissed consent modal stays dismissed. */
  request: () => Promise<HTMLCanvasElement>;
  /** Lazy estimate AFTER clearing the deny latch — for explicit user
   *  actions (e.g. a "Relight" resume chip) that should re-open the
   *  modal after a prior dismiss. */
  requestExplicit: () => Promise<HTMLCanvasElement>;
  grantConsent: () => void;
  denyConsent: () => void;
  resumeAfterDeny: () => Promise<void>;
  invalidate: () => void;
  cancel: () => void;
  requestPicker: () => void;
  hasConsent: () => boolean;
}

export function useDepth(): UseDepth {
  const { doc } = useEditorReadOnly();
  const [state, setState] = useState<CapabilityState<HTMLCanvasElement>>(() => getDepthState());

  useEffect(() => {
    setState(getDepthState());
    return subscribeDepthState(setState);
  }, []);

  // Probe the cache on mount so `state.modelCached` is accurate before
  // the panel decides whether to show "Download" vs "Use".
  useEffect(() => {
    void probeDepthCache();
  }, []);

  const peek = useCallback(() => {
    if (!doc) return null;
    return peekDepth(doc.working);
  }, [doc]);

  const request = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!doc) throw new Error("No document open");
    return ensureDepth(doc.working);
  }, [doc]);

  const requestExplicit = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!doc) throw new Error("No document open");
    clearDepthDeny();
    try {
      return await ensureDepth(doc.working);
    } catch (err) {
      if (err instanceof CapabilityConsentError) {
        return waitForDepthResolution(doc.working);
      }
      throw err;
    }
  }, [doc]);

  const grantConsent = useCallback(() => {
    grantDepthConsent();
  }, []);

  const denyConsent = useCallback(() => {
    denyDepthConsent();
  }, []);

  const resumeAfterDeny = useCallback(async (): Promise<void> => {
    if (!doc) return;
    clearDepthDeny();
    try {
      await ensureDepth(doc.working);
    } catch {
      // Consent modal re-opens via the state subscription, or a real
      // error surfaces via state.error — the panel reads either through
      // the subscription, not this throw.
    }
  }, [doc]);

  const invalidate = useCallback(() => {
    invalidateDepth();
  }, []);

  const cancel = useCallback(() => {
    cancelDepth();
  }, []);

  const requestPicker = useCallback(() => {
    requestDepthTierPicker();
  }, []);

  const hasConsent = useCallback(() => hasDepthConsent(), []);

  return useMemo(
    () => ({
      state,
      peek,
      request,
      requestExplicit,
      grantConsent,
      denyConsent,
      resumeAfterDeny,
      invalidate,
      cancel,
      requestPicker,
      hasConsent,
    }),
    [
      state,
      peek,
      request,
      requestExplicit,
      grantConsent,
      denyConsent,
      resumeAfterDeny,
      invalidate,
      cancel,
      requestPicker,
      hasConsent,
    ],
  );
}
