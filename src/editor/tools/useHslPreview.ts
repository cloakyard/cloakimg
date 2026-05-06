// useHslPreview.ts — Live preview for the HSL tool. Shape mirrors
// useLevelsPreview / useAdjustPreview: a downsample is built once per
// source change, the bake re-runs on every parameter mutation, and
// previous bakes go back to the canvas pool.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { applyMaskScope, type MaskScope } from "../subjectMask";
import { bakeHsl, type HslParams, isHslIdentity } from "./hsl";
import { previewLongEdge } from "./previewSize";

export function useHslPreview(
  source: HTMLCanvasElement | null,
  params: HslParams,
  scope: MaskScope = 0,
  mask: HTMLCanvasElement | null = null,
): HTMLCanvasElement | null {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (source !== sourceRef.current) {
      // Return the previous downsample canvas to the pool before
      // overwriting the ref. `makeDownsampled` returns the source
      // itself when the image is already under the cap, so guard
      // against releasing a canvas the editor still owns.
      const prev = downsampledRef.current;
      if (prev && prev !== sourceRef.current) releaseCanvas(prev);
      sourceRef.current = source;
      downsampledRef.current = source ? makeDownsampled(source) : null;
    }
  }, [source]);

  useEffect(() => {
    if (!source) {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
      return;
    }
    if (isHslIdentity(params)) {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
      return;
    }
    // Scope gating: see useAdjustPreview for the full reasoning —
    // skip baking while the user has Subject / Background selected
    // and the mask isn't ready, so the canvas shows the original
    // until detection lands.
    if (scope !== 0 && !mask) {
      setPreview((prev) => {
        if (prev && prev !== downsampledRef.current) releaseCanvas(prev);
        return null;
      });
      return;
    }
    if (!downsampledRef.current) downsampledRef.current = makeDownsampled(source);
    const ds = downsampledRef.current;
    if (!ds) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      let baked = bakeHsl(ds, params);
      if (scope !== 0 && mask) {
        const scoped = applyMaskScope(ds, baked, mask, scope);
        if (scoped !== baked) {
          releaseCanvas(baked);
          baked = scoped;
        }
      }
      setPreview((prev) => {
        if (prev && prev !== ds) releaseCanvas(prev);
        return baked;
      });
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [params, source, scope, mask]);

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
