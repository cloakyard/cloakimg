// perspective.ts — Rectify a quadrilateral region of the working
// canvas into a clean rectangle. Useful for photos of documents,
// screens, paintings — anything where the camera wasn't dead-on.
//
// Math: solve the 3×3 homography H that maps the four output-rect
// corners to the four user-clicked source corners. For each output
// pixel (x, y) we apply H to find the matching source point, then
// bilinear-sample. This is the same approach Adobe and OpenCV use
// for `getPerspectiveTransform` + `warpPerspective`.

import { createCanvas } from "../doc";

export type Point = [number, number];

/** Corner order is fixed: TL, TR, BR, BL. The panel and the on-canvas
 *  handles share this order so a "corner index" reads the same
 *  everywhere. */
export type Quad = [Point, Point, Point, Point];

export const PERS_CORNER_LABELS = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"] as const;

export function defaultQuad(w: number, h: number): Quad {
  return [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
}

export function isPersIdentity(corners: Quad | null, w: number, h: number): boolean {
  if (!corners) return true;
  const def = defaultQuad(w, h);
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = def[i];
    if (Math.abs((a?.[0] ?? 0) - (b?.[0] ?? 0)) > 0.5) return false;
    if (Math.abs((a?.[1] ?? 0) - (b?.[1] ?? 0)) > 0.5) return false;
  }
  return true;
}

/** Shoelace area of a quad. We use this to detect collapsed inputs
 *  before running the warp — a near-zero area means the four corners
 *  are colinear (or two share a position), in which case the
 *  homography solve produces NaN / Inf and the bake silently
 *  blanks the canvas. */
export function quadArea(q: Quad): number {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    sum += (a?.[0] ?? 0) * (b?.[1] ?? 0) - (b?.[0] ?? 0) * (a?.[1] ?? 0);
  }
  return Math.abs(sum) / 2;
}

/** True when the user's quad is too thin / collapsed to warp safely.
 *  Threshold is 0.05 % of the source image area — generous enough
 *  that a deliberately tilted real subject still applies, strict
 *  enough that an accidental triple-tap on a single point doesn't
 *  blank the canvas. */
export function isQuadDegenerate(corners: Quad, srcW: number, srcH: number): boolean {
  const area = quadArea(corners);
  const minArea = Math.max(64, srcW * srcH * 0.0005);
  return area < minArea;
}

/** Recommended output dimensions for the rectified result. Width is
 *  the average of the top + bottom edge lengths; height is the
 *  average of the left + right edge lengths. Rounded to integers and
 *  clamped to a reasonable minimum so a near-degenerate quad doesn't
 *  produce a 0-px image. */
export function recommendedOutputSize(corners: Quad): { w: number; h: number } {
  const [tl, tr, br, bl] = corners;
  const top = dist(tl, tr);
  const bottom = dist(bl, br);
  const left = dist(tl, bl);
  const right = dist(tr, br);
  const w = Math.max(8, Math.round((top + bottom) / 2));
  const h = Math.max(8, Math.round((left + right) / 2));
  return { w, h };
}

function dist(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/** Solve the 8 unknowns of a 3×3 homography (h33 fixed at 1) that
 *  maps `src[i]` → `dst[i]`. Returns the 8 entries in row-major
 *  order; callers append a 1.0 for h33 themselves. Implementation
 *  is direct Gaussian elimination on the 8×8 system — no library
 *  dependency, ~150 multiplications, runs in microseconds. */
export function solveHomography(src: Quad, dst: Quad): number[] {
  // Build the 8×9 augmented matrix.
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const sx = src[i]?.[0] ?? 0;
    const sy = src[i]?.[1] ?? 0;
    const dx = dst[i]?.[0] ?? 0;
    const dy = dst[i]?.[1] ?? 0;
    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy, dx]);
    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy, dy]);
  }
  return gaussianSolve(A, 8);
}

function gaussianSolve(A: number[][], n: number): number[] {
  // Forward elimination with partial pivoting.
  for (let i = 0; i < n; i++) {
    let piv = i;
    let pivAbs = Math.abs(A[i]?.[i] ?? 0);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(A[k]?.[i] ?? 0);
      if (v > pivAbs) {
        pivAbs = v;
        piv = k;
      }
    }
    if (piv !== i) {
      const tmp = A[i];
      const swap = A[piv];
      if (tmp && swap) {
        A[i] = swap;
        A[piv] = tmp;
      }
    }
    const row = A[i];
    if (!row) continue;
    const lead = row[i] ?? 0;
    if (Math.abs(lead) < 1e-12) continue;
    for (let k = i + 1; k < n; k++) {
      const target = A[k];
      if (!target) continue;
      const factor = (target[i] ?? 0) / lead;
      for (let j = i; j <= n; j++) {
        target[j] = (target[j] ?? 0) - factor * (row[j] ?? 0);
      }
    }
  }
  // Back substitution.
  const x: number[] = Array.from({ length: n }, () => 0);
  for (let i = n - 1; i >= 0; i--) {
    const row = A[i];
    if (!row) continue;
    let sum = row[n] ?? 0;
    for (let j = i + 1; j < n; j++) sum -= (row[j] ?? 0) * (x[j] ?? 0);
    const div = row[i] ?? 0;
    x[i] = Math.abs(div) < 1e-12 ? 0 : sum / div;
  }
  return x;
}

/** Warp `src` so that `srcCorners` (TL, TR, BR, BL) ends up at the
 *  four corners of a rectangle of size (outW × outH). Bilinear
 *  sampling; out-of-bounds reads return transparent black so the
 *  output canvas is well-defined even for extreme quads.
 *
 *  Synchronous variant — blocks the main thread for the duration of
 *  the warp. For a 4K rectified output that's roughly 0.5–1 s on a
 *  modern laptop, multiple seconds on a phone. Prefer
 *  `warpPerspectiveAsync` from any UI path; this signature is kept
 *  for callers that already run inside a worker or off-thread. */
export function warpPerspective(
  src: HTMLCanvasElement,
  srcCorners: Quad,
  outW: number,
  outH: number,
): HTMLCanvasElement {
  const { ctx, out, sd, sw, sh, outImg, od, H } = preparePerspectiveWarp(
    src,
    srcCorners,
    outW,
    outH,
  );
  if (!ctx) return out;
  warpRows(0, outH, outW, outH, sd, sw, sh, od, H);
  ctx.putImageData(outImg, 0, 0);
  return out;
}

/** Async, chunked version of `warpPerspective`. Same per-pixel
 *  pipeline, but yields to the event loop every `CHUNK_ROWS` so the
 *  busy-spinner overlay keeps animating during a high-resolution
 *  bake. The yield overhead is single-digit-percent on the total
 *  warp time — same trade-off as `bakeAdjustAsync`. */
export async function warpPerspectiveAsync(
  src: HTMLCanvasElement,
  srcCorners: Quad,
  outW: number,
  outH: number,
): Promise<HTMLCanvasElement> {
  const { ctx, out, sd, sw, sh, outImg, od, H } = preparePerspectiveWarp(
    src,
    srcCorners,
    outW,
    outH,
  );
  if (!ctx) return out;
  const CHUNK_ROWS = 64;
  for (let y = 0; y < outH; y += CHUNK_ROWS) {
    const yEnd = Math.min(y + CHUNK_ROWS, outH);
    warpRows(y, yEnd, outW, outH, sd, sw, sh, od, H);
    if (yEnd < outH) await yieldToEventLoop();
  }
  ctx.putImageData(outImg, 0, 0);
  return out;
}

interface WarpPrep {
  ctx: CanvasRenderingContext2D | null;
  out: HTMLCanvasElement;
  sd: Uint8ClampedArray;
  sw: number;
  sh: number;
  outImg: ImageData;
  od: Uint8ClampedArray;
  H: number[];
}

function preparePerspectiveWarp(
  src: HTMLCanvasElement,
  srcCorners: Quad,
  outW: number,
  outH: number,
): WarpPrep {
  const dstCorners: Quad = [
    [0, 0],
    [outW, 0],
    [outW, outH],
    [0, outH],
  ];
  // We need the inverse mapping (output → source) so the inner loop
  // walks output pixels and samples source.
  const H = solveHomography(dstCorners, srcCorners);
  const out = createCanvas(outW, outH);
  const ctx = out.getContext("2d");
  const srcCtx = src.getContext("2d");
  if (!ctx || !srcCtx) {
    return {
      ctx: null,
      out,
      sd: new Uint8ClampedArray(0),
      sw: 0,
      sh: 0,
      outImg: new ImageData(1, 1),
      od: new Uint8ClampedArray(0),
      H,
    };
  }
  const srcImg = srcCtx.getImageData(0, 0, src.width, src.height);
  const outImg = ctx.createImageData(outW, outH);
  return {
    ctx,
    out,
    sd: srcImg.data,
    sw: src.width,
    sh: src.height,
    outImg,
    od: outImg.data,
    H,
  };
}

function warpRows(
  yStart: number,
  yEnd: number,
  outW: number,
  _outH: number,
  sd: Uint8ClampedArray,
  sw: number,
  sh: number,
  od: Uint8ClampedArray,
  H: number[],
) {
  const h11 = H[0] ?? 1;
  const h12 = H[1] ?? 0;
  const h13 = H[2] ?? 0;
  const h21 = H[3] ?? 0;
  const h22 = H[4] ?? 1;
  const h23 = H[5] ?? 0;
  const h31 = H[6] ?? 0;
  const h32 = H[7] ?? 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < outW; x++) {
      const w = h31 * x + h32 * y + 1;
      if (Math.abs(w) < 1e-9) continue;
      const sx = (h11 * x + h12 * y + h13) / w;
      const sy = (h21 * x + h22 * y + h23) / w;
      const i = (y * outW + x) * 4;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      if (x0 < 0 || y0 < 0 || x0 >= sw || y0 >= sh) {
        od[i] = 0;
        od[i + 1] = 0;
        od[i + 2] = 0;
        od[i + 3] = 0;
        continue;
      }
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      for (let c = 0; c < 4; c++) {
        od[i + c] =
          (sd[i00 + c] ?? 0) * w00 +
          (sd[i10 + c] ?? 0) * w10 +
          (sd[i01 + c] ?? 0) * w01 +
          (sd[i11 + c] ?? 0) * w11;
      }
    }
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, 0));
}
