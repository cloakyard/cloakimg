// depthModels.ts — Single source of truth for the depth-estimation
// model family + its quality tiers. Mirrors bgModels.ts's shape so the
// generic CapabilityService + consent modal render it without any
// depth-specific UI code.
//
// Model: Depth-Anything-V2-Small (ONNX via transformers.js
// `depth-estimation` pipeline). 24.8M params; dtype "q8" resolves to
// `onnx/model_quantized.onnx` (~27 MB) and runs comfortably on a phone,
// while "fp16" → `model_fp16.onnx` (~50 MB) sharpens edges for the
// relight normals. Output is an inverse-depth map (near = bright), which
// is exactly what the relight bake wants for surface-normal estimation.
// We stay on q8, not the smaller q4f16 (~19 MB): 4-bit weights band the
// depth map, and the bake reads its *gradient*, so quantisation noise
// surfaces directly as shading artifacts.
//
// The runtime fields (repo + dtype) live on the same object as the UI
// copy so a future model swap (Depth-Anything-V2-Base, Metric3D, …) is a
// single edit here.

/** Stable tier id — `relightQuality`-style index contracts could key off
 *  this later. Today depth ships two tiers; "fast" is the default. */
export type DepthQuality = "fast" | "better";

export interface DepthModelTier {
  id: DepthQuality;
  index: number;
  label: string;
  mb: number;
  bytes: number;
  strength: string;
  tradeoff: string;
  recommended?: boolean;
  desktopAndTabletOnly?: boolean;
  // —— Runtime-only fields. UI never reads these. ——
  /** HF repo id passed to `pipeline("depth-estimation", repo)`. */
  repo: string;
  /** ONNX dtype variant — selects which file under `<repo>/onnx/` to
   *  fetch. Different dtypes are different files, so switching tiers
   *  doesn't re-download what's already on disk. */
  dtype: string;
}

export interface DepthModelFamily {
  id: string;
  label: string;
  /** Long-edge cap fed to the worker. Depth-Anything resizes to a
   *  multiple-of-14 grid internally (~518 on the long edge for the
   *  small model); capping the transferred bitmap there avoids paying
   *  the 24 MP memory tax for pixels the preprocessor would discard. */
  inferenceLongEdge: number;
  tiers: readonly DepthModelTier[];
}

/** Depth-Anything-V2-Small — general monocular depth. */
export const DEPTH_ANYTHING_V2_SMALL: DepthModelFamily = {
  id: "depth-anything-v2-small",
  label: "Depth Anything V2 (Small)",
  inferenceLongEdge: 518,
  tiers: [
    {
      id: "fast",
      index: 0,
      label: "Fast",
      mb: 28,
      bytes: 28 * 1024 * 1024,
      strength: "Quickest to download and run — fits any device.",
      tradeoff: "Slightly softer depth edges on fine detail.",
      recommended: true,
      repo: "onnx-community/depth-anything-v2-small",
      dtype: "q8",
    },
    {
      id: "better",
      index: 1,
      label: "Better",
      mb: 49,
      bytes: 49 * 1024 * 1024,
      strength: "Sharper depth edges for cleaner relight on detailed scenes.",
      tradeoff: "Roughly 2× the first-run download.",
      repo: "onnx-community/depth-anything-v2-small",
      dtype: "fp16",
    },
  ],
};

/** The family the editor ships today. */
export const ACTIVE_DEPTH_FAMILY: DepthModelFamily = DEPTH_ANYTHING_V2_SMALL;

export function getDepthTiers(): readonly DepthModelTier[] {
  return ACTIVE_DEPTH_FAMILY.tiers;
}

export function getDepthTierById(id: DepthQuality): DepthModelTier {
  const tier = ACTIVE_DEPTH_FAMILY.tiers.find((t) => t.id === id);
  if (!tier) throw new Error(`depthModels: no tier registered for id "${id}"`);
  return tier;
}

/** Inference long-edge cap — depth.ts caps the bitmap to this before
 *  posting to the worker. */
export function getDepthInferenceLongEdge(): number {
  return ACTIVE_DEPTH_FAMILY.inferenceLongEdge;
}
