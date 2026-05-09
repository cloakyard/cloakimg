// geometry.ts — Pure geometry helpers used by the face-detection
// surface. The detector itself (MediaPipe) returns face boxes already
// in source-image pixel space; everything in this module is layout
// post-processing the panel applies before painting redactions.

import type { FaceBox } from "../../runtime/types";

/** Pad a face box outward by a fractional amount on each side, then
 *  clip back to the image bounds. Used by Smart Auto-Anonymize to
 *  enlarge the redaction rect so hairline / chin / ear pixels are
 *  also covered (face detection bboxes are tight). */
export function padFaceBox(
  box: FaceBox,
  padding: number,
  imageWidth: number,
  imageHeight: number,
): FaceBox {
  if (padding <= 0) return box;
  const padW = box.width * padding;
  const padH = box.height * padding;
  const x = Math.max(0, box.x - padW);
  const y = Math.max(0, box.y - padH);
  const x2 = Math.min(imageWidth, box.x + box.width + padW);
  const y2 = Math.min(imageHeight, box.y + box.height + padH);
  return {
    x,
    y,
    width: x2 - x,
    height: y2 - y,
    score: box.score,
  };
}
