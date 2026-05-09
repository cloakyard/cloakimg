// ConsentHost.tsx — Editor-shell mount point for the face-detect
// consent dialog. Subscribes to the face-detect service and renders
// the generic CapabilityConsentDialog while status === "needs-consent".
//
// Smaller than MaskConsentHost because the BlazeFace model is only
// ~1 MB — the in-panel progress card is enough; we don't need the
// full download modal that segmentation surfaces for its 84 MB tier.
// If face detection ever grows a heavier tier (a future high-fidelity
// face landmarker?), we'd add that modal here, mirroring
// MaskConsentHost.

import { useCallback } from "react";
import { CapabilityConsentDialog } from "../../ui/consent/CapabilityConsentDialog";
import { tierById } from "../../capability/types";
import { DETECT_FACE_FAMILY } from "./family";
import { useDetectFaces } from "./hook";

export function DetectFaceConsentHost() {
  const faces = useDetectFaces();

  const onAccept = useCallback(
    (tierId: string) => {
      // grant + immediate detection. The smart-action's
      // waitForFaceResolution is already subscribed (set up when
      // the original click hit the consent gate). Calling
      // grantConsent flips the internal flag without changing
      // status, then request() fires ensureFaceDetections, which
      // transitions status `needs-consent → loading` directly.
      // The wait helper observes loading → ready and resolves
      // with the cached face list — no second click needed.
      //
      // If we instead called only grantConsent (and let it bounce
      // through idle as the original implementation did), the
      // wait would reject on idle BEFORE this follow-up request
      // could land loading, and the smart action would silently
      // exit. That regression is captured by the dev-server probe
      // in scripts/probe-face-detect.mjs.
      faces.grantConsent();
      void faces.request().catch(() => undefined);
      void tierId; // tier-id is informational today (single tier).
    },
    [faces],
  );

  const onDismiss = useCallback(() => {
    faces.denyConsent();
  }, [faces]);

  if (faces.state.status !== "needs-consent") return null;

  return (
    <CapabilityConsentDialog
      family={DETECT_FACE_FAMILY}
      initialTierId={faces.state.pendingTierId ?? tierById(DETECT_FACE_FAMILY.tiers, "standard").id}
      // Same-origin asset — the cached signal comes from our own
      // localStorage marker, not HF's CacheStorage probe. We pass a
      // probe that always returns false here: the dialog uses this to
      // stamp "Already downloaded" pills, and showing that for a
      // 230 KB model that downloads in under a second isn't useful
      // signal for the user (and would confuse the privacy promise —
      // implies we know about their browser cache state when we
      // really only know about our own consent flag).
      isTierCached={async () => false}
      onAccept={onAccept}
      onDismiss={onDismiss}
      switchMode={faces.hasConsent()}
    />
  );
}
