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
    if (isBgBlurIdentity(amount)) {
      setPreview((prev) => clearPreview(prev, downsampledRef.current));
      return;
    }
    // Scope gating: see useAdjustPreview for the full reasoning —
    // skip baking while the user has Subject / Background selected
    // and the mask isn't ready, so the canvas shows the original
    // until detection lands. Without this, picking "Subject" on a
    // cold doc would briefly blur the whole image (the bake's
    // mask=null fallback) and read as "subject blur is broken".
    if (scope !== 0 && !maskReady) {
      setPreview((prev) => clearPreview(prev, downsampledRef.current));
      return;
    }
    if (!downsampledRef.current) downsampledRef.current = makeDownsampled(source);
    const ds = downsampledRef.current;
    if (!ds) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      // Bake guard: bakeBgBlur composes 4+ pooled canvases on
      // progressive mode. A throw mid-compose would orphan whichever
      // canvases were still in flight; bail back to doc.working
      // instead of holding a half-built preview canvas.
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
  }, [amount, lens, progressive, maskReady, scope, source]);

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
