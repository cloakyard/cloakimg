// hook.ts — React binding around the face-detect service. Subscribes
// to the service's state, threads the active document's `working`
// canvas through `peek` / `request`, and surfaces consent helpers the
// host dialog needs.
//
// Pattern matches `useSubjectMask` so a reader who knows the
// segmentation surface can pick this up cold. The eventual goal is
// that segmentation migrates onto the same primitive and the two
// hooks share even more shape, but that migration is out of scope
// for the first feature ship.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorReadOnly } from "../../../EditorContext";
import { CapabilityConsentError } from "../../capability/service";
import type { CapabilityState } from "../../capability/types";
import type { FaceBox } from "../../runtime/types";
import {
  cancelFaceDetection,
  clearFaceDeny,
  denyFaceConsent,
  ensureFaceDetections,
  getFaceState,
  grantFaceConsent,
  hasFaceConsent,
  invalidateFaceDetection,
  peekFaceDetections,
  probeFaceConsent,
  requestFaceTierPicker,
  subscribeFaceState,
  waitForFaceResolution,
} from "./service";

export interface UseDetectFaces {
  /** Live service state — drives panel chips / cards / dialogs. */
  state: CapabilityState<FaceBox[]>;
  /** Sync read of cached faces. Returns null when not yet detected
   *  for the current document. */
  peek: () => FaceBox[] | null;
  /** Lazy detect. Respects the deny latch — auto-trigger effects use
   *  this so a dismissed consent dialog stays dismissed. */
  request: () => Promise<FaceBox[]>;
  /** Lazy detect AFTER clearing the deny latch. Used by explicit
   *  user actions ("Auto-redact faces" button click) so the dialog
   *  re-opens after a prior dismiss. */
  requestExplicit: () => Promise<FaceBox[]>;
  /** Consent affordances — wired to the consent host dialog. */
  grantConsent: () => void;
  denyConsent: () => void;
  resumeAfterDeny: () => Promise<void>;
  /** Drop cached detections + reset state. EditorContext calls this
   *  when the doc swaps out (replaceWithFile / resetToOriginal). */
  invalidate: () => void;
  /** Cancel an in-flight detection — terminates the worker run. */
  cancel: () => void;
  /** Force the consent / model-info dialog open (for a future "model
   *  details" affordance in the panel). */
  requestPicker: () => void;
  /** True iff the user (or a prior session) already accepted. */
  hasConsent: () => boolean;
}

export function useDetectFaces(): UseDetectFaces {
  const { doc } = useEditorReadOnly();
  const [state, setState] = useState<CapabilityState<FaceBox[]>>(() => getFaceState());

  useEffect(() => {
    setState(getFaceState());
    return subscribeFaceState(setState);
  }, []);

  // Probe consent on mount so `state.modelCached` reflects the truth
  // before any panel queries it. Cheap (a localStorage read, plus the
  // promise round-trip to satisfy the service's async API).
  useEffect(() => {
    void probeFaceConsent();
  }, []);

  const peek = useCallback(() => {
    if (!doc) return null;
    return peekFaceDetections(doc.working);
  }, [doc]);

  const request = useCallback(async (): Promise<FaceBox[]> => {
    if (!doc) throw new Error("No document open");
    return ensureFaceDetections(doc.working);
  }, [doc]);

  const requestExplicit = useCallback(async (): Promise<FaceBox[]> => {
    if (!doc) throw new Error("No document open");
    clearFaceDeny();
    try {
      return await ensureFaceDetections(doc.working);
    } catch (err) {
      // Consent gate fired — wait for the host dialog to settle the
      // flow rather than bouncing the user with a "tap again" UX.
      if (err instanceof CapabilityConsentError) {
        return waitForFaceResolution(doc.working);
      }
      throw err;
    }
  }, [doc]);

  const grantConsent = useCallback(() => {
    grantFaceConsent();
  }, []);

  const denyConsent = useCallback(() => {
    denyFaceConsent();
  }, []);

  const resumeAfterDeny = useCallback(async (): Promise<void> => {
    if (!doc) return;
    clearFaceDeny();
    try {
      await ensureFaceDetections(doc.working);
    } catch {
      // Consent dialog re-opens via state subscription, or a real
      // error surfaces via state.error — either way the panel reads
      // the result via the subscription, not this throw.
    }
  }, [doc]);

  const invalidate = useCallback(() => {
    invalidateFaceDetection();
  }, []);

  const cancel = useCallback(() => {
    cancelFaceDetection();
  }, []);

  const requestPicker = useCallback(() => {
    requestFaceTierPicker();
  }, []);

  const hasConsent = useCallback(() => hasFaceConsent(), []);

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
