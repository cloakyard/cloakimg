// family.ts — Capability family for monocular depth estimation. Wraps
// the depthModels registry into the generic CapabilityFamily shape the
// consent dialog + progress card render from. Each CapabilityTier's
// `runtimeRef` carries the underlying DepthModelTier (repo + dtype) so
// the runner can drive `estimateDepth` without re-deriving model facts.

import type { CapabilityFamily, CapabilityTier } from "../../capability/types";
import { ACTIVE_DEPTH_FAMILY, type DepthModelTier } from "../../runtime/depthModels";

/** The runtime ref each depth tier carries — the full model-registry
 *  tier, so the runner reads `repo` / `dtype` straight off it. */
export type DepthTierRuntimeRef = DepthModelTier;

const TIERS: readonly CapabilityTier<DepthTierRuntimeRef>[] = ACTIVE_DEPTH_FAMILY.tiers.map(
  (t) => ({
    id: t.id,
    index: t.index,
    label: t.label,
    mb: t.mb,
    bytes: t.bytes,
    strength: t.strength,
    tradeoff: t.tradeoff,
    recommended: t.recommended,
    desktopAndTabletOnly: t.desktopAndTabletOnly,
    runtimeRef: t,
  }),
);

export const DEPTH_FAMILY: CapabilityFamily<DepthTierRuntimeRef> = {
  id: ACTIVE_DEPTH_FAMILY.id,
  kind: "depth",
  label: ACTIVE_DEPTH_FAMILY.label,
  inferenceLongEdge: ACTIVE_DEPTH_FAMILY.inferenceLongEdge,
  tiers: TIERS,
  consent: {
    title: "Download depth estimation",
    switchTitle: "Change depth model size",
    body: "Relight estimates a depth map of your photo on-device (Depth Anything V2, by the original authors) so it can shade surfaces as you move the light. The model downloads once and runs entirely in this browser — your photo never leaves this tab.",
    switchBody:
      "The depth model is already on this device. Re-running costs nothing and the model never re-downloads.",
    privacy: [
      "Model + your photo stay in this browser tab.",
      "One download — cached for future visits, even offline.",
      "No analytics, telemetry, or remote calls of any kind.",
    ],
    downloadVerb: "Download",
    useVerb: "Use",
  },
  status: {
    inProgressLabel: "Estimating depth…",
    connectingLabel: "Loading model…",
    readyMessage: "Depth ready — drag the sun to relight.",
    pausedMessage: "Depth estimation paused.",
  },
};

/** Default tier the Relight tool requests (Fast / q8). */
export const DEFAULT_DEPTH_TIER = TIERS[0]!;
