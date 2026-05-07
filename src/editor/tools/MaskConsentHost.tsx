// MaskConsentHost.tsx — Editor-shell-level mount point for the
// MaskConsentDialog *and* the in-flight download progress dialog.
// Subscribes to the central subject-mask service and renders the
// right modal based on state.status:
//
//   • "needs-consent" → MaskConsentDialog (tier picker).
//   • after grant, while "loading" → MaskDownloadDialog (live
//     bytes-downloaded readout + inference shimmer).
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

import { useCallback, useEffect, useState } from "react";
import { useEditorReadOnly } from "../EditorContext";
import { cancelMaskDetection, ensureSubjectMask, grantMaskConsent } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import type { BgQuality } from "./ai/segment";
import { MaskConsentDialog } from "./MaskConsentDialog";
import { MaskDownloadDialog } from "./MaskDownloadDialog";

export function MaskConsentHost() {
  const subjectMask = useSubjectMask();
  const { doc } = useEditorReadOnly();
  // True from the moment the user accepts in the consent dialog
  // until detection settles (ready / error / idle). While set, we
  // keep a download-progress modal visible so they don't stare at a
  // blank screen wondering whether their tap registered.
  const [showDownload, setShowDownload] = useState(false);

  // Note: we call `ensureSubjectMask` directly with the user's chosen
  // quality rather than going through `subjectMask.request()`. The
  // hook closes over the previous render's `bgQuality`, but the
  // dialog's `patchTool('bgQuality', …)` won't have flushed React
  // state by the time `onAccept` fires — so going via the hook
  // would still kick off detection at the *previous* quality. Routing
  // around the hook keeps the chosen tier honest.
  const onAccept = useCallback(
    (quality: BgQuality) => {
      grantMaskConsent();
      if (!doc) return;
      setShowDownload(true);
      void ensureSubjectMask(doc.working, quality).catch(() => {
        // Errors land in mask state — the download dialog reads
        // state.error and surfaces an error message inline rather
        // than us showing a separate toast.
      });
    },
    [doc],
  );

  // Auto-clear the progress modal once detection settles. We treat
  // ready / error / idle alike — in all three cases the download
  // dialog has nothing left to show. Errors propagate to the
  // triggering panel's inline error card.
  useEffect(() => {
    const status = subjectMask.state.status;
    if (status === "ready" || status === "error" || status === "idle") {
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

  if (subjectMask.state.status === "needs-consent") {
    return (
      <MaskConsentDialog
        initialQuality={subjectMask.state.pendingQuality ?? subjectMask.quality}
        onAccept={onAccept}
        onDismiss={subjectMask.denyConsent}
      />
    );
  }
  if (showDownload && subjectMask.state.status === "loading") {
    return (
      <MaskDownloadDialog
        progress={subjectMask.state.progress}
        warm={subjectMask.state.warm}
        onDismiss={onDismissDownload}
        onCancel={onCancelDownload}
      />
    );
  }
  return null;
}
