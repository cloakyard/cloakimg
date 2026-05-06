// useLevelsPreview.ts — Live preview for the Levels tool. Mirrors the
// useAdjustPreview pattern: downsample the working canvas once per
// (source) change, then re-bake on every parameter mutation against
// the cached downsample. Identity params return null so the canvas
// shows doc.working untouched.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { applyMaskScope, type MaskScope } from "../subjectMask";
import { bakeLevels, isLevelsIdentity, type LevelsParams } from "./levels";

const PREVIEW_LONG_EDGE_MOBILE = 720;
const PREVIEW_LONG_EDGE_DESKTOP = 1440;
const MOBILE_BREAKPOINT_PX = 768;

function previewLongEdge(): number {
  if (typeof window === "undefined") return PREVIEW_LONG_EDGE_DESKTOP;
  return window.innerWidth < MOBILE_BREAKPOINT_PX
    ? PREVIEW_LONG_EDGE_MOBILE
    : PREVIEW_LONG_EDGE_DESKTOP;
}

export function useLevelsPreview(
  source: HTMLCanvasElement | null,
  params: LevelsParams,
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
    if (isLevelsIdentity(params)) {
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
      let baked = bakeLevels(ds, params);
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
      // Release the downsample too — at unmount the source is
      // staying around, but our scratch is no longer needed.
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
