// useAdjustPreview.ts — Build a downsampled preview of the working
// canvas with the adjust pipeline baked in. The preview is capped on
// the long edge so even huge photos preview at interactive speed,
// and consumers can opt into a setTimeout debounce so a burst of
// rapid changes (e.g. tapping 6 filter presets in quick succession)
// coalesces to a single trailing bake instead of queueing one per
// change.
//
// The cap is viewport-aware: phones use 720 — small enough that the
// per-pixel bake stays well under 100 ms on most modern phones, so a
// click-burst of filter presets settles in under a second total.
// Desktops can afford 1440, which keeps Fabric's upscale-to-image-
// space (required so layers and Fabric objects align with the bg)
// from visibly softening the photo. The cssFilter caller is
// responsible for matching the cap; this module just returns a
// preview canvas at the chosen size or null while idle.
//
// Returns the latest preview canvas, or null while idle. Consumers
// pass it as `previewCanvas` to <ImageCanvas /> which then uses it
// instead of doc.working for live painting.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { applyMaskScope, type MaskScope } from "../subjectMask";
import { type CurvePoint, isCurveIdentity } from "../toolState";
import { bakeAdjust, isIdentity } from "./adjustments";

const PREVIEW_LONG_EDGE_MOBILE = 720;
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
  /** Debounce window in ms before scheduling the bake. 0 fires on
   *  the next animation frame (current Adjust slider behaviour).
   *  Tools driven by discrete clicks (Filter presets) should pass a
   *  small value (~80 ms) so a quick tap-tap-tap collapses into one
   *  trailing bake instead of one bake per click — bakes block the
   *  main thread for 50–150 ms each on phones, and queueing 6 in a
   *  row was leaving the UI frozen long enough that subsequent tool
   *  switches felt unresponsive. */
  debounceMs = 0,
  /** Optional master tone curve. Identity curves are detected and
   *  skipped at bake time. Filter / preview consumers without a
   *  user-facing curve simply leave this undefined. */
  curve?: CurvePoint[],
  /** Mask-aware scope for the bake: 0 (whole), 1 (subject), 2 (bg).
   *  When scope is non-zero AND `mask` is provided, the preview
   *  composites the bake with the downsampled source so the
   *  modifications visibly land only in the chosen region. When
   *  scope is non-zero but the mask hasn't loaded yet, we render
   *  the un-scoped preview — the user sees the bake on the whole
   *  image until detection lands, at which point the next render
   *  re-bakes with the mask. */
  scope: MaskScope = 0,
  mask: HTMLCanvasElement | null = null,
): HTMLCanvasElement | null {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Rebuild the downsample only when the source canvas itself changes.
  // Return the previous downsample to the pool before replacing the ref —
  // `makeDownsampled` returns the source itself when the image is
  // already under the cap, so guard against releasing the live canvas.
  useEffect(() => {
    if (source !== sourceRef.current) {
      const prev = downsampledRef.current;
      if (prev && prev !== sourceRef.current) releaseCanvas(prev);
      sourceRef.current = source;
      downsampledRef.current = source ? makeDownsampled(source) : null;
    }
  }, [source]);

  // Bake the preview on every change. The previous bake gets returned
  // to the canvas pool right before the new one replaces it, so we
  // don't allocate per change.
  useEffect(() => {
    if (!source) {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
      return;
    }
    const curveActive = !!curve && !isCurveIdentity(curve);
    if (isIdentity(sliders) && grain === 0 && !monochrome && !curveActive) {
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
    // Cancel any pending work before scheduling new — mid-burst the
    // debounce timer is still running and the rAF hasn't been queued
    // yet, so we just reset both.
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const runBake = () => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        let baked = bakeAdjust(ds, sliders, grain, curve);
        if (monochrome) toMonochrome(baked);
        // Mask-aware compositing: when the user has picked Subject or
        // Background scope and we have a mask, splice the bake with
        // the original downsample so changes only land in-scope. The
        // mask is full-resolution; applyMaskScope scales it to the
        // baked surface during the composite.
        if (scope !== 0 && mask) {
          const scoped = applyMaskScope(ds, baked, mask, scope);
          if (scoped !== baked) {
            releaseCanvas(baked);
            baked = scoped;
          }
        }
        setPreview((prev) => {
          // Don't release the downsampled cache by accident — it
          // lives across renders and bakeAdjust may return it
          // directly when the source is already small.
          if (prev && prev !== ds) releaseCanvas(prev);
          return baked;
        });
      });
    };
    if (debounceMs > 0) {
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        runBake();
      }, debounceMs);
    } else {
      runBake();
    }
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [debounceMs, grain, monochrome, sliders, source, curve, scope, mask]);

  // Drop the last preview AND the cached downsample when the hook
  // unmounts so a tool swap doesn't leak either. The downsample is
  // ~3 MB for a 4K source — worth returning to the pool so the next
  // tool's downsample can reuse the buffer.
  useEffect(() => {
    return () => {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
      const ds = downsampledRef.current;
      if (ds && ds !== sourceRef.current) releaseCanvas(ds);
      downsampledRef.current = null;
      sourceRef.current = null;
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
