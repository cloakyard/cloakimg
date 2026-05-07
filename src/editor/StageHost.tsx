// StageHost.tsx — Persistent ImageCanvas mount.
//
// Each tool used to render its own `<ImageCanvas>` from `ToolStage`.
// Switching tools therefore unmounted+remounted the entire Fabric
// canvas: the DOM element was destroyed, a new one mounted, the bg
// image effect re-ran, the viewport reset, and `loadFromJSON` rehydrated
// the snapshot async — visible to the user as a hard flash on every
// tool change.
//
// StageHost flips the model: one stable `<ImageCanvas>` lives in
// `EditorShell`, and tools register their props (paintOverlay, pointer
// handlers, cursor, fabricInteractive, previewCanvas, …) via
// `useStageProps`. The Fabric canvas + its scene survive the swap, so
// tool transitions are seamless.

import {
  createContext,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { ImageCanvas, type ImagePoint, type Transform } from "./ImageCanvas";
import type { ToolState } from "./toolState";

export interface StageProps {
  paintOverlay?: (
    ctx: CanvasRenderingContext2D,
    transform: Transform,
    toolState: ToolState,
  ) => void;
  onImagePointerDown?: (p: ImagePoint, e: ReactPointerEvent<HTMLDivElement>) => void;
  onImagePointerMove?: (p: ImagePoint, e: ReactPointerEvent<HTMLDivElement>) => void;
  onImagePointerUp?: (p: ImagePoint, e: ReactPointerEvent<HTMLDivElement>) => void;
  cursor?: CSSProperties["cursor"];
  hideHints?: boolean;
  cssFilter?: string;
  previewCanvas?: HTMLCanvasElement | null;
  /** Monotonic counter the preview hooks bump on every successful
   *  bake. Forces ImageCanvas's bg-image effect to re-fire even when
   *  `previewCanvas` happens to alias the previous one — the canvas
   *  pool's LIFO can hand back the same element across consecutive
   *  bakes, and Fabric's bg-cache won't notice that the *pixels*
   *  changed unless something tells it to. Comparing the version
   *  forces the effect to fire and call `bg.dirty = true` again. */
  previewVersion?: number;
  fabricInteractive?: boolean;
}

const EMPTY: StageProps = {};

// Two contexts: one for the value (changes per tool render), one for
// the setter (stable). Tool components consume only the setter, so
// they don't re-render on stage prop churn from sibling tools.
const StagePropsCtx = createContext<StageProps>(EMPTY);
const StageSetCtx = createContext<(p: StageProps) => void>(() => {});

export function StageProvider({ children }: { children: ReactNode }) {
  const [props, setProps] = useState<StageProps>(EMPTY);
  const set = useCallback((next: StageProps) => {
    setProps((prev) => (shallowEqualStageProps(prev, next) ? prev : next));
  }, []);
  return (
    <StageSetCtx.Provider value={set}>
      <StagePropsCtx.Provider value={props}>{children}</StagePropsCtx.Provider>
    </StageSetCtx.Provider>
  );
}

/** Tool components call this to register their stage props. The
 *  registration is cleared on unmount so the next tool starts from a
 *  clean baseline. */
export function useStageProps(props: StageProps) {
  const set = useContext(StageSetCtx);
  // Push the latest props on every render; the setter shallow-bails so
  // unchanged props don't trigger a re-render of the StageHost tree.
  useLayoutEffect(() => {
    set(props);
  });
  // Clear on unmount so a stale paintOverlay / cursor doesn't bleed
  // into the next tool before its first render commits.
  useEffect(() => {
    return () => set(EMPTY);
  }, [set]);
}

/** The single persistent ImageCanvas. Mount once at the top of the
 *  tool stage; subsequent tool changes only update its props. */
export function StageHost() {
  const props = useContext(StagePropsCtx);
  return <ImageCanvas {...props} />;
}

function shallowEqualStageProps(a: StageProps, b: StageProps): boolean {
  return (
    a.paintOverlay === b.paintOverlay &&
    a.onImagePointerDown === b.onImagePointerDown &&
    a.onImagePointerMove === b.onImagePointerMove &&
    a.onImagePointerUp === b.onImagePointerUp &&
    a.cursor === b.cursor &&
    a.hideHints === b.hideHints &&
    a.cssFilter === b.cssFilter &&
    a.previewCanvas === b.previewCanvas &&
    a.previewVersion === b.previewVersion &&
    a.fabricInteractive === b.fabricInteractive
  );
}
