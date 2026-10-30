// cropMath.ts — Pure geometry helpers for the crop tool. Kept
// dependency-free so they can be unit tested without React.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ASPECT_OPTIONS: Array<{ label: string; ratio: number | null }> = [
  { label: "Free", ratio: null },
  { label: "1:1", ratio: 1 },
  { label: "4:5", ratio: 4 / 5 },
  { label: "16:9", ratio: 16 / 9 },
  // 9:16 is the canonical mobile / Story / Reel aspect — the inverse
  // of 16:9. Without it, users targeting vertical mobile-native content
  // had to fall back to Free and eyeball the crop. Order: 16:9 → 9:16
  // keeps the wide → tall progression readable.
  { label: "9:16", ratio: 9 / 16 },
];

export function clampRectToImage(r: Rect, iw: number, ih: number): Rect {
  const w = Math.max(8, Math.min(iw, r.w));
  const h = Math.max(8, Math.min(ih, r.h));
  const x = Math.max(0, Math.min(iw - w, r.x));
  const y = Math.max(0, Math.min(ih - h, r.y));
  return { x, y, w, h };
}

/** Move a rect by (dx, dy) and clamp to image bounds. */
export function translate(r: Rect, dx: number, dy: number, iw: number, ih: number): Rect {
  return clampRectToImage({ ...r, x: r.x + dx, y: r.y + dy }, iw, ih);
}

/** Initial centered crop rect taking up most of the image, aspect-locked
 *  if a target aspect is provided. */
export function initialRect(iw: number, ih: number, aspect: number | null): Rect {
  const margin = 0.06;
  let w = iw * (1 - margin * 2);
  let h = ih * (1 - margin * 2);
  if (aspect) {
    const imgAspect = iw / ih;
    if (aspect > imgAspect) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
  }
  return clampRectToImage({ x: (iw - w) / 2, y: (ih - h) / 2, w, h }, iw, ih);
}
