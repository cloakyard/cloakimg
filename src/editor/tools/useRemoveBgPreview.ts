// useRemoveBgPreview.ts — Live preview for the Remove BG tool.
// Computes the chroma-key cut on a downsampled copy of the working
// canvas (≤ 720 long edge) on every threshold/feather change, then
// upsamples the result back to doc dimensions so Fabric's
// backgroundImage renders at the correct on-screen size. The cleared
// (alpha=0) regions show the canvas-bg through, giving the user a
// real-time WYSIWYG of what Apply will produce.

import { useCallback, useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
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
  // Track the currently-published preview canvas in a ref so we can
  // release it synchronously, ONCE, before each setPreview. React
  // StrictMode double-invokes useState updaters in dev to flag impurity;
  // if releaseCanvas lived inside the updater it would push the same
  // canvas onto the pool twice, and a future acquireCanvas would hand
  // duplicate elements out to two consumers — breaking the live preview.
  // The four other preview hooks (useAdjustPreview / useLevelsPreview /
  // useHslPreview / useBgBlurPreview) all use this pattern; this hook
  // previously bypassed it (releaseCanvas inside the updater) and was
  // hidden by the fact that StrictMode-doubled invocations cancel out
  // in production builds. See CLAUDE.md → "Critical gotcha: live preview
  // hooks + canvas pool + StrictMode".
  const publishedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Helper: release the currently-published preview canvas back to the
  // pool, then clear setState — both done as a single synchronous step
  // OUTSIDE any updater function. Used by the "no source / off /
  // identity" exits and by unmount cleanup. Wrapped in useCallback with
  // empty deps so the effects that depend on it don't re-fire on every
  // render of the parent panel.
  const clearPublished = useCallback(() => {
    const pub = publishedCanvasRef.current;
    if (pub !== null) {
      releaseCanvas(pub);
      publishedCanvasRef.current = null;
    }
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!source) {
      clearPublished();
      return;
    }
    // No preview until the user has actually engaged with the tool —
    // either by running auto-detect (which sets threshold + feather),
    // dragging a slider, or sampling a colour. Showing a chroma-keyed
    // preview the moment they opened the panel was disorienting:
    // people expected the BG-removed result to be the *outcome* of an
    // explicit action, not a default state.
    if (threshold === 0 && feather === 0 && !sampleHex) {
      clearPublished();
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
      // Bake guard: `removeBackground` allocates a full RGBA buffer
      // and can throw on memory-pressured mobile. Without try/catch
      // the rejection would leak `cleared` and leave the previous
      // preview painted; instead clear back to doc.working.
      let cleared: HTMLCanvasElement | null = null;
      let out: HTMLCanvasElement | null = null;
      try {
        // `skipSmooth` halves the per-frame cost — the 3×3 alpha box
        // average doesn't materially change what the user sees while
        // they're moving sliders. Apply re-runs `removeBackground` at
        // full res with smoothing on, so the final cutout still gets
        // the anti-aliased edge.
        cleared = removeBackground(ds, {
          threshold,
          feather,
          sample,
          skipSmooth: true,
        });
        // Upsample to source dimensions so Fabric renders the preview
        // at the same on-canvas size as the real image. If the
        // keyer's output already matches we can skip the extra blit
        // and reuse its canvas directly.
        if (cleared.width === source.width && cleared.height === source.height) {
          out = cleared;
          cleared = null;
        } else {
          out = upsample(cleared, source.width, source.height);
          releaseCanvas(cleared);
          cleared = null;
        }
      } catch (err) {
        console.error("[useRemoveBgPreview] keyer failed", err);
        if (cleared) releaseCanvas(cleared);
        if (out) releaseCanvas(out);
        clearPublished();
        return;
      }
      const result = out;
      // Release the previously-published canvas BEFORE setPreview so
      // the side effect doesn't live inside the updater — see
      // publishedCanvasRef declaration for the full rationale.
      const pub = publishedCanvasRef.current;
      if (pub && pub !== result) releaseCanvas(pub);
      publishedCanvasRef.current = result;
      setPreview(result);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [feather, source, threshold, sampleHex, invalidationKey, clearPublished]);

  // Drop the last preview on unmount so the pool reclaims the canvas.
  // Release happens via the ref-tracked publishedCanvasRef, NOT inside
  // a setPreview updater — see publishedCanvasRef declaration for the
  // StrictMode rationale.
  useEffect(() => {
    return () => {
      const pub = publishedCanvasRef.current;
      if (pub) releaseCanvas(pub);
      publishedCanvasRef.current = null;
    };
  }, []);

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
