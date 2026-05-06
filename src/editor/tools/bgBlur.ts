// bgBlur.ts — Portrait-mode-style depth-of-field blur.
//
// Pipeline:
//   1. Gaussian-blur a copy of the source via `ctx.filter = "blur(Npx)"`
//      — browser-native, runs on the GPU compositor, much faster than
//      a JS box-blur for the radii we use (4–40 px).
//   2. Composite the sharp + blurred copies through the subject mask
//      so the kept side stays crisp.
//
// This shares the central subject-mask service: when this tool runs
// after the user has scoped Adjust / Filter / etc. to the subject,
// the cut is already cached and the bake is just two drawImages.

import { acquireCanvas, releaseCanvas } from "../doc";
import { applyMaskScope, type MaskScope } from "../subjectMask";

/** Map slider 0..1 → blur radius in CSS pixels. 0 = no blur (returns
 *  source unchanged); 1 = 40 px which reads as a very strong portrait
 *  background. The mapping is linear since the perceptual jump from
 *  4 → 8 px feels about the same as 32 → 40 px on a 1-MP preview. */
export function blurAmountToPx(amount: number): number {
  return Math.max(0, Math.min(1, amount)) * 40;
}

/** Bake a portrait blur. `scope` selects which side of the mask gets
 *  the blur:
 *    1 = blur subject, keep background sharp
 *    2 = blur background, keep subject sharp (the typical "portrait
 *        mode" look)
 *    0 = blur the whole image (no mask required)
 *
 *  When `mask` is null and scope != 0, falls back to whole-image blur
 *  so the tool still does something useful while detection is in
 *  flight. Returns a fresh pooled canvas — the caller is responsible
 *  for `releaseCanvas` once the result has been read. */
export function bakeBgBlur(
  src: HTMLCanvasElement,
  mask: HTMLCanvasElement | null,
  scope: MaskScope,
  amount: number,
): HTMLCanvasElement {
  const radius = blurAmountToPx(amount);
  if (radius < 0.5) {
    // Identity: clone the source so callers can release uniformly.
    const copy = acquireCanvas(src.width, src.height);
    const cctx = copy.getContext("2d");
    if (cctx) cctx.drawImage(src, 0, 0);
    return copy;
  }

  // 1. Build the blurred surface. The filter has to be set BEFORE the
  //    drawImage call for it to apply.
  const blurred = acquireCanvas(src.width, src.height);
  const bctx = blurred.getContext("2d");
  if (!bctx) return blurred;
  bctx.filter = `blur(${radius}px)`;
  bctx.drawImage(src, 0, 0);
  bctx.filter = "none";

  // 2. No mask or whole-image scope → just return the blurred canvas.
  if (scope === 0 || !mask) return blurred;

  // 3. Composite via the shared mask helper. `applyMaskScope` acquires
  //    its own pooled canvas, so we release the intermediate `blurred`
  //    one back to the pool before returning the result.
  const composed = applyMaskScope(src, blurred, mask, scope);
  if (composed !== blurred) releaseCanvas(blurred);
  return composed;
}

/** True when the params produce a no-op so callers can skip both the
 *  preview bake and the history commit. */
export function isBgBlurIdentity(amount: number): boolean {
  return blurAmountToPx(amount) < 0.5;
}
