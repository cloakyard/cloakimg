// MaskConsentHost.tsx — Editor-shell-level mount point for the
// MaskConsentDialog. Subscribes to the central subject-mask service
// and renders the dialog whenever any tool (Adjust, Filter, Levels,
// HSL, Portrait blur, Watermark, Crop, Remove BG) flips the service
// to "needs-consent". Lives next to the export and file-props modals
// so it gets the same `position="absolute"` backdrop scoping.
//
// Why a host: every scoped tool calls `useSubjectMask().request()` on
// pick. When consent isn't granted yet the service rejects with
// MaskConsentError and bumps state to "needs-consent". A single host
// listens for that and surfaces the dialog — keeping consent UI out
// of every tool panel means tools all stay smaller and the dialog is
// guaranteed to look identical no matter which tool triggered it.

import { useCallback } from "react";
import { useEditorReadOnly } from "../EditorContext";
import { ensureSubjectMask, grantMaskConsent } from "../subjectMask";
import { useSubjectMask } from "../useSubjectMask";
import { MaskConsentDialog } from "./MaskConsentDialog";
import type { BgQuality } from "./smartRemoveBg";

export function MaskConsentHost() {
  const subjectMask = useSubjectMask();
  const { doc } = useEditorReadOnly();

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
      void ensureSubjectMask(doc.working, quality).catch(() => {
        // Errors land in mask state and render via DetectionErrorCard.
      });
    },
    [doc],
  );

  if (subjectMask.state.status !== "needs-consent") return null;
  return (
    <MaskConsentDialog
      initialQuality={subjectMask.state.pendingQuality ?? subjectMask.quality}
      onAccept={onAccept}
      onDismiss={subjectMask.denyConsent}
    />
  );
}
