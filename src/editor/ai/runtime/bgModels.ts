// bgModels.ts — Single source of truth for the background-removal
// model family + its quality tiers.
//
// Why this exists: the previous setup had model facts scattered across
// five files — MODEL_REGISTRY in segment.ts (repo + dtype),
// QUALITY_BYTE_ESTIMATES in segment.ts (mb), TIERS in
// MaskConsentDialog.tsx (label + copy), QUALITY_META in RemoveBgPanel.tsx
// (label + mb again), QUALITY_KEYS in useSubjectMask.ts (id ↔ index).
// Every model swap meant chasing the same numbers through five files
// and the slightest drift between them produced wrong UI copy. This
// module collapses all of it into one declaration so a future swap
// (BEN2 once it runs in WebAssembly, BiRefNet once the WebGPU storage-
// buffer ceiling lifts, briaai/RMBG-2.0 if the gating is removed) is
// a single edit + a re-test.
//
// UI components import only the *capability* surface — `getActiveTiers`,
// `getTierById`, `tiersForLayout`. They never see "ISNet" or "fp16";
// they read tier objects with `id`, `label`, `mb`, `strength`,
// `tradeoff`, etc. The runtime imports `getTierById(quality)` to get
// the underlying `repo` + `dtype` it needs to drive transformers.js.
//
// Multi-model future: register additional families below, expose a
// settings UI to flip ACTIVE_FAMILY, and persist the choice. No UI
// component needs to change as long as new families fill out the same
// `BgModelTier` shape.

import type { Layout } from "../../types";

/** Tier identifier shared with `toolState.bgQuality` (numeric index)
 *  and the consent dialog's radio group. Stable across model swaps —
 *  small/medium/large is a contract with persisted preferences and
 *  the cache probe, not a property of any particular model family. */
export type BgQuality = "small" | "medium" | "large";

/** Stable order. `bgQuality` in toolState is an index into this array
 *  (0/1/2). Persisted across sessions, so don't reorder without a
 *  migration. */
export const QUALITY_KEYS: readonly BgQuality[] = ["small", "medium", "large"] as const;

/** Per-tier descriptor. UI surfaces read these fields directly; they
 *  never have to know which model family is active. The `repo` and
 *  `dtype` fields are runtime-only — exported on the same object only
 *  so the registry stays a single source of truth, not because UI
 *  needs them. */
export interface BgModelTier {
  /** Stable id used by toolState, the cache probe, and the persisted
   *  preference. Decoupled from the underlying repo so a future model
   *  swap doesn't invalidate users' saved tier preferences. */
  id: BgQuality;
  /** Numeric index into `QUALITY_KEYS`. Mirrors `toolState.bgQuality`
   *  so callers can patchTool without re-deriving the order. */
  index: number;
  /** User-facing tier name shown on radio rows + panel readout. */
  label: string;
  /** Approximate download size in MB. Real size resolves once the
   *  network responds; this is the pre-flight estimate so the dialog
   *  shows "0 / 84 MB" before the lib's first chunk arrives. */
  mb: number;
  /** Pre-computed `mb * 1024 * 1024` for callers that want bytes
   *  (DetectionProgressCard's expectedTotal, the friendly stall copy). */
  bytes: number;
  /** Primary hint line — answers "why pick this tier?". */
  strength: string;
  /** Trade-off line — what the user gives up. Honest about the cost. */
  tradeoff: string;
  /** When true, dialog tags the tier with a "Recommended" pill. */
  recommended?: boolean;
  /** When true, hidden on the small-screen mobile layout. Used for
   *  tiers whose download size is impractical for phone storage. */
  desktopAndTabletOnly?: boolean;
  // —— Runtime-only fields. UI never reads these. ——
  /** HF repo id passed to `pipeline()`. */
  repo: string;
  /** ONNX dtype variant — selects which file under `<repo>/onnx/` to
   *  fetch. Different dtypes are different files, so switching tiers
   *  doesn't re-download what's on disk. */
  dtype: string;
}

/** A model family is a related set of tiers — same architecture, same
 *  HF repo, just different precision/dtype variants. Adding multi-
 *  model support means registering more families and exposing a
 *  switcher; the per-tier UI shape is unchanged. */
export interface BgModelFamily {
  /** Internal id (used for analytics + future settings persistence). */
  id: string;
  /** Display name if we ever add a model picker (not surfaced today). */
  label: string;
  /** Long-edge cap fed to the worker for this family. Each model has
   *  its own intrinsic preprocessor input size; sending bigger pixels
   *  is wasted memory in the worker. */
  inferenceLongEdge: number;
  /** Ordered small → large. Length must match `QUALITY_KEYS`. */
  tiers: readonly BgModelTier[];
}

/** ISNet (DIS) — general-purpose foreground segmentation.
 *  Trained on the DIS dataset, which spans humans, animals, products,
 *  and scenery. Replaced Xenova/modnet (portraits-only, returned
 *  empty masks for pets and products). q8 / fp16 / fp32 ONNX dumps
 *  are all in v4's CUSTOM_ARCHITECTURES_MAPPING ("isnet"). */
export const ISNET: BgModelFamily = {
  id: "isnet",
  label: "ISNet (DIS)",
  inferenceLongEdge: 1024,
  tiers: [
    {
      id: "small",
      index: 0,
      label: "Fast",
      mb: 42,
      bytes: 42 * 1024 * 1024,
      strength: "Quickest to download and run — fits any device.",
      tradeoff: "Softer around hair, fur, and glass edges.",
      repo: "onnx-community/ISNet-ONNX",
      dtype: "q8",
    },
    {
      id: "medium",
      index: 1,
      label: "Better",
      mb: 84,
      bytes: 84 * 1024 * 1024,
      strength: "Sharper edges around hair and fine detail.",
      tradeoff: "Roughly 2× the first-run download.",
      recommended: true,
      repo: "onnx-community/ISNet-ONNX",
      dtype: "fp16",
    },
    {
      id: "large",
      index: 2,
      label: "Best",
      mb: 168,
      bytes: 168 * 1024 * 1024,
      strength: "Highest fidelity for hair, fur, and glass.",
      tradeoff: "Heaviest tier; best on a fast connection.",
      desktopAndTabletOnly: true,
      repo: "onnx-community/ISNet-ONNX",
      dtype: "fp32",
    },
  ],
};

/** The family the editor ships today. To swap models, change this
 *  constant and re-run the bake-off harness. The cache key embeds the
 *  repo, so users keep their previously-cached bytes for the old
 *  family — they only re-download when they actively pick a tier
 *  whose repo changed. */
export const ACTIVE_FAMILY: BgModelFamily = ISNET;

// ————— Public selectors. UI imports these. —————

/** All tiers for the active family in stable small → large order. */
export function getActiveTiers(): readonly BgModelTier[] {
  return ACTIVE_FAMILY.tiers;
}

/** Tiers visible at this layout. The mobile filter drops the
 *  `desktopAndTabletOnly` tier so phones don't see a download size
 *  they can't realistically commit to. */
export function tiersForLayout(layout: Layout): BgModelTier[] {
  if (layout === "mobile") {
    return ACTIVE_FAMILY.tiers.filter((t) => !t.desktopAndTabletOnly);
  }
  return [...ACTIVE_FAMILY.tiers];
}

/** Lookup by stable id. Used by segment.ts (for repo/dtype),
 *  RemoveBgPanel (for label/mb), and preferredQuality (for index). */
export function getTierById(id: BgQuality): BgModelTier {
  const tier = ACTIVE_FAMILY.tiers.find((t) => t.id === id);
  if (!tier) {
    // QUALITY_KEYS is the contract; ACTIVE_FAMILY must register every
    // entry. Surfacing a real Error here means a registry mismatch
    // shows up in dev rather than as a silent fall-through to a
    // "default" tier with the wrong copy.
    throw new Error(`bgModels: no tier registered for id "${id}"`);
  }
  return tier;
}

/** Lookup by numeric index (`toolState.bgQuality`). Falls back to
 *  the smallest tier if the index is out of range — covers stale
 *  persistence after a future migration. */
export function getTierByIndex(idx: number): BgModelTier {
  return ACTIVE_FAMILY.tiers[idx] ?? ACTIVE_FAMILY.tiers[0]!;
}

/** Translate stable id → numeric index for toolState patches. */
export function indexForQuality(id: BgQuality): number {
  return ACTIVE_FAMILY.tiers.findIndex((t) => t.id === id);
}

/** Inference long-edge cap — segment.ts caps the bitmap to this
 *  before posting to the worker so we don't pay the 24 MP memory
 *  tax for a model that resizes to its intrinsic resolution
 *  internally anyway. */
export function getInferenceLongEdge(): number {
  return ACTIVE_FAMILY.inferenceLongEdge;
}
