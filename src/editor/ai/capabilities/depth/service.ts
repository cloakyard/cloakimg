// service.ts — Depth-estimation service. Thin facade over the generic
// CapabilityService primitive, mirroring detect-face/service.ts:
//   • Owns the depth family (Fast / Better tiers).
//   • Probes the HF CacheStorage for the picked tier's bytes (implicit
//     consent on a cache hit — the user accepted the download before).
//   • Wraps `estimateDepth` (which dispatches runAi({kind:"depth"})) as
//     the runner the service hands the worker.
//
// Public API mirrors the segmentation / face surfaces so the Relight
// panel reads the same way as every other AI tool.

import { releaseCanvas } from "../../../doc";
import { CapabilityService, type RunnerArgs } from "../../capability/service";
import type { CapabilityState } from "../../capability/types";
import { estimateDepth, isDepthModelCached } from "../../runtime/depth";
import type { DepthModelTier } from "../../runtime/depthModels";
import { DEFAULT_DEPTH_TIER, DEPTH_FAMILY, type DepthTierRuntimeRef } from "./family";

const service = new CapabilityService<HTMLCanvasElement>({
  family: DEPTH_FAMILY,
  // Transformers.js model: the HF CacheStorage probe is the real
  // "already downloaded" signal (unlike same-origin assets which fall
  // back to a localStorage marker).
  isTierCached: async (tier) => isDepthModelCached(tier.runtimeRef as DepthTierRuntimeRef),
  // The depth map is a pooled canvas — hand it back when superseded /
  // invalidated so a doc swap doesn't leak a full-res buffer.
  onResultDropped: (canvas) => releaseCanvas(canvas),
  // First run cold-starts the ~25 MB model over the network. 45 s is a
  // touch longer than segmentation's 30 s because depth has no
  // smaller-than-Fast tier to fall back to on a slow connection.
  stall: {
    timeoutMs: 45_000,
    message:
      "Depth estimation didn't respond. Reload the page and try again — your photo stayed on this device.",
  },
});

export function getDepthState(): CapabilityState<HTMLCanvasElement> {
  return service.getState();
}

export function subscribeDepthState(
  listener: (s: CapabilityState<HTMLCanvasElement>) => void,
): () => void {
  return service.subscribe(listener);
}

export function peekDepth(source: HTMLCanvasElement): HTMLCanvasElement | null {
  return service.peek(source);
}

export function cancelDepth(): void {
  service.cancel();
}

export function invalidateDepth(): void {
  service.invalidate();
}

export function grantDepthConsent(): void {
  service.grantConsent();
}

export function denyDepthConsent(): void {
  service.denyConsent();
}

export function clearDepthDeny(): void {
  service.clearDeny();
}

export function hasDepthConsent(): boolean {
  return service.hasConsent();
}

export function requestDepthTierPicker(): void {
  service.requestTierPicker(DEFAULT_DEPTH_TIER.id);
}

export async function probeDepthCache(): Promise<boolean> {
  return service.probeCacheForTier(DEFAULT_DEPTH_TIER);
}

/** Ensure a depth map for `source` exists in cache, running inference if
 *  it doesn't. May reject with CapabilityConsentError the first time —
 *  the consent host handles that flow. */
export async function ensureDepth(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  return service.run(source, DEFAULT_DEPTH_TIER, depthRunner);
}

/** Wait for an in-flight or pending consent flow to settle. */
export function waitForDepthResolution(source: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  return service.waitForResolution(source, DEFAULT_DEPTH_TIER.id);
}

async function depthRunner({
  source,
  signal,
  onProgress,
  tier,
}: RunnerArgs): Promise<HTMLCanvasElement> {
  return estimateDepth(source, {
    tier: tier.runtimeRef as DepthModelTier,
    signal,
    onProgress,
  });
}
