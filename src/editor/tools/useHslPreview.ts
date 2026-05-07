// useHslPreview.ts — Live preview for the HSL tool. Shape mirrors
// useLevelsPreview / useAdjustPreview: a downsample is built once per
// source change, the bake re-runs on every parameter mutation, and
// previous bakes go back to the canvas pool.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { bakeHsl, type HslParams, isHslIdentity } from "./hsl";
import { EMPTY_PREVIEW, type PreviewResult } from "./previewResult";
import { previewLongEdge } from "./previewSize";

export function useHslPreview(
  source: HTMLCanvasElement | null,
  params: HslParams,
  /** Bumps on undo / redo / reset / replaceWithFile so the cached
   *  downsample picks up the new pixels even when source identity
   *  is unchanged. See useAdjustPreview for the full rationale. */
  invalidationKey: unknown = null,
): PreviewResult {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  const [preview, setPreview] = useState<PreviewResult>(EMPTY_PREVIEW);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const sourceChanged = source !== sourceRef.current;
    const versionChanged = invalidationKey !== versionRef.current;
    if (sourceChanged || versionChanged) {
      const prev = downsampledRef.current;
      if (prev && prev !== sourceRef.current) releaseCanvas(prev);
      sourceRef.current = source;
      versionRef.current = invalidationKey;
      downsampledRef.current = source ? makeDownsampled(source) : null;
    }
  }, [source, invalidationKey]);

  useEffect(() => {
    if (!source) {
      setPreview((prev) => clearPreview(prev, downsampledRef.current));
      return;
    }
    if (isHslIdentity(params)) {
      setPreview((prev) => clearPreview(prev, downsampledRef.current));
      return;
    }
    if (!downsampledRef.current) downsampledRef.current = makeDownsampled(source);
    const ds = downsampledRef.current;
    if (!ds) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      let baked: HTMLCanvasElement | null = null;
      try {
        baked = bakeHsl(ds, params);
      } catch (err) {
        console.error("[useHslPreview] bake failed", err);
        if (baked && baked !== ds) releaseCanvas(baked);
        setPreview((prev) => clearPreview(prev, ds));
        return;
      }
      const result = baked;
      setPreview((prev) => {
        if (prev.canvas && prev.canvas !== ds && prev.canvas !== result) {
          releaseCanvas(prev.canvas);
        }
        return { canvas: result, version: prev.version + 1 };
      });
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [params, source]);

  useEffect(() => {
    return () => {
      setPreview((prev) => clearPreview(prev, downsampledRef.current));
      const ds = downsampledRef.current;
      if (ds && ds !== sourceRef.current) releaseCanvas(ds);
      downsampledRef.current = null;
      sourceRef.current = null;
    };
  }, []);

  return preview;
}

/** See useAdjustPreview for the rationale. */
function clearPreview(prev: PreviewResult, ds: HTMLCanvasElement | null): PreviewResult {
  if (prev.canvas === null) return prev;
  if (prev.canvas !== ds) releaseCanvas(prev.canvas);
  return { canvas: null, version: prev.version + 1 };
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
