// MaskConsentHost.tsx — Editor-shell-level mount point for the
// MaskConsentDialog *and* the in-flight download progress dialog.
// Subscribes to the central subject-mask service and renders the
// right modal based on state.status:
//
//   • "needs-consent" → MaskConsentDialog (tier picker).
//   • after grant, while "loading" → MaskDownloadDialog (live
//     bytes-downloaded readout + inference shimmer).
//   • after grant, when "error" → MaskDownloadDialog stays visible
//     with the error pinned + a Try again affordance, so the user
//     never sees the dialog vanish silently on a worker crash.
//   • everything else → nothing (the panel that triggered the
//     detection owns the inline progress card / ready chip / error).
//
// Why a host: every scoped tool calls `useSubjectMask().request()` on
// pick. When consent isn't granted yet the service rejects with
// MaskConsentError and bumps state to "needs-consent". A single host
// listens for that and surfaces the dialog — keeping consent UI out
// of every tool panel means tools all stay smaller and the dialog is
// guaranteed to look identical no matter which tool triggered it.
//
// The download dialog only appears when *this host* started the
// download (the user just clicked Download in the consent dialog).
// If detection is initiated by an auto-trigger from a panel switch,
// the panel's own inline progress card handles the UI — we don't
// want a full-screen modal popping for every scope toggle.

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorReadOnly } from "../EditorContext";
import { cancelMaskDetection, ensureSubjectMask, grantMaskConsent } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { type BgQuality, QUALITY_BYTE_ESTIMATES } from "./ai/segment";
import { MaskConsentDialog } from "./MaskConsentDialog";
import { MaskDownloadDialog } from "./MaskDownloadDialog";

export function MaskConsentHost() {
  const subjectMask = useSubjectMask();
  const { doc } = useEditorReadOnly();
  // True from the moment the user accepts in the consent dialog
  // until detection settles to "ready" (or the user dismisses /
  // cancels). On "error" we keep this true so the dialog can pin
  // the failure and offer Try again — silently vanishing on error
  // was a bug that made worker crashes look like "nothing happened".
  const [showDownload, setShowDownload] = useState(false);
  // Remember which quality the user picked so:
  //   1. The progress card can show "0 / 88 MB" before the lib's
  //      first byte arrives (DetectionProgressCard's expectedTotal).
  //   2. Try again can rerun detection at the same tier without
  //      the user having to re-pick from the consent dialog.
  // Using a ref because nothing else in the render branches on it,
  // so a re-render isn't needed when it changes.
  const requestedQualityRef = useRef<BgQuality | null>(null);

  // Note: we call `ensureSubjectMask` directly with the user's chosen
  // quality rather than going through `subjectMask.request()`. The
  // hook closes over the previous render's `bgQuality`, but the
  // dialog's `patchTool('bgQuality', …)` won't have flushed React
  // state by the time `onAccept` fires — so going via the hook
  // would still kick off detection at the *previous* quality. Routing
  // around the hook keeps the chosen tier honest.
  const startDetection = useCallback(
    (quality: BgQuality) => {
      if (!doc) return;
      requestedQualityRef.current = quality;
      setShowDownload(true);
      void ensureSubjectMask(doc.working, quality).catch((err) => {
        // Errors land in mask state — the download dialog reads
        // state.error and pins it inline. Surfacing through console
        // too so the underlying cause (worker crash, model fetch
        // failure, CSP, etc.) is visible to anyone debugging.
        console.error("[CloakIMG] Subject detection failed:", err);
      });
    },
    [doc],
  );

  const onAccept = useCallback(
    (quality: BgQuality) => {
      grantMaskConsent();
      startDetection(quality);
    },
    [startDetection],
  );

  // Auto-clear the progress modal when detection succeeds or the
  // service goes idle. We deliberately do NOT clear on "error" — the
  // dialog stays up so the user sees what went wrong and can retry.
  useEffect(() => {
    const status = subjectMask.state.status;
    if (status === "ready" || status === "idle") {
      setShowDownload(false);
    }
  }, [subjectMask.state.status]);

  const onDismissDownload = useCallback(() => {
    // "Continue in background" — hide the modal, let detection
    // finish. The cached cut is there for the next tool that asks.
    setShowDownload(false);
  }, []);

  const onCancelDownload = useCallback(() => {
    // "Cancel" — terminate the worker outright. We own the worker now
    // (see ai/runtime.ts) so cancellation is honest: the inference
    // thread dies, the modal closes, mask state goes back to idle.
    // The bytes already in CacheStorage stick around so a follow-up
    // tap doesn't re-download from scratch.
    cancelMaskDetection();
    setShowDownload(false);
  }, []);

  const onRetryDownload = useCallback(() => {
    // Same quality, fresh attempt. cancelMaskDetection clears state
    // → idle and bumps inflight generation; startDetection then
    // flips back to "loading" with progress reset.
    cancelMaskDetection();
    const quality = requestedQualityRef.current;
    if (!quality) return;
    startDetection(quality);
  }, [startDetection]);

  if (subjectMask.state.status === "needs-consent") {
    return (
      <MaskConsentDialog
        initialQuality={subjectMask.state.pendingQuality ?? subjectMask.quality}
        onAccept={onAccept}
        onDismiss={subjectMask.denyConsent}
      />
    );
  }
  if (showDownload) {
    const quality = requestedQualityRef.current;
    const expectedTotal = quality ? QUALITY_BYTE_ESTIMATES[quality] : undefined;
    const status = subjectMask.state.status;
    // Render the dialog while we're loading, OR pinned after an
    // error so the user sees what failed. "ready" / "idle" are
    // already handled by the auto-clear effect above.
    if (status === "loading" || status === "error") {
      return (
        <MaskDownloadDialog
          progress={subjectMask.state.progress}
          warm={subjectMask.state.warm}
          expectedTotal={expectedTotal}
          error={status === "error" ? subjectMask.state.error : null}
          onDismiss={onDismissDownload}
          onCancel={onCancelDownload}
          onRetry={onRetryDownload}
        />
      );
    }
  }
  return null;
}
