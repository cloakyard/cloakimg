// useBgBlurPreview.ts — Live preview hook for the Background blur
// tool. Mirrors useLevelsPreview / useHslPreview: cache one
// downsample per source change, re-bake on every parameter mutation,
// return the previous bake to the canvas pool before the new one
// replaces it.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { type MaskScope } from "../subjectMask";
import { bakeBgBlur, isBgBlurIdentity } from "./bgBlur";

const PREVIEW_LONG_EDGE_MOBILE = 720;
const PREVIEW_LONG_EDGE_DESKTOP = 1440;
const MOBILE_BREAKPOINT_PX = 768;

function previewLongEdge(): number {
  if (typeof window === "undefined") return PREVIEW_LONG_EDGE_DESKTOP;
  return window.innerWidth < MOBILE_BREAKPOINT_PX
    ? PREVIEW_LONG_EDGE_MOBILE
    : PREVIEW_LONG_EDGE_DESKTOP;
}

export function useBgBlurPreview(
  source: HTMLCanvasElement | null,
  amount: number,
  scope: MaskScope,
  mask: HTMLCanvasElement | null,
): HTMLCanvasElement | null {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (source !== sourceRef.current) {
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
    if (isBgBlurIdentity(amount)) {
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
      const baked = bakeBgBlur(ds, mask, scope, amount);
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
  }, [amount, mask, scope, source]);

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
