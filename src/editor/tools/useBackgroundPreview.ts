import { useCallback, useEffect, useRef, useState } from "react";
import { releaseCanvas } from "../doc";
import { compositeCutout, type BackgroundFill } from "./backgroundFill";

/** Live composition for an already-transparent source (an imported
 *  cutout or a cached Auto mask). Uses the same ref-owned release
 *  pattern as every other pooled preview hook so React StrictMode can
 *  never return the same canvas to the pool twice. */
export function useBackgroundPreview(
  source: HTMLCanvasElement | null,
  fill: BackgroundFill,
  color: string,
  invalidationKey: unknown,
): HTMLCanvasElement | null {
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null);
  const publishedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const clearPublished = useCallback(() => {
    const published = publishedCanvasRef.current;
    if (published) releaseCanvas(published);
    publishedCanvasRef.current = null;
    setPreview(null);
  }, []);

  useEffect(() => {
    if (!source || fill === "transparent") {
      clearPublished();
      return;
    }
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      let result: HTMLCanvasElement | null = null;
      try {
        result = compositeCutout(source, fill, color);
      } catch (error) {
        console.error("[useBackgroundPreview] composition failed", error);
        clearPublished();
        return;
      }
      const published = publishedCanvasRef.current;
      if (published && published !== result) releaseCanvas(published);
      publishedCanvasRef.current = result;
      setPreview(result);
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [clearPublished, color, fill, invalidationKey, source]);

  useEffect(() => {
    return () => {
      const published = publishedCanvasRef.current;
      if (published) releaseCanvas(published);
      publishedCanvasRef.current = null;
    };
  }, []);

  return preview;
}
