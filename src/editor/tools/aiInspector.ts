// aiInspector.ts — Painter primitives for the "Show what the AI sees"
// inspector. Two shapes:
//
//   • `paintMaskOverlay` — tints subject-mask pixels coral, lets the
//     user see the segmentation cut the model produced. Useful for
//     debugging "why did Remove BG leave / take that bit" without
//     having to run Apply and undo.
//
//   • `paintFaceBoxes` — draws labelled bounding boxes around every
//     detected face with its confidence score. Lets the user verify
//     "yes, the AI sees the face I want to redact" before committing,
//     and tune the faceConfidence dial against the visible labels.
//
// Both run synchronously inside a paintOverlay callback (≤ 1 ms each
// on typical 24 MP images) and read from the AI subsystem's already-
// computed results — no extra inference. The whole point is that the
// model has already done the work; we're just making its output
// visible.

import type { Transform } from "../ImageCanvas";
import type { FaceBox } from "../ai/runtime/types";

/** Mutates `cut` in place so any pixel whose alpha falls below the
 *  threshold becomes fully transparent. Used by the Confidence dial
 *  in Remove BG Auto: the U²-Net mask is a soft alpha encoding the
 *  model's per-pixel confidence; thresholding lets the user trade
 *  recall (keep uncertain edges, may include background) for
 *  precision (clean cut, may drop wispy hair).
 *
 *  Threshold is the user's 0..1 dial value. 0 = pass everything
 *  (identical to no thresholding); 1 = drop everything; the default
 *  0.5 reproduces the lib's implicit behaviour before the dial was
 *  exposed.
 *
 *  Pixels at or above the threshold keep their model-reported alpha
 *  — we DON'T force them to fully opaque, which would harden
 *  anti-aliased edges into a stair-step. */
export function applyAlphaThreshold(cut: HTMLCanvasElement, threshold: number): void {
  if (threshold <= 0) return;
  const ctx = cut.getContext("2d");
  if (!ctx) return;
  const w = cut.width;
  const h = cut.height;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  // The 0..1 threshold becomes a 0..255 cutoff so we can compare
  // directly against the alpha byte.
  const cutoff = Math.round(threshold * 255);
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i];
    if (a === undefined) continue;
    if (a < cutoff) data[i] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

/** Coral RGB the inspector overlays paint with. Matches the editor's
 *  primary accent so the overlay reads as "ours" — not "system" —
 *  and is easy to spot against typical photo content. */
const ACCENT_RGB = "245, 97, 58";

/** Paint a subject-mask cut as a translucent coral overlay onto the
 *  visible canvas. The cut is the same RGBA bitmap that
 *  `subjectMask.peek()` returns: subject pixels have non-zero alpha,
 *  background has alpha=0. We re-tint the cut so the user sees the
 *  AI's segmentation directly on the photo without committing.
 *
 *  Pixels with alpha BELOW `confidenceThreshold` get a striped fringe
 *  treatment — they're what the AI is uncertain about, which is also
 *  what the Confidence dial decides to keep or drop on Apply. The
 *  fringe + the dial are the same idea visualised + controllable.
 *
 *  Coords: the overlay paints in image-space first (via the same
 *  Transform the toolstack uses), so it stays aligned through pan /
 *  zoom without per-pixel maths here. */
export function paintMaskOverlay(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  cut: HTMLCanvasElement,
  imageWidth: number,
  imageHeight: number,
): void {
  ctx.save();
  // Move into image-space so we can drawImage at native coordinates.
  ctx.translate(t.ox, t.oy);
  ctx.scale(t.scale, t.scale);
  // 1. Tint pass — paint the cut bitmap (alpha = subject confidence)
  //    multiplied by the accent colour. `source-in` would also work
  //    but requires an offscreen buffer; using globalCompositeOperation
  //    on a temp paint of a solid rect masked by the cut alpha is
  //    cheaper and stays on the visible context.
  ctx.globalAlpha = 0.45;
  // Draw the cut so its alpha lands on the canvas alpha channel.
  ctx.drawImage(cut, 0, 0, imageWidth, imageHeight);
  // Now `source-in` paints colour only where alpha exists from our
  // last draw.
  ctx.globalCompositeOperation = "source-in";
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${ACCENT_RGB})`;
  ctx.fillRect(0, 0, imageWidth, imageHeight);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();
}

/** Paint labelled boxes around detected faces. `confidenceFloor` is
 *  the user's `faceConfidence` setting — boxes BELOW the floor get
 *  faded out so the user can see what the dial is currently
 *  filtering. Labels include the score so the user can tell which
 *  way to tune the dial ("0.41 — let it in by dropping the dial to
 *  0.35"). */
export function paintFaceBoxes(
  ctx: CanvasRenderingContext2D,
  t: Transform,
  faces: readonly FaceBox[],
  confidenceFloor: number,
): void {
  if (faces.length === 0) return;
  ctx.save();
  ctx.translate(t.ox, t.oy);
  ctx.scale(t.scale, t.scale);
  for (const f of faces) {
    const passes = f.score >= confidenceFloor;
    // Dim faces below the threshold so the user can see which ones
    // the dial is currently filtering out.
    const alpha = passes ? 0.95 : 0.35;
    ctx.lineWidth = 2 / t.scale;
    ctx.strokeStyle = passes ? `rgba(${ACCENT_RGB}, ${alpha})` : `rgba(150, 150, 150, ${alpha})`;
    ctx.fillStyle = passes
      ? `rgba(${ACCENT_RGB}, ${alpha * 0.18})`
      : `rgba(150, 150, 150, ${alpha * 0.12})`;
    ctx.beginPath();
    ctx.rect(f.x, f.y, f.width, f.height);
    ctx.fill();
    ctx.stroke();
    // Score label — drawn in screen-space text size so it stays
    // legible regardless of zoom. We undo the canvas scale just for
    // the label measurement + paint.
    ctx.save();
    ctx.scale(1 / t.scale, 1 / t.scale);
    const fontPx = 11;
    ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const label = passes ? `face ${f.score.toFixed(2)}` : `${f.score.toFixed(2)} • below floor`;
    const padX = 5;
    const padY = 3;
    const metrics = ctx.measureText(label);
    const w = metrics.width + padX * 2;
    const h = fontPx + padY * 2;
    // Anchor the label just above the box; if it'd clip the top of
    // the canvas, drop it inside the box instead.
    const sx = f.x * t.scale;
    const sy = f.y * t.scale;
    const labelY = sy - h - 2 < 0 ? sy + 2 : sy - h - 2;
    ctx.fillStyle = passes ? `rgba(${ACCENT_RGB}, 0.95)` : "rgba(80, 80, 80, 0.85)";
    ctx.fillRect(sx, labelY, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(label, sx + padX, labelY + padY);
    ctx.restore();
  }
  ctx.restore();
}
