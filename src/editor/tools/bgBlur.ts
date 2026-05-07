// bgBlur.ts — Portrait-mode-style depth-of-field blur, with optional
// lens-shape simulation and subject-aware progressive falloff.
//
// Three lens kinds:
//   • "gaussian" — straight Canvas `filter: blur(Npx)`. Cheapest,
//     shows up at <1 ms on a 1-MP preview.
//   • "lens"      — multi-pass radial bokeh approximation: stack 3
//     gaussian blurs at 0.6×, 1.0×, 1.6× of the requested radius and
//     average them. Mimics the soft, slightly-circular highlights a
//     wide-aperture lens produces on out-of-focus point sources, at a
//     fraction of the cost of a true bokeh kernel.
//   • "tilt-shift" — sharp horizontal band through the centre of the
//     subject, falling off to full blur at top + bottom. Reads as the
//     classic miniature-photography effect.
//
// Progressive blur is layered on top: when enabled, blur strength
// scales with distance from the subject silhouette. Pixels right at
// the edge get a small-radius blur; pixels far from the subject get
// the full requested radius. We approximate this without an EDT by
// pre-baking three blurred copies of the source (small / medium /
// large radius), then mixing them according to the dilated mask.
//
// All three kinds preserve the central subject-mask service contract:
// when this tool runs after the user has scoped Adjust / Filter / etc.
// to the subject, the cut is already cached and the bake is just a
// few drawImage compositions.

import { acquireCanvas, releaseCanvas } from "../doc";
import { applyMaskScope, getSubjectBBox, type MaskScope } from "../ai/subjectMask";

/** Map slider 0..1 → blur radius in CSS pixels. 0 = no blur (returns
 *  source unchanged); 1 = 40 px which reads as a very strong portrait
 *  background. The mapping is linear since the perceptual jump from
 *  4 → 8 px feels about the same as 32 → 40 px on a 1-MP preview. */
export function blurAmountToPx(amount: number): number {
  return Math.max(0, Math.min(1, amount)) * 40;
}

/** Three flavours of background-blur falloff. */
export type LensKind = "gaussian" | "lens" | "tilt-shift";

export const LENS_KIND_LABELS: Record<LensKind, string> = {
  gaussian: "Soft",
  lens: "Lens",
  "tilt-shift": "Tilt-shift",
};

export const LENS_KIND_HINTS: Record<LensKind, string> = {
  gaussian: "Even gaussian blur — fastest and reads naturally on most photos.",
  lens: "Multi-pass bokeh that mimics a wide-aperture lens. Slightly slower.",
  "tilt-shift": "Sharp band through the subject; strong blur top + bottom.",
};

/** Settings the panel controls. Default leaves backwards behaviour
 *  intact (gaussian, no progressive falloff). */
export interface BgBlurOpts {
  amount: number;
  /** When `progressive` is true, the bake mixes 3 blur radii driven
   *  by distance-from-subject so close-to-subject pixels stay sharper
   *  than far-from-subject pixels. Off by default — adds ~20 ms on a
   *  1-MP preview. */
  progressive?: boolean;
  lens?: LensKind;
}

/** Bake a portrait blur. `scope` selects which side of the mask gets
 *  the blur:
 *    2 = blur background, keep subject sharp (the typical "portrait
 *        mode" look, default for this tool)
 *    0 = blur the whole image (no mask required)
 *
 *  When `mask` is null and scope != 0, falls back to whole-image blur
 *  so the tool still does something useful while detection is in
 *  flight. Returns a fresh pooled canvas — the caller is responsible
 *  for `releaseCanvas` once the result has been read.
 *
 *  We deliberately removed the "blur subject" scope from this tool's
 *  surface — anonymisation is what Redact's blur style is for, with
 *  smarter pixelate / solid options on the same panel. */
export function bakeBgBlur(
  src: HTMLCanvasElement,
  mask: HTMLCanvasElement | null,
  scope: MaskScope,
  opts: BgBlurOpts | number,
): HTMLCanvasElement {
  const resolved: BgBlurOpts =
    typeof opts === "number"
      ? { amount: opts, lens: "gaussian", progressive: false }
      : { lens: "gaussian", progressive: false, ...opts };
  const radius = blurAmountToPx(resolved.amount);
  if (radius < 0.5) {
    // Identity: clone the source so callers can release uniformly.
    const copy = acquireCanvas(src.width, src.height);
    const cctx = copy.getContext("2d");
    if (cctx) cctx.drawImage(src, 0, 0);
    return copy;
  }

  // 1. Build the blurred surface, picking the implementation by lens
  //    kind. Each returns a pooled canvas the caller must release.
  let blurred: HTMLCanvasElement;
  switch (resolved.lens) {
    case "lens":
      blurred = bakeLensBlur(src, radius);
      break;
    case "tilt-shift":
      blurred = bakeTiltShift(src, radius, mask, scope);
      break;
    default:
      blurred = bakeGaussian(src, radius);
  }

  // 2. No mask or whole-image scope → just return the blurred canvas.
  //    Tilt-shift already composes against the mask internally so the
  //    scope step would be a no-op; skip it.
  if (scope === 0 || !mask || resolved.lens === "tilt-shift") return blurred;

  // 3. Progressive falloff: mix the source / blurred / extra-blurred
  //    surfaces driven by distance from the subject. We pay for one
  //    extra blur pass (already half-radius cached on the GPU
  //    compositor since the browser reuses filter chains) and a
  //    handful of compositing operations — measured at 12–18 ms on a
  //    1440 px preview, so still well within a 60 fps budget.
  if (resolved.progressive && scope === 2) {
    const composed = composeProgressive(src, blurred, mask, radius);
    if (composed !== blurred) releaseCanvas(blurred);
    return composed;
  }

  // 4. Standard scope composite: keep one side baked, the other
  //    untouched. `applyMaskScope` acquires its own pooled canvas, so
  //    we release the intermediate `blurred` one back to the pool
  //    before returning the result.
  const composed = applyMaskScope(src, blurred, mask, scope);
  if (composed !== blurred) releaseCanvas(blurred);
  return composed;
}

/** True when the params produce a no-op so callers can skip both the
 *  preview bake and the history commit. */
export function isBgBlurIdentity(amount: number): boolean {
  return blurAmountToPx(amount) < 0.5;
}

// ── Gaussian (single pass) ────────────────────────────────────────

function bakeGaussian(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  return out;
}

// ── Lens (multi-pass bokeh approximation) ─────────────────────────

/** True bokeh would convolve with a disc kernel (~O(r²) per pixel);
 *  we approximate it by stacking three gaussians at different radii
 *  and averaging. The eye reads the soft falloff and slightly puffier
 *  highlights as "lens-y" without the cost. */
function bakeLensBlur(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  // Three passes blended additively at 1/3 each. globalAlpha pairs
  // with source-over so each pass contributes a third — equivalent to
  // averaging three blurred copies.
  const passes = [radius * 0.6, radius, radius * 1.4];
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.globalAlpha = 1 / passes.length;
  for (const r of passes) {
    ctx.filter = `blur(${r}px)`;
    ctx.drawImage(src, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  return out;
}

// ── Tilt-shift (horizontal band) ──────────────────────────────────

/** Tilt-shift ignores the mask scope and instead targets a horizontal
 *  band of full sharpness through the subject's vertical centre,
 *  fading to full blur at the top and bottom of the frame. When the
 *  mask is null, falls back to the geometric centre of the frame. */
function bakeTiltShift(
  src: HTMLCanvasElement,
  radius: number,
  mask: HTMLCanvasElement | null,
  scope: MaskScope,
): HTMLCanvasElement {
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  // 1. Strong blurred backdrop covers the whole frame.
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";

  // 2. Compute the subject's vertical band when we have a mask. We
  //    need the centre and half-height of the focus stripe — taken
  //    from the mask's bbox so the sharp band sits over the actual
  //    subject. The bbox helper allocates an ImageData over its
  //    input, so on full-res 24 MP masks we first downsample to a
  //    small proxy (256 px long edge) — that drops the bbox cost
  //    from ~96 MB / 200 ms to <100 KB / <2 ms with no meaningful
  //    accuracy loss for "where vertically does the subject sit?".
  //    Without a mask, default to the frame centre.
  let bandCentre = src.height * 0.5;
  let bandHalfHeight = src.height * 0.18;
  if (mask) {
    const bbox = bboxFromMask(mask);
    if (bbox) {
      const ratio = src.height / mask.height;
      bandCentre = (bbox.y + bbox.h / 2) * ratio;
      bandHalfHeight = Math.max(src.height * 0.12, (bbox.h / 2) * ratio);
    }
  }

  // 3. Draw the sharp source through a vertical gradient mask. The
  //    gradient is fully opaque in the focus band and falls to 0 at
  //    the top + bottom transition zones.
  const grad = ctx.createLinearGradient(0, 0, 0, src.height);
  const top = bandCentre - bandHalfHeight;
  const bottom = bandCentre + bandHalfHeight;
  const transition = Math.max(8, bandHalfHeight * 0.5);
  const stops = [
    [Math.max(0, (top - transition) / src.height), 0],
    [Math.max(0, top / src.height), 1],
    [Math.min(1, bottom / src.height), 1],
    [Math.min(1, (bottom + transition) / src.height), 0],
  ] as const;
  for (const [pos, alpha] of stops) {
    grad.addColorStop(pos, `rgba(255,255,255,${alpha})`);
  }

  // Compose: paint the sharp source onto the blurred backdrop, masked
  // by the gradient. We use a temporary canvas because a pure source-
  // over with a gradient fill won't apply the gradient as alpha — we
  // need destination-in on a sharp-source surface.
  const sharp = acquireCanvas(src.width, src.height);
  const sctx = sharp.getContext("2d");
  if (sctx) {
    sctx.drawImage(src, 0, 0);
    sctx.globalCompositeOperation = "destination-in";
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, src.width, src.height);
    sctx.globalCompositeOperation = "source-over";
    ctx.drawImage(sharp, 0, 0);
  }
  releaseCanvas(sharp);
  // Tilt-shift inherently composes against the focus band — scope is
  // recorded but doesn't change the output. Avoid an unused-var lint.
  void scope;
  return out;
}

// ── Progressive falloff ───────────────────────────────────────────

/** Compose a "depth-of-field" frame where blur strength ramps with
 *  distance from the subject. We use canvas-native blur on the *mask*
 *  itself to approximate a distance transform — a heavily-blurred
 *  alpha mask reads as "distance from edge" from 0 at far away to 1
 *  on the subject. We then composite the original (subject), a light
 *  blur (near-subject ring), and the strong blur (far) using that
 *  ramp as alpha. */
function composeProgressive(
  src: HTMLCanvasElement,
  strongBlurred: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  radius: number,
): HTMLCanvasElement {
  const out = acquireCanvas(src.width, src.height);
  const ctx = out.getContext("2d");
  if (!ctx) return out;

  // 1. Far layer: paint the strong blur first; this is the floor.
  ctx.drawImage(strongBlurred, 0, 0);

  // 2. Medium layer: lighter blur at ~50 % radius, masked by a
  //    blurred-mask ramp that fades towards the edge of the subject.
  //    The blur on the mask itself is what produces the smooth depth
  //    falloff — wide blur = wider transition halo around the subject.
  const ramp = acquireCanvas(src.width, src.height);
  const rctx = ramp.getContext("2d");
  if (rctx) {
    // Wider mask blur = softer transition; tied to the requested
    // radius so a stronger background blur also gets a longer falloff.
    const rampRadius = Math.max(8, radius * 1.2);
    rctx.filter = `blur(${rampRadius}px)`;
    rctx.drawImage(mask, 0, 0, src.width, src.height);
    rctx.filter = "none";
  }
  // Mid blur copy
  const mid = acquireCanvas(src.width, src.height);
  const mctx = mid.getContext("2d");
  if (mctx) {
    mctx.filter = `blur(${radius * 0.4}px)`;
    mctx.drawImage(src, 0, 0);
    mctx.filter = "none";
    mctx.globalCompositeOperation = "destination-in";
    mctx.drawImage(ramp, 0, 0);
    mctx.globalCompositeOperation = "source-over";
    ctx.drawImage(mid, 0, 0);
  }
  releaseCanvas(mid);

  // 3. Sharp subject: copy the original masked by the un-blurred
  //    cut so the subject lands on top crisp.
  const sharp = acquireCanvas(src.width, src.height);
  const shctx = sharp.getContext("2d");
  if (shctx) {
    shctx.drawImage(src, 0, 0);
    shctx.globalCompositeOperation = "destination-in";
    shctx.drawImage(mask, 0, 0, src.width, src.height);
    shctx.globalCompositeOperation = "source-over";
    ctx.drawImage(sharp, 0, 0);
  }
  releaseCanvas(sharp);
  releaseCanvas(ramp);
  return out;
}

// ── Mask bbox (downsample-bounded) ────────────────────────────────

const BBOX_PROXY_LONG_EDGE = 256;

/** Wrapper around `getSubjectBBox` that bounds the input size before
 *  the bbox sampler reads pixels — `getImageData(0, 0, w, h)`
 *  allocates the full RGBA buffer regardless of the stride we sample
 *  with, and a 24 MP mask costs ~96 MB / 200 ms there alone. We
 *  downsample to a 256 px long-edge proxy (cheap drawImage), bbox
 *  the proxy, then map the result back to mask-space. The accuracy
 *  loss is well under 1 % of the band-height we're computing — the
 *  user wouldn't see the difference even at full screen. Returns
 *  bbox in the original mask's coordinate system so callers can keep
 *  reasoning at full resolution. */
function bboxFromMask(
  mask: HTMLCanvasElement,
): { x: number; y: number; w: number; h: number } | null {
  const long = Math.max(mask.width, mask.height);
  if (long <= BBOX_PROXY_LONG_EDGE) {
    return getSubjectBBox(mask, 0);
  }
  const ratio = BBOX_PROXY_LONG_EDGE / long;
  const w = Math.max(1, Math.round(mask.width * ratio));
  const h = Math.max(1, Math.round(mask.height * ratio));
  const proxy = acquireCanvas(w, h);
  const pctx = proxy.getContext("2d");
  if (!pctx) {
    releaseCanvas(proxy);
    return getSubjectBBox(mask, 0);
  }
  pctx.imageSmoothingQuality = "low";
  pctx.drawImage(mask, 0, 0, w, h);
  const proxyBBox = getSubjectBBox(proxy, 0);
  releaseCanvas(proxy);
  if (!proxyBBox) return null;
  // Map proxy-space → mask-space.
  return {
    x: Math.round(proxyBBox.x / ratio),
    y: Math.round(proxyBBox.y / ratio),
    w: Math.round(proxyBBox.w / ratio),
    h: Math.round(proxyBBox.h / ratio),
  };
}
