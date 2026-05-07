// useLevelsPreview.ts — Live preview for the Levels tool. Mirrors the
// useAdjustPreview pattern: downsample the working canvas once per
// (source) change, then re-bake on every parameter mutation against
// the cached downsample. Identity params return null so the canvas
// shows doc.working untouched.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { bakeLevels, isLevelsIdentity, type LevelsParams } from "./levels";
import { EMPTY_PREVIEW, type PreviewResult } from "./previewResult";
import { previewLongEdge } from "./previewSize";

export function useLevelsPreview(
  source: HTMLCanvasElement | null,
  params: LevelsParams,
  /** Bumps on undo / redo / reset / replaceWithFile so the cached
   *  downsample picks up the new pixels even when source identity
   *  is unchanged. See useAdjustPreview for the full rationale. */
  invalidationKey: unknown = null,
): PreviewResult {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  const [preview, setPreview] = useState<PreviewResult>(EMPTY_PREVIEW);
  // Track the published canvas in a ref so the release-back-to-pool
  // happens BEFORE setPreview, not inside its updater. StrictMode
  // double-invokes useState updaters; impure releases would push the
  // same canvas onto the pool twice.
  const publishedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const versionCounterRef = useRef(0);
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
    const clearPublished = () => {
      const pub = publishedCanvasRef.current;
      if (pub === null) return;
      if (pub !== downsampledRef.current) releaseCanvas(pub);
      publishedCanvasRef.current = null;
      versionCounterRef.current += 1;
      setPreview({ canvas: null, version: versionCounterRef.current });
    };

    if (!source) {
      clearPublished();
      return;
    }
    if (isLevelsIdentity(params)) {
      clearPublished();
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
        baked = bakeLevels(ds, params);
      } catch (err) {
        console.error("[useLevelsPreview] bake failed", err);
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
  }, [params, source]);

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
