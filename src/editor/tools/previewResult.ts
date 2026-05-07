// previewResult.ts — Shared shape returned by every per-tool live
// preview hook (useAdjustPreview / useBgBlurPreview / useLevelsPreview
// / useHslPreview).
//
// The wrapper carries both the canvas AND a monotonic version that
// the hook bumps on every successful bake. Two reasons for the
// version:
//
//   1. The canvas itself comes from a small LIFO pool. A consecutive
//      pair of bakes can hand back the same HTMLCanvasElement with
//      different pixels — Fabric's bg-image cache wouldn't notice the
//      pixel change without something else nudging it.
//   2. Tools route both fields into `useStageProps`, where
//      `shallowEqualStageProps` compares them. A version change forces
//      `ImageCanvas`'s bg-image effect to re-fire, which calls
//      `bg.setElement(...) + dirty=true` and gets Fabric to
//      re-rasterise.
//
// New preview hooks should import these instead of redefining the
// shape — it's the contract `useStageProps({ previewCanvas,
// previewVersion })` reads against.

export interface PreviewResult {
  canvas: HTMLCanvasElement | null;
  version: number;
}

export const EMPTY_PREVIEW: PreviewResult = { canvas: null, version: 0 };
