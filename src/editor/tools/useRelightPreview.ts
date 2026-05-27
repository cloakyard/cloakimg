// useRelightPreview.ts — Downsampled live preview of the depth-aware
// relight bake. Mirrors useAdjustPreview's lifecycle exactly: a cached
// source downsample, an rAF-scheduled bake, the StrictMode-safe
// publishedCanvasRef + versionCounterRef release discipline, and the
// same mask-scope branch (Whole / Subject / Background).
//
// The bake is suppressed (preview → null, canvas shows doc.working) when
// there's no depth map yet, when params are identity (intensity 0), or
// when a non-Whole scope is picked but the subject mask isn't ready.

import { useEffect, useRef, useState } from "react";
import { applyMaskScope, type MaskScope, peekMaskDownsample } from "../ai/subjectMask";
import { createCanvas, releaseCanvas } from "../doc";
import { EMPTY_PREVIEW, type PreviewResult } from "./previewResult";
import { previewLongEdge } from "./previewSize";
import { bakeRelight, isRelightIdentity, type RelightParams } from "./relight";

export function useRelightPreview(
  source: HTMLCanvasElement | null,
  /** Source-resolution grayscale depth map, or null until depth is
   *  ready. The bake is suppressed while null. */
  depthCanvas: HTMLCanvasElement | null,
  params: RelightParams,
  scope: MaskScope = 0,
  maskReady = false,
  /** Bumps whenever doc.working pixels may have changed without changing
   *  canvas identity (undo/redo/reset/another tool's bake). */
  invalidationKey: unknown = null,
): PreviewResult {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  const [preview, setPreview] = useState<PreviewResult>(EMPTY_PREVIEW);
  const publishedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const versionCounterRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Rebuild the source downsample when the source reference changes
  // (replaceWithFile) or the invalidation key changes (undo/redo/reset/
  // a prior tool's commit). Same dance as useAdjustPreview.
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

  const { sunX, sunY, elevation, intensity, warmth } = params;

  useEffect(() => {
    const clearPublished = () => {
      const pub = publishedCanvasRef.current;
      if (pub === null) return;
      if (pub !== downsampledRef.current) releaseCanvas(pub);
      publishedCanvasRef.current = null;
      versionCounterRef.current += 1;
      setPreview({ canvas: null, version: versionCounterRef.current });
    };

    if (!source || !depthCanvas) {
      clearPublished();
      return;
    }
    if (isRelightIdentity({ sunX, sunY, elevation, intensity, warmth })) {
      clearPublished();
      return;
    }
    // Scope gating: a non-Whole scope with no ready mask would bake a
    // misleading whole-image preview — suppress until the mask lands.
    if (scope !== 0 && !maskReady) {
      clearPublished();
      return;
    }
    if (!downsampledRef.current) {
      downsampledRef.current = makeDownsampled(source);
    }
    const ds = downsampledRef.current;
    if (!ds) return;

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      let baked: HTMLCanvasElement | null = null;
      try {
        // bakeRelight resizes the (source-res) depth map to ds dims
        // internally, so a downsampled source still gets aligned depth.
        baked = bakeRelight(ds, depthCanvas, { sunX, sunY, elevation, intensity, warmth });
        if (scope !== 0) {
          const liveMask = peekMaskDownsample(source, previewLongEdge());
          if (!liveMask) {
            if (baked !== ds) releaseCanvas(baked);
            return;
          }
          const scoped = applyMaskScope(ds, baked, liveMask, scope);
          if (scoped !== baked) {
            releaseCanvas(baked);
            baked = scoped;
          }
        }
      } catch (err) {
        console.error("[useRelightPreview] bake failed", err);
        if (baked && baked !== ds) releaseCanvas(baked);
        clearPublished();
        return;
      }
      const result = baked;
      const pub = publishedCanvasRef.current;
      if (pub && pub !== ds && pub !== result) releaseCanvas(pub);
      publishedCanvasRef.current = result;
      versionCounterRef.current += 1;
      setPreview({ canvas: result, version: versionCounterRef.current });
    });

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [source, depthCanvas, sunX, sunY, elevation, intensity, warmth, scope, maskReady]);

  // Drop the last preview + cached downsample on unmount so a tool swap
  // doesn't leak either.
  useEffect(() => {
    return () => {
      const pub = publishedCanvasRef.current;
      if (pub && pub !== downsampledRef.current) releaseCanvas(pub);
      publishedCanvasRef.current = null;
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
