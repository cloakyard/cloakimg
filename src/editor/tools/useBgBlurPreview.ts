// useBgBlurPreview.ts — Live preview hook for the Background blur
// tool. Mirrors useLevelsPreview / useHslPreview: cache one
// downsample per source change, re-bake on every parameter mutation,
// return the previous bake to the canvas pool before the new one
// replaces it.

import { useEffect, useRef, useState } from "react";
import { createCanvas, releaseCanvas } from "../doc";
import { type MaskScope, peekMaskDownsample } from "../subjectMask";
import { bakeBgBlur, isBgBlurIdentity, type LensKind } from "./bgBlur";
import { EMPTY_PREVIEW, type PreviewResult } from "./previewResult";
import { previewLongEdge } from "./previewSize";

export function useBgBlurPreview(
  source: HTMLCanvasElement | null,
  amount: number,
  lens: LensKind,
  progressive: boolean,
  scope: MaskScope,
  /** True iff the central subject-mask service has a detected cut
   *  for the current source. The bake reads the cached canvas
   *  directly inside its rAF — passing the canvas through React was
   *  racing with cache lifecycle. See useAdjustPreview for context. */
  maskReady: boolean,
  /** Bumps on undo / redo / reset / replaceWithFile so the cached
   *  downsample picks up the new pixels even when source identity
   *  is unchanged. See useAdjustPreview for the full rationale. */
  invalidationKey: unknown = null,
): PreviewResult {
  const downsampledRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const versionRef = useRef<unknown>(null);
  // See useAdjustPreview for why the preview is wrapped with a
  // monotonic version — pool reuse means the canvas-element identity
  // can repeat across consecutive bakes.
  const [preview, setPreview] = useState<PreviewResult>(EMPTY_PREVIEW);
  // Track the currently-published preview canvas in a ref so we can
  // release it BEFORE calling setPreview. React StrictMode double-
  // invokes useState updater functions to flag impurity; if the
  // releaseCanvas call lives inside the updater it runs twice,
  // pushing the SAME canvas onto the pool twice. The next two
  // acquireCanvas calls then hand out the same element — bakeGaussian
  // and applyMaskScope step on each other and the preview "freezes"
  // after the pool starts handing out duplicates. Releasing outside
  // the updater fixes the impurity.
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
    // Helper: clear the published preview, releasing its canvas back
    // to the pool. The release lives OUTSIDE the setState updater —
    // see the comment on publishedCanvasRef for why.
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
    if (isBgBlurIdentity(amount)) {
      clearPublished();
      return;
    }
    if (scope !== 0 && !maskReady) {
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
        // Read the freshest mask from the service — see the
        // useAdjustPreview comment block for why we don't trust a
        // mask reference threaded through React. peekMaskDownsample
        // is O(1) so the per-rAF cost is negligible.
        const liveMask = scope !== 0 ? peekMaskDownsample(source, previewLongEdge()) : null;
        baked = bakeBgBlur(ds, liveMask, scope, { amount, lens, progressive });
      } catch (err) {
        console.error("[useBgBlurPreview] bake failed", err);
        if (baked && baked !== ds) releaseCanvas(baked);
        clearPublished();
        return;
      }
      const result = baked;
      // Release the previously-published canvas BEFORE setPreview so
      // the side effect doesn't live inside the updater. Pure updaters
      // are required for StrictMode safety — see the publishedCanvasRef
      // declaration for the full rationale.
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
  }, [amount, lens, progressive, maskReady, scope, source]);

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
