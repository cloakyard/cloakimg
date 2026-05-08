// cropMath.ts — Pure geometry helpers for the crop tool. Kept
// dependency-free so they can be unit tested without React.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "body";

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

/** Resize a rect by dragging a handle. If `aspect` is set, preserve it. */
export function resizeByHandle(
  start: Rect,
  handle: HandleId,
  dx: number,
  dy: number,
  iw: number,
  ih: number,
  aspect: number | null,
): Rect {
  let { x, y, w, h } = start;
  let nx = x;
  let ny = y;
  let nw = w;
  let nh = h;

  if (handle.includes("w")) {
    nx = x + dx;
    nw = w - dx;
  }
  if (handle.includes("e")) {
    nw = w + dx;
  }
  if (handle.includes("n")) {
    ny = y + dy;
    nh = h - dy;
  }
  if (handle.includes("s")) {
    nh = h + dy;
  }

  // Enforce minimum size.
  const MIN = 16;
  if (nw < MIN) {
    if (handle.includes("w")) nx = x + (w - MIN);
    nw = MIN;
  }
  if (nh < MIN) {
    if (handle.includes("n")) ny = y + (h - MIN);
    nh = MIN;
  }

  // Aspect lock — drive height from width unless we're touching only N/S.
  if (aspect && aspect > 0) {
    const horizontal = handle.includes("e") || handle.includes("w");
    const vertical = handle.includes("n") || handle.includes("s");
    if (horizontal) {
      const targetH = nw / aspect;
      if (handle.includes("n")) ny = ny + (nh - targetH);
      nh = targetH;
    } else if (vertical) {
      const targetW = nh * aspect;
      if (handle.includes("w")) nx = nx + (nw - targetW);
      nw = targetW;
    }
  }

  return clampRectToImage({ x: nx, y: ny, w: nw, h: nh }, iw, ih);
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

/** Hit-test a screen-space point against the rect's handles. */
export function hitHandle(
  imageX: number,
  imageY: number,
  rect: Rect,
  imageScale: number,
): HandleId | null {
  // Tolerance grows with zoom so small rects stay clickable.
  const tol = Math.max(8 / imageScale, 6);
  const { x, y, w, h } = rect;
  const inX = imageX >= x - tol && imageX <= x + w + tol;
  const inY = imageY >= y - tol && imageY <= y + h + tol;
  if (!inX || !inY) return null;

  const nearLeft = Math.abs(imageX - x) <= tol;
  const nearRight = Math.abs(imageX - (x + w)) <= tol;
  const nearTop = Math.abs(imageY - y) <= tol;
  const nearBottom = Math.abs(imageY - (y + h)) <= tol;

  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearLeft) return "sw";
  if (nearBottom && nearRight) return "se";
  if (nearTop) return "n";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  if (nearRight) return "e";
  if (imageX > x && imageX < x + w && imageY > y && imageY < y + h) {
    return "body";
  }
  return null;
}

export function cursorForHandle(h: HandleId | null): string {
  switch (h) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "body":
      return "move";
    default:
      return "crosshair";
  }
}
