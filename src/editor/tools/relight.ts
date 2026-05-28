// relight.ts — Depth-aware directional relight bake.
//
// Treats the on-device depth map as a height-field, derives a per-pixel
// surface normal from its gradient, and shades each pixel by a point
// light the user positions over the photo (the draggable sun). The
// result is form-aware: surfaces facing the light brighten, surfaces
// turned away fall into shadow, and a soft distance falloff puts a
// believable hot-spot under the sun. A warmth control tints the lit
// side warm and the shadow side cool, the way real sunlight does.
//
// Pure CPU, single pass over precomputed Float arrays — same cost class
// as bakeAdjust, so it runs on the downsampled preview every drag and at
// full resolution once on apply.

import { acquireCanvas, releaseCanvas } from "../doc";

export interface RelightParams {
  /** Sun position in normalized image space (0..1). */
  sunX: number;
  sunY: number;
  /** Light height 0..1 → Z component of the light vector. Low = grazing
   *  side-light (strong directional shading); high = top-down (even). */
  elevation: number;
  /** Overall relight strength 0..1. 0 = identity (bake skipped). */
  intensity: number;
  /** 0..1, 0.5 = neutral. >0.5 warms the lit side / cools shadows. */
  warmth: number;
}

/** How hard the depth gradient bends the surface normal. Higher = more
 *  pronounced relief on textured / detailed scenes. */
const RELIEF = 5.5;
/** Distance falloff radius for the point light, in normalized units. */
const REACH = 0.85;
/** Peak brightening / darkening swing at intensity 1. */
const STRENGTH = 0.9;
/** Warm/cool tint gain (0..255 channel units) per unit of shade swing. */
const WARMTH_K = 55;

export function isRelightIdentity(p: RelightParams): boolean {
  return p.intensity <= 0;
}

/** Read a depth canvas as a 0..1 luminance Float array sized to (w, h).
 *  Resizes via the canvas pool when the depth map's dimensions differ
 *  from the target (e.g. preview bakes against a downsampled source). */
function readDepth(depthCanvas: HTMLCanvasElement, w: number, h: number): Float32Array {
  let sampleCanvas = depthCanvas;
  let temp: HTMLCanvasElement | null = null;
  if (depthCanvas.width !== w || depthCanvas.height !== h) {
    temp = acquireCanvas(w, h);
    const tctx = temp.getContext("2d");
    if (!tctx) {
      // Fall back to a flat field — relight degrades to a soft global
      // gradient rather than throwing. Hand the scratch back first so the
      // (rare) null-context path doesn't leak a pooled canvas.
      releaseCanvas(temp);
      const flat = new Float32Array(w * h);
      flat.fill(0.5);
      return flat;
    }
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = "high";
    tctx.drawImage(depthCanvas, 0, 0, w, h);
    sampleCanvas = temp;
  }
  const ctx = sampleCanvas.getContext("2d");
  const out = new Float32Array(w * h);
  if (ctx) {
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 0, p = 0; p < out.length; i += 4, p++) {
      out[p] = (data[i] ?? 0) / 255;
    }
  } else {
    out.fill(0.5);
  }
  // Hand the resize scratch back to the pool — the Float array is the
  // only thing we keep.
  if (temp) releaseCanvas(temp);
  return out;
}

/** Cached depth-derived surface normals, keyed on the depth canvas
 *  identity + target dimensions. The normals depend only on the depth
 *  gradient — NOT on the sun / intensity / warmth / elevation — so while
 *  the user drags those controls we recompute neither the depth readback
 *  (a getImageData + fill) nor the per-pixel normal `sqrt` field; only
 *  the cheap shading pass re-runs each frame. */
let normalCache: {
  depthCanvas: HTMLCanvasElement;
  w: number;
  h: number;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
} | null = null;

/** Only cache preview-sized normal fields. A one-shot full-resolution
 *  apply gets no reuse, so caching it would pin a ~290 MB normal map for
 *  nothing — recompute fresh and drop the cache above this size. */
const NORMAL_CACHE_MAX_PX = 3_000_000;

function getDepthNormals(
  depthCanvas: HTMLCanvasElement,
  w: number,
  h: number,
): { nx: Float32Array; ny: Float32Array; nz: Float32Array } {
  if (
    normalCache &&
    normalCache.depthCanvas === depthCanvas &&
    normalCache.w === w &&
    normalCache.h === h
  ) {
    return normalCache;
  }
  const depth = readDepth(depthCanvas, w, h);
  const normals = computeNormals(depth, w, h);
  normalCache = w * h <= NORMAL_CACHE_MAX_PX ? { depthCanvas, w, h, ...normals } : null;
  return normals;
}

/** Surface normals from the depth gradient (height-field). Pure and
 *  cacheable: depends only on `depth`, not on any light parameter. With
 *  nz=1 before normalising, |N|² = nx²+ny²+1, so a plain `sqrt` does the
 *  job — `Math.hypot`'s overflow-safe scaling is wasted on these bounded
 *  values and costs 2-4× per call. */
function computeNormals(
  depth: Float32Array,
  w: number,
  h: number,
): { nx: Float32Array; ny: Float32Array; nz: Float32Array } {
  const nx = new Float32Array(w * h);
  const ny = new Float32Array(w * h);
  const nz = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const yUp = y > 0 ? y - 1 : y;
    const yDn = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const xL = x > 0 ? x - 1 : x;
      const xR = x < w - 1 ? x + 1 : x;
      const dzdx = depth[y * w + xR]! - depth[y * w + xL]!;
      const dzdy = depth[yDn * w + x]! - depth[yUp * w + x]!;
      const nxRaw = -dzdx * RELIEF;
      const nyRaw = -dzdy * RELIEF;
      const nInv = 1 / Math.sqrt(nxRaw * nxRaw + nyRaw * nyRaw + 1);
      nx[idx] = nxRaw * nInv;
      ny[idx] = nyRaw * nInv;
      nz[idx] = nInv; // 1 * nInv
    }
  }
  return { nx, ny, nz };
}

/** Relight `source` using `depthCanvas`. Returns a fresh pooled canvas
 *  (caller releases it). The source is left untouched. Assumes a
 *  non-identity params set — callers gate on `isRelightIdentity`. */
export function bakeRelight(
  source: HTMLCanvasElement,
  depthCanvas: HTMLCanvasElement,
  p: RelightParams,
): HTMLCanvasElement {
  const w = source.width;
  const h = source.height;
  const out = acquireCanvas(w, h);
  const sctx = source.getContext("2d");
  const octx = out.getContext("2d");
  if (!sctx || !octx) {
    // Context unavailable (effectively never for a fresh pooled canvas).
    // Degrade to the original image rather than returning a canvas that
    // may still hold stale pixels from a prior pool tenant — drawImage
    // doesn't need the *source's* 2D context, only the output's.
    octx?.drawImage(source, 0, 0);
    return out;
  }

  const img = sctx.getImageData(0, 0, w, h);
  if (w * h > NORMAL_CACHE_MAX_PX) {
    // One-shot full-resolution apply (above the cache ceiling, so there's
    // no reuse to gain from materialising normals). Fuse the normal
    // derivation into the shade pass so we never allocate three w×h
    // Float32 normal arrays — ~200 MB at 24 MP, the transient-memory peak
    // that crashed memory-constrained tabs (iOS Safari) on Apply.
    const depth = readDepth(depthCanvas, w, h);
    shadeFromDepth(img.data, depth, w, h, p);
  } else {
    const { nx, ny, nz } = getDepthNormals(depthCanvas, w, h);
    shade(img.data, nx, ny, nz, w, h, p);
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Memory-lean shading for the full-resolution apply: derives each
 *  pixel's surface normal from the depth gradient inline and shades in a
 *  single pass — mathematically identical to `computeNormals` followed
 *  by `shade`, but without the three intermediate w×h normal arrays. The
 *  cached two-pass path above is still used for preview-sized bakes,
 *  where the normals are reused across slider drags. */
export function shadeFromDepth(
  px: Uint8ClampedArray,
  depth: Float32Array,
  w: number,
  h: number,
  p: RelightParams,
): void {
  const lz = 0.25 + p.elevation * 1.75;
  const lzSq = lz * lz;
  const invW = w > 1 ? 1 / (w - 1) : 0;
  const invH = h > 1 ? 1 / (h - 1) : 0;
  const k = p.intensity * STRENGTH;
  const warmGain = (p.warmth - 0.5) * 2 * WARMTH_K;
  const invReachSq = 1 / (REACH * REACH);

  for (let y = 0; y < h; y++) {
    const yUp = y > 0 ? y - 1 : y;
    const yDn = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const xL = x > 0 ? x - 1 : x;
      const xR = x < w - 1 ? x + 1 : x;
      const dzdx = depth[y * w + xR]! - depth[y * w + xL]!;
      const dzdy = depth[yDn * w + x]! - depth[yUp * w + x]!;
      const nxRaw = -dzdx * RELIEF;
      const nyRaw = -dzdy * RELIEF;
      const nInv = 1 / Math.sqrt(nxRaw * nxRaw + nyRaw * nyRaw + 1);
      const nxv = nxRaw * nInv;
      const nyv = nyRaw * nInv;
      const nzv = nInv;

      const lxRaw = p.sunX - x * invW;
      const lyRaw = p.sunY - y * invH;
      const distSq = lxRaw * lxRaw + lyRaw * lyRaw;
      const lInv = 1 / Math.sqrt(distSq + lzSq);
      const lx = lxRaw * lInv;
      const ly = lyRaw * lInv;
      const lzn = lz * lInv;
      const atten = 1 / (1 + distSq * invReachSq);

      const diffuse = nxv * lx + nyv * ly + nzv * lzn;
      const hl = diffuse * 0.5 + 0.5;
      const sh = (hl - 0.5) * 2 * atten;
      let m = 1 + k * sh;
      if (m < 0.15) m = 0.15;
      else if (m > 2.2) m = 2.2;

      const j = idx * 4;
      const warm = (m - 1) * warmGain;
      px[j] = clamp8(px[j]! * m + warm);
      px[j + 1] = clamp8(px[j + 1]! * m);
      px[j + 2] = clamp8(px[j + 2]! * m - warm);
    }
  }
}

/** Shading core — mutates `px` (RGBA) in place from precomputed per-
 *  pixel surface normals. The light vector + falloff are the only things
 *  that depend on the user's drag, so this is all that re-runs per frame
 *  once the normals are cached. */
function shade(
  px: Uint8ClampedArray,
  nx: Float32Array,
  ny: Float32Array,
  nz: Float32Array,
  w: number,
  h: number,
  p: RelightParams,
): void {
  // Light Z grows with elevation: grazing (0.25) → top-down (2.0).
  const lz = 0.25 + p.elevation * 1.75;
  const lzSq = lz * lz;
  const invW = w > 1 ? 1 / (w - 1) : 0;
  const invH = h > 1 ? 1 / (h - 1) : 0;
  const k = p.intensity * STRENGTH;
  const warmGain = (p.warmth - 0.5) * 2 * WARMTH_K;
  const invReachSq = 1 / (REACH * REACH);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const nxv = nx[idx]!;
      const nyv = ny[idx]!;
      const nzv = nz[idx]!;

      // Point-light direction (toward the sun) + distance falloff. atten
      // only needs the squared distance, so it costs no sqrt of its own —
      // the single sqrt here normalises the light vector.
      const lxRaw = p.sunX - x * invW;
      const lyRaw = p.sunY - y * invH;
      const distSq = lxRaw * lxRaw + lyRaw * lyRaw;
      const lInv = 1 / Math.sqrt(distSq + lzSq);
      const lx = lxRaw * lInv;
      const ly = lyRaw * lInv;
      const lzn = lz * lInv;
      const atten = 1 / (1 + distSq * invReachSq);

      // Half-Lambert keeps shadows readable instead of crushing to black.
      const diffuse = nxv * lx + nyv * ly + nzv * lzn;
      const hl = diffuse * 0.5 + 0.5;
      const sh = (hl - 0.5) * 2 * atten; // -1..1
      let m = 1 + k * sh;
      if (m < 0.15) m = 0.15;
      else if (m > 2.2) m = 2.2;

      const j = idx * 4;
      // Warm the lit side / cool the shadow side. (m-1) carries the sign
      // of the shade; warmGain scales + flips the tint direction.
      const warm = (m - 1) * warmGain;
      px[j] = clamp8(px[j]! * m + warm);
      px[j + 1] = clamp8(px[j + 1]! * m);
      px[j + 2] = clamp8(px[j + 2]! * m - warm);
      // alpha untouched
    }
  }
}

/** Pure shading entry for tests + any direct caller: derives the surface
 *  normals from `depth` then shades. `bakeRelight` uses the cached normal
 *  path instead so a slider drag skips this recompute. Kept callable
 *  without a canvas 2D context (jsdom lacks one) for unit tests. */
export function relightPixels(
  px: Uint8ClampedArray,
  depth: Float32Array,
  w: number,
  h: number,
  p: RelightParams,
): void {
  const { nx, ny, nz } = computeNormals(depth, w, h);
  shade(px, nx, ny, nz, w, h, p);
}

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
