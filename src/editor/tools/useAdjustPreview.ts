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
import { applyMaskScope, type MaskScope, peekMaskDownsample } from "../subjectMask";
import { type CurvePoint, isCurveIdentity } from "../toolState";
import { bakeAdjust, isIdentity } from "./adjustments";
import { EMPTY_PREVIEW, type PreviewResult } from "./previewResult";
import { previewLongEdge } from "./previewSize";

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
   *  When scope is non-zero AND the subject-mask service reports
   *  ready, the bake reads the cached downsample directly from the
   *  service inside its rAF. When scope is non-zero but the mask
   *  isn't ready, we suppress the preview so the canvas keeps
   *  showing `doc.working`. */
  scope: MaskScope = 0,
  /** True iff the central subject-mask service has a detected cut
   *  for the current source. The bake reads the canvas directly
   *  from the service the moment it bakes, so any reference drift
   *  in the React tree is irrelevant. */
  maskReady: boolean = false,
  /** Bumps whenever doc.working pixels may have changed without
   *  changing canvas identity (undo, redo, reset, replaceWithFile,
   *  another tool baked into history). The caller passes the doc
   *  reference itself — `setDoc` produces a new doc object on every
   *  history mutation so identity comparison here catches all cases.
   *  Without this, the cached downsample holds the pre-mutation
   *  pixels and the preview ghost-survives the undo. */
  invalidationKey: unknown = null,
): PreviewResult {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  // Wrap the preview canvas + a monotonic version number. Each
  // successful bake bumps the version, so consumers (StageHost +
  // ImageCanvas) detect the change even when the canvas-pool LIFO
  // hands back the same element across consecutive bakes.
  const [preview, setPreview] = useState<PreviewResult>(EMPTY_PREVIEW);
  // Track the published canvas in a ref so the release-back-to-pool
  // happens BEFORE setPreview, not inside its updater. React StrictMode
  // double-invokes useState updaters in dev to flag impurity; if
  // releaseCanvas lives inside the updater, the same canvas gets
  // pushed onto the pool twice and the next two acquires hand back
  // duplicate references — bake outputs collide and the preview
  // appears to "freeze" after a few slider changes.
  const publishedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const versionCounterRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const debounceRef = useRef<number | null>(null);

  // Rebuild the downsample when EITHER the source canvas reference
  // changes (replaceWithFile) OR the invalidation key changes (undo,
  // redo, reset, prior-tool's commit). Return the previous downsample
  // to the pool before replacing the ref — `makeDownsampled` returns
  // the source itself when the image is already under the cap, so
  // guard against releasing the live canvas.
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

  // Bake the preview on every change. The previous bake gets returned
  // to the canvas pool right before the new one replaces it, so we
  // don't allocate per change.
  useEffect(() => {
    // Release the previously-published canvas back to the pool, then
    // publish a clear preview. The release lives OUTSIDE the setState
    // updater (StrictMode double-invokes updaters; impure releases
    // would push the same canvas onto the pool twice).
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
    const curveActive = !!curve && !isCurveIdentity(curve);
    if (isIdentity(sliders) && grain === 0 && !monochrome && !curveActive) {
      clearPublished();
      return;
    }
    // Scope gating: when the user has picked Subject / Background
    // but the mask isn't ready, suppress the preview entirely so the
    // canvas keeps showing `doc.working`. Without this we'd bake a
    // misleading whole-image preview during detection — exactly the
    // "controls drift while AI is loading" UX the gating was added
    // to prevent.
    if (scope !== 0 && !maskReady) {
      clearPublished();
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
        // Defend against bake throws (OOM, getContext failures on
        // memory-pressured mobile). Without this guard a single failing
        // frame leaks the intermediate `baked` canvas *and* leaves the
        // previous preview painted, so the user sees stale pixels until
        // they touch a slider again.
        let baked: HTMLCanvasElement | null = null;
        try {
          baked = bakeAdjust(ds, sliders, grain, curve);
          if (monochrome) toMonochrome(baked);
          if (scope !== 0 && source) {
            // Read the freshest mask from the service at the moment
            // we bake — bypasses any stale React-tree references.
            // peekMaskDownsample is O(1) (cache lookup + dim check),
            // so the per-rAF cost is negligible.
            const liveMask = peekMaskDownsample(source, previewLongEdge());
            if (!liveMask) {
              // Cache went stale between the effect's gate check and
              // this rAF (e.g. dim drift detected by another peek
              // this tick). Skip painting; keeping the previous
              // scoped preview visible reads better than either
              // (a) blanking to doc.working or (b) silently falling
              // through to a misleading whole-image bake. The
              // pending re-detection will refresh the mask shortly.
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
          console.error("[useAdjustPreview] bake failed", err);
          if (baked && baked !== ds) releaseCanvas(baked);
          clearPublished();
          return;
        }
        const result = baked;
        // Release the previously-published canvas BEFORE setPreview so
        // the side effect doesn't live inside an updater. ds is owned
        // by the hook (not pool) and bakeAdjust may return it directly
        // when the source is already small — guard against releasing.
        const pub = publishedCanvasRef.current;
        if (pub && pub !== ds && pub !== result) releaseCanvas(pub);
        publishedCanvasRef.current = result;
        versionCounterRef.current += 1;
        setPreview({ canvas: result, version: versionCounterRef.current });
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
  }, [debounceMs, grain, monochrome, sliders, source, curve, scope, maskReady]);

  // Drop the last preview AND the cached downsample when the hook
  // unmounts so a tool swap doesn't leak either. The downsample is
  // ~3 MB for a 4K source — worth returning to the pool so the next
  // tool's downsample can reuse the buffer.
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
