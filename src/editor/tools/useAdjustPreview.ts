// useAdjustPreview.ts — Build a downsampled preview of the working
// canvas with the adjust pipeline baked in, debounced via rAF so slider
// drags stay smooth. The preview is sized to roughly 25% of the source
// (capped at 720px on the long edge) so even huge photos preview at
// interactive speed.
//
// Returns the latest preview canvas, or null while idle. Consumers pass
// it as `previewCanvas` to <ImageCanvas /> which then uses it instead
// of doc.working for live painting.

import { useEffect, useRef, useState } from "react";
import { createCanvas } from "../doc";
import { bakeAdjust, isIdentity } from "./adjustments";

const PREVIEW_LONG_EDGE = 720;

export function useAdjustPreview(
  source: HTMLCanvasElement | null,
  sliders: number[],
  grain: number,
  monochrome = false,
): HTMLCanvasElement | null {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Rebuild the downsample only when the source canvas itself changes.
  useEffect(() => {
    if (source !== sourceRef.current) {
      sourceRef.current = source;
      downsampledRef.current = source ? makeDownsampled(source) : null;
    }
  }, [source]);

  // Bake the preview on every slider change (rAF-coalesced).
  useEffect(() => {
    if (!source) {
      setPreview(null);
      return;
    }
    // Identity → no preview override; <ImageCanvas /> falls back to
    // doc.working at full resolution.
    if (isIdentity(sliders) && grain === 0 && !monochrome) {
      setPreview(null);
      return;
    }
    if (!downsampledRef.current) {
      downsampledRef.current = makeDownsampled(source);
    }
    const ds = downsampledRef.current;
    if (!ds) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const baked = bakeAdjust(ds, sliders, grain);
      if (monochrome) toMonochrome(baked);
      setPreview(baked);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [grain, monochrome, sliders, source]);

  return preview;
}

function makeDownsampled(src: HTMLCanvasElement): HTMLCanvasElement {
  const long = Math.max(src.width, src.height);
  if (long <= PREVIEW_LONG_EDGE) return src;
  const ratio = PREVIEW_LONG_EDGE / long;
  const w = Math.max(1, Math.round(src.width * ratio));
  const h = Math.max(1, Math.round(src.height * ratio));
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

function toMonochrome(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] ?? 0) * 0.2126 + (d[i + 1] ?? 0) * 0.7152 + (d[i + 2] ?? 0) * 0.0722;
    d[i] = lum;
    d[i + 1] = lum;
    d[i + 2] = lum;
  }
  ctx.putImageData(img, 0, 0);
}
