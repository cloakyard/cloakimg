// useRemoveBgPreview.ts — Live preview for the Remove BG tool.
// Computes the chroma-key cut on a downsampled copy of the working
// canvas (≤ 720 long edge) on every threshold/feather change, then
// upsamples the result back to doc dimensions so Fabric's
// backgroundImage renders at the correct on-screen size. The cleared
// (alpha=0) regions show the canvas-bg through, giving the user a
// real-time WYSIWYG of what Apply will produce.

import { useEffect, useRef, useState } from "react";
import { createCanvas } from "../doc";
import { removeBackground } from "./removeBg";

const PREVIEW_LONG_EDGE = 720;

export function useRemoveBgPreview(
  source: HTMLCanvasElement | null,
  threshold: number,
  feather: number,
  sampleHex: string | null,
  /** Bumps whenever the source canvas's pixels may have changed without
   *  changing canvas identity (undo, redo, reset, replaceWithFile). The
   *  caller passes the doc reference itself — `setDoc` produces a new
   *  doc object on every history mutation so identity comparison here
   *  catches all cases. Without this the downsampled cache holds the
   *  pre-mutation pixels and the preview ghost-survives the reset. */
  invalidationKey: unknown,
): HTMLCanvasElement | null {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!source) {
      setPreview(null);
      return;
    }
    // No preview until the user has actually engaged with the tool —
    // either by running auto-detect (which sets threshold + feather),
    // dragging a slider, or sampling a colour. Showing a chroma-keyed
    // preview the moment they opened the panel was disorienting:
    // people expected the BG-removed result to be the *outcome* of an
    // explicit action, not a default state.
    if (threshold === 0 && feather === 0 && !sampleHex) {
      setPreview(null);
      return;
    }
    // Rebuild the downsampled cache when either the canvas identity
    // changes (replaceWithFile) or the invalidation key bumps (undo,
    // redo, reset — same canvas, different pixels).
    if (
      source !== sourceRef.current ||
      invalidationKey !== versionRef.current ||
      !downsampledRef.current
    ) {
      sourceRef.current = source;
      versionRef.current = invalidationKey;
      downsampledRef.current = makeDownsampled(source);
    }
    const ds = downsampledRef.current;
    if (!ds) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const sample = parseHex(sampleHex);
      const cleared = removeBackground(ds, { threshold, feather, sample });
      // Upsample to source dimensions so Fabric renders the preview
      // at the same on-canvas size as the real image.
      const out =
        cleared.width === source.width && cleared.height === source.height
          ? cleared
          : upsample(cleared, source.width, source.height);
      setPreview(out);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [feather, source, threshold, sampleHex, invalidationKey]);

  return preview;
}

function parseHex(hex: string | null): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? "", 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
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

function upsample(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}
