// ConsentHost.tsx — Editor-shell mount point for the depth consent
// dialog. Subscribes to the depth service and renders the generic
// CapabilityConsentDialog while status === "needs-consent".
//
// Unlike the same-origin face model, depth is a transformers.js model
// behind the HF CacheStorage probe, so the dialog gets a real
// `isTierCached` callback — the "Already downloaded" badge is honest and
// the privacy promise stays intact (we only read our own model cache).

import { useCallback } from "react";
import { tierById } from "../../capability/types";
import { CapabilityConsentDialog } from "../../ui/consent/CapabilityConsentDialog";
import { isDepthModelCached } from "../../runtime/depth";
import { DEPTH_FAMILY, type DepthTierRuntimeRef } from "./family";
import { useDepth } from "./hook";

export function DepthConsentHost() {
  const depth = useDepth();

  const onAccept = useCallback(
    (tierId: string) => {
      // grant + immediate estimation: grantConsent clears the pending
      // flags without changing status, then request() transitions
      // needs-consent → loading directly, so any waitForDepthResolution
      // subscribed during the dialog resolves on the first ready.
      depth.grantConsent();
      void depth.request().catch(() => undefined);
      void tierId;
    },
    [depth],
  );

  const onDismiss = useCallback(() => {
    depth.denyConsent();
  }, [depth]);

  if (depth.state.status !== "needs-consent") return null;

  return (
    <CapabilityConsentDialog
      family={DEPTH_FAMILY}
      initialTierId={depth.state.pendingTierId ?? tierById(DEPTH_FAMILY.tiers, "fast").id}
      isTierCached={(tier) => isDepthModelCached(tier.runtimeRef as DepthTierRuntimeRef)}
      onAccept={onAccept}
      onDismiss={onDismiss}
      switchMode={depth.hasConsent()}
    />
  );
}
