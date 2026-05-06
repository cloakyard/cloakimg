// useLevelsPreview.ts — Live preview for the Levels tool. Mirrors the
// useAdjustPreview pattern: downsample the working canvas once per
// (source) change, then re-bake on every parameter mutation against
// the cached downsample. Identity params return null so the canvas
// shows doc.working untouched.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { applyMaskScope, type MaskScope } from "../subjectMask";
import { bakeLevels, isLevelsIdentity, type LevelsParams } from "./levels";
import { previewLongEdge } from "./previewSize";

export function useLevelsPreview(
  source: HTMLCanvasElement | null,
  params: LevelsParams,
  scope: MaskScope = 0,
  mask: HTMLCanvasElement | null = null,
  /** Bumps on undo / redo / reset / replaceWithFile so the cached
   *  downsample picks up the new pixels even when source identity
   *  is unchanged. See useAdjustPreview for the full rationale. */
  invalidationKey: unknown = null,
): HTMLCanvasElement | null {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const sourceChanged = source !== sourceRef.current;
    const versionChanged = invalidationKey !== versionRef.current;
    if (sourceChanged || versionChanged) {
      // Return the previous downsample canvas to the pool before
      // overwriting the ref. `makeDownsampled` returns the source
      // itself when the image is already under the cap, so guard
      // against releasing a canvas the editor still owns.
      const prev = downsampledRef.current;
      if (prev && prev !== sourceRef.current) releaseCanvas(prev);
      sourceRef.current = source;
      versionRef.current = invalidationKey;
      downsampledRef.current = source ? makeDownsampled(source) : null;
    }
  }, [source, invalidationKey]);

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
      // Bake guard: see useAdjustPreview for the rationale. Mobile
      // devices can throw on OOM or getContext failure mid-bake; we
      // release any intermediate canvas and clear the preview so the
      // canvas falls back to doc.working instead of leaking.
      let baked: HTMLCanvasElement | null = null;
      try {
        baked = bakeLevels(ds, params);
        if (scope !== 0 && mask) {
          const scoped = applyMaskScope(ds, baked, mask, scope);
          if (scoped !== baked) {
            releaseCanvas(baked);
            baked = scoped;
          }
        }
      } catch (err) {
        console.error("[useLevelsPreview] bake failed", err);
        if (baked && baked !== ds) releaseCanvas(baked);
        setPreview((prev) => {
          if (prev && prev !== ds) releaseCanvas(prev);
          return null;
        });
        return;
      }
      const result = baked;
      setPreview((prev) => {
        if (prev && prev !== ds) releaseCanvas(prev);
        return result;
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
