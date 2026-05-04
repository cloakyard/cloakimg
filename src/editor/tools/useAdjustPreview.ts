// useAdjustPreview.ts — Build a downsampled preview of the working
// canvas with the adjust pipeline baked in, debounced via rAF so slider
// drags stay smooth. The preview is capped on the long edge so even
// huge photos preview at interactive speed.
//
// The cap is viewport-aware: phones use a smaller cap so per-pixel
// bakes stay under one frame on weaker mobile CPUs; desktops use a
// larger cap so the upscale Fabric does to remap the preview back
// into image-space (required so layers / Fabric objects align)
// doesn't visibly soften the photo. A 720 px cap on a 4 kpx source
// produced a ~5.7× upscale and obvious blur in the live preview;
// 1440 cuts that to ~2.8× on desktop and looks crisp at typical zoom
// levels. Mobile sits in between at 1080 (~3.8× upscale) so slider
// drags still feel responsive on older phones.
//
// Returns the latest preview canvas, or null while idle. Consumers pass
// it as `previewCanvas` to <ImageCanvas /> which then uses it instead
// of doc.working for live painting.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { bakeAdjust, isIdentity } from "./adjustments";

const PREVIEW_LONG_EDGE_MOBILE = 1080;
const PREVIEW_LONG_EDGE_DESKTOP = 1440;
const MOBILE_BREAKPOINT_PX = 768;

function previewLongEdge(): number {
  if (typeof window === "undefined") return PREVIEW_LONG_EDGE_DESKTOP;
  return window.innerWidth < MOBILE_BREAKPOINT_PX
    ? PREVIEW_LONG_EDGE_MOBILE
    : PREVIEW_LONG_EDGE_DESKTOP;
}

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

  // Bake the preview on every slider change (rAF-coalesced). The
  // previous bake gets returned to the canvas pool right before the
  // new one replaces it, so we don't allocate per slider tick.
  useEffect(() => {
    if (!source) {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
      return;
    }
    if (isIdentity(sliders) && grain === 0 && !monochrome) {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
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
      setPreview((prev) => {
        // Don't release the downsampled cache by accident — it lives
        // across renders and bakeAdjust may return it directly when
        // the source is already small.
        if (prev && prev !== ds) releaseCanvas(prev);
        return baked;
      });
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [grain, monochrome, sliders, source]);

  // Drop the last preview when the hook unmounts so a tool swap
  // doesn't leak its final scratch canvas.
  useEffect(() => {
    return () => {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
    };
  }, []);

  return preview;
}

function makeDownsampled(src: HTMLCanvasElement): HTMLCanvasElement {
  const cap = previewLongEdge();
  const long = Math.max(src.width, src.height);
  if (long <= cap) return src;
  const ratio = cap / long;
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
