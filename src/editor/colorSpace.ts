// colorSpace.ts — Wide-gamut (display-p3) canvas support.
//
// Most modern displays cover ~95-100% of the Display P3 gamut, but
// `<canvas>` defaults to sRGB and clips wide-gamut source pixels to
// that smaller volume. Browsers that support `colorSpace: "display-p3"`
// on `getContext("2d", …)` can render the full P3 gamut directly.
//
// What changes when we opt in:
//   • iPhone wide-gamut JPEGs and HEICs render with their original
//     saturated reds/greens instead of the sRGB-clipped fade.
//   • ICC-tagged P3 PNGs / WebPs preserve their wide colors.
//   • `drawImage` of an sRGB source onto a P3 canvas does the right
//     gamut conversion automatically — sRGB content does NOT get
//     visually inflated.
//
// What stays the same: pixel-manipulation tools (adjust, filter,
// redact …) read/write ImageData in whatever colorSpace the canvas
// uses; they're colorSpace-agnostic since they operate on the 0-255
// channel values directly.
//
// Browsers without P3 support fall back to sRGB silently. We still
// pass the option — `getContext` ignores unknown attrs.

let supportsP3: boolean | null = null;

/** True iff the current browser exposes `colorSpace: "display-p3"`. */
export function isDisplayP3Supported(): boolean {
  if (supportsP3 !== null) return supportsP3;
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const ctx = probe.getContext("2d", { colorSpace: "display-p3" });
    // The spec says `getContextAttributes()` should reflect what was
    // actually used — checking it tells us if the request stuck.
    const attrs = ctx?.getContextAttributes?.();
    supportsP3 = (attrs?.colorSpace as string | undefined) === "display-p3";
  } catch {
    supportsP3 = false;
  }
  return supportsP3;
}

/**
 * The colorSpace to use when creating new 2D contexts. `display-p3`
 * where supported, `srgb` everywhere else. Bound at module load to
 * keep render paths consistent throughout the session.
 */
export const PREFERRED_COLOR_SPACE: PredefinedColorSpace = isDisplayP3Supported()
  ? "display-p3"
  : "srgb";

interface Get2DOptions {
  /** Hint that this canvas will be a heavy `getImageData` consumer
   *  (preview bakes, pixel-loop adjustments, etc.). Browsers fall back
   *  to a CPU-side backing store, which makes readbacks ~10× faster
   *  but slightly slower for `drawImage` / compositing. Only set this
   *  on scratch canvases that fully round-trip through ImageData —
   *  not on display canvases. */
  willReadFrequently?: boolean;
}

/**
 * Get a 2D context with the editor's preferred colorSpace. Calling
 * `canvas.getContext("2d")` again after this returns the same
 * (already-bound) context, so consumers that don't know about
 * colorSpace continue to work without code changes.
 *
 * Context attributes are bound on the *first* call to `getContext` for
 * a given canvas — pass `willReadFrequently: true` here, before any
 * other code calls `canvas.getContext("2d")`.
 */
export function get2DContext(
  canvas: HTMLCanvasElement,
  opts?: Get2DOptions,
): CanvasRenderingContext2D | null {
  return canvas.getContext("2d", {
    colorSpace: PREFERRED_COLOR_SPACE,
    willReadFrequently: opts?.willReadFrequently ?? false,
  });
}
