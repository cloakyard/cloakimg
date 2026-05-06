// useSubjectMask.ts — React hook on top of the subject-mask service.
// Components subscribe to `state` (status / progress / error) and use
// `request()` to lazily trigger detection. The doc from EditorContext
// is threaded in here so consumers don't have to re-import it
// everywhere.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorReadOnly, useToolState } from "./EditorContext";
import {
  ensureSubjectMask,
  getMaskState,
  invalidateSubjectMask,
  type MaskState,
  peekMaskDownsample,
  peekSubjectMask,
  subscribeMaskState,
} from "./subjectMask";
import type { BgQuality } from "./tools/smartRemoveBg";

const QUALITY_KEYS: BgQuality[] = ["small", "medium", "large"];

export interface UseSubjectMask {
  state: MaskState;
  /** Returns the cached cut canvas if it matches the current doc.
   *  Sync — does not trigger a load. */
  peek: () => HTMLCanvasElement | null;
  /** Returns a cached downsampled copy of the mask at `longEdge` px
   *  on the long side, falling back to the full-res cut when the
   *  source is already small. Use this from preview hooks where the
   *  baked surface is itself downsampled — pre-sizing the mask once
   *  is much cheaper than asking the browser to scale the full-res
   *  cut on every preview rAF. */
  peekDownsample: (longEdge: number) => HTMLCanvasElement | null;
  /** Trigger detection if needed. Returns the cut canvas on success.
   *  Concurrent callers share the same in-flight promise. */
  request: () => Promise<HTMLCanvasElement>;
  /** Drop the cached mask + reset state to idle. */
  invalidate: () => void;
}

export function useSubjectMask(): UseSubjectMask {
  const { doc } = useEditorReadOnly();
  const { bgQuality } = useToolState();
  const [state, setState] = useState<MaskState>(() => getMaskState());

  useEffect(() => {
    setState(getMaskState());
    return subscribeMaskState(setState);
  }, []);

  const peek = useCallback(() => {
    if (!doc) return null;
    return peekSubjectMask(doc.working);
  }, [doc]);

  const peekDownsample = useCallback(
    (longEdge: number) => {
      if (!doc) return null;
      return peekMaskDownsample(doc.working, longEdge);
    },
    [doc],
  );

  const request = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!doc) throw new Error("No document open");
    return ensureSubjectMask(doc.working, QUALITY_KEYS[bgQuality] ?? "small");
  }, [bgQuality, doc]);

  const invalidate = useCallback(() => {
    invalidateSubjectMask();
  }, []);

  return useMemo(
    () => ({ state, peek, peekDownsample, request, invalidate }),
    [invalidate, peek, peekDownsample, request, state],
  );
}
