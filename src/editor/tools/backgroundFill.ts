// backgroundFill.ts — One-colour background treatments for cutouts.
// Solid uses the selected colour directly; gradient and vignette derive
// lighter/darker tones from that same colour so the control stays simple.

import { parseColor, rgbToHex, type RGB } from "../colorUtils";
import { acquireCanvas } from "../doc";

export const BACKGROUND_FILL_OPTIONS = ["None", "Solid", "Gradient", "Vignette"] as const;

export type BackgroundFill = "transparent" | "solid" | "gradient" | "vignette";

export interface BackgroundPalette {
  first: string;
  second: string;
}

export function backgroundFillForMode(mode: number): BackgroundFill {
  return (["transparent", "solid", "gradient", "vignette"] as const)[mode] ?? "transparent";
}

export function backgroundFillLabel(fill: BackgroundFill): string {
  if (fill === "transparent") return "Transparent";
  return fill[0]!.toUpperCase() + fill.slice(1);
}

/** Two-stop palette derived from one user-selected base colour. */
export function backgroundPalette(baseColor: string, fill: BackgroundFill): BackgroundPalette {
  const base = parseColor(baseColor);
  const normalized = rgbToHex(base);
  if (fill === "gradient") {
    return { first: rgbToHex(mix(base, 255, 0.55)), second: rgbToHex(scale(base, 0.88)) };
  }
  if (fill === "vignette") {
    return { first: rgbToHex(mix(base, 255, 0.25)), second: rgbToHex(scale(base, 0.62)) };
  }
  return { first: normalized, second: normalized };
}

export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fill: BackgroundFill,
  color: string,
) {
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, width, height);
  if (fill === "transparent") {
    ctx.restore();
    return;
  }

  const palette = backgroundPalette(color, fill);
  if (fill === "solid") {
    ctx.fillStyle = palette.first;
  } else if (fill === "gradient") {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, palette.first);
    gradient.addColorStop(1, palette.second);
    ctx.fillStyle = gradient;
  } else {
    const radius = Math.hypot(width, height) * 0.58;
    const gradient = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      0,
      width * 0.5,
      height * 0.5,
      radius,
    );
    gradient.addColorStop(0, palette.first);
    gradient.addColorStop(1, palette.second);
    ctx.fillStyle = gradient;
  }
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Paint a background, then place the transparent subject over it.
 *  The returned canvas is pool-backed; callers own and must release it. */
export function compositeCutout(
  cutout: HTMLCanvasElement,
  fill: BackgroundFill,
  color: string,
): HTMLCanvasElement {
  const out = acquireCanvas(cutout.width, cutout.height);
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("The browser could not create the background preview.");
  paintBackground(ctx, out.width, out.height, fill, color);
  ctx.drawImage(cutout, 0, 0);
  return out;
}

function mix(color: RGB, target: number, amount: number): RGB {
  return {
    r: color.r + (target - color.r) * amount,
    g: color.g + (target - color.g) * amount,
    b: color.b + (target - color.b) * amount,
  };
}

function scale(color: RGB, amount: number): RGB {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}
