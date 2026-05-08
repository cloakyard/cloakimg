// MobileSheet.tsx — On mobile, the right panel becomes a bottom sheet
// pinned above the toolbar. Same controls, friendlier layout.
//
// The sheet sits *in flow* between the canvas and the toolbar so that
// opening it pushes the canvas up — the image stays fully visible
// while the user is editing instead of disappearing under an overlay.
//
// Open state: a thin drag-handle pill sits centred at the top of the
// drawer (iOS-style). Tap toggles open/closed; drag down past a
// threshold dismisses. No big coral FAB — the handle reads as
// "draggable surface" and stays visually quiet so the user's eye
// goes to the controls below.
//
// Closed state: a slim re-open chip floats above the toolbar with a
// chevron-up icon and the active tool's name. That's the only place
// the tool name lives now (the previous header inside the open
// drawer was redundant with the bottom toolbar's active tab).
//
// A short slide-up / slide-down animation drives the open/closed
// transition. Switching tools auto-pops the drawer back open.

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { I } from "../components/icons";
import { useEditor } from "./EditorContext";
import { LayersList } from "./LayersList";
import { ToolControls } from "./ToolControls";
import { findTool } from "./tools";

const DRAG_DISMISS_PX = 100;
const SLIDE_MS = 220;

type Phase = "open" | "closing" | "closed";

export function MobileSheet() {
  const { toolState } = useEditor();
  const [phase, setPhase] = useState<Phase>("open");
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);
  // Measured cap: half the height of the canvas+drawer sub-container so
  // the drawer never grows taller than the canvas above it. The canvas
  // and drawer are siblings inside that wrapper; the toolbar sits one
  // level up so it's excluded from the calculation. Falls back to the
  // CSS default (45vh) when the measurement isn't ready yet.
  const [maxPx, setMaxPx] = useState<number>(0);
  useLayoutEffect(() => {
    const outer = wrapRef.current;
    if (!outer) return;
    const parent = outer.parentElement;
    if (!parent) return;
    const update = () => {
      const h = parent.clientHeight;
      if (h > 0) setMaxPx(Math.floor(h * 0.5));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // Re-open the sheet whenever the user switches tools — picking a new
  // tool from the bottom toolbar implies they want to see its controls.
  const lastToolRef = useRef(toolState.activeTool);
  useEffect(() => {
    if (lastToolRef.current !== toolState.activeTool) {
      lastToolRef.current = toolState.activeTool;
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
      setPhase("open");
    }
  }, [toolState.activeTool]);

  // Cleanup the close timer on unmount.
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const startClose = useCallback(() => {
    if (phase !== "open") return;
    setPhase("closing");
    closeTimerRef.current = window.setTimeout(() => {
      setPhase("closed");
      closeTimerRef.current = null;
    }, SLIDE_MS);
  }, [phase]);

  const openNow = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setPhase("open");
  }, []);

  // Drag-to-dismiss: only intercept on the chevron-down handle so the
  // body's native scrolling stays untouched on iOS Safari.
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
    dragDeltaRef.current = 0;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const y = e.touches[0]?.clientY;
    if (y == null) return;
    const delta = Math.max(0, y - touchStartY.current);
    if (sheetRef.current) {
      dragDeltaRef.current = delta;
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    touchStartY.current = null;
    if (!sheetRef.current) return;
    sheetRef.current.style.transition = "";
    sheetRef.current.style.transform = "";
    const d = dragDeltaRef.current;
    dragDeltaRef.current = 0;
    if (d > DRAG_DISMISS_PX) startClose();
  }, [startClose]);

  if (phase === "closed") {
    // Slim re-open chip — far less visually loud than the previous
    // 44 px coral disc. Tool name lives here (the only place it's
    // shown when the drawer is closed) so the user can confirm what
    // panel they'd be opening before they tap.
    return (
      <div ref={wrapRef} className="contents">
        <button
          type="button"
          onClick={openNow}
          aria-label={`Open ${findTool(toolState.activeTool).name} controls`}
          className="absolute bottom-22 left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full border border-border-soft bg-surface/85 px-3 py-1.5 text-[12px] font-semibold text-text backdrop-blur-md backdrop-saturate-150 active:scale-[0.97] dark:border-dark-border dark:bg-dark-surface/85 dark:text-dark-text"
          style={{
            animation: "ci-fab-in 200ms ease-out both",
            boxShadow: "0 8px 20px -8px rgba(0,0,0,0.18), 0 2px 6px -2px rgba(0,0,0,0.10)",
          }}
        >
          <I.ChevronUp size={13} stroke={2.5} className="text-coral-600 dark:text-coral-300" />
          {findTool(toolState.activeTool).name}
        </button>
      </div>
    );
  }

  const closing = phase === "closing";
  const sheetStyle: CSSProperties & Record<"--ci-sheet-max", string> = {
    animation: `${closing ? "ci-sheet-down" : "ci-sheet-up"} ${SLIDE_MS}ms ease-out both`,
    boxShadow: "0 -8px 24px -8px rgba(0,0,0,0.12)",
    "--ci-sheet-max": maxPx > 0 ? `${maxPx}px` : "45vh",
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <div
        ref={sheetRef}
        className="editor-paper flex flex-col overflow-hidden rounded-t-2xl border-t border-border-soft bg-page-bg dark:border-dark-border dark:bg-dark-page-bg"
        style={sheetStyle}
      >
        {/* Drag-handle pill — iOS-style affordance. Tap toggles
            closed; drag-down past DRAG_DISMISS_PX dismisses. The
            wrapping button gives the touch target ~44 px tall while
            the visible pill stays a thin 4 px line — keeps the
            drawer chrome quiet. */}
        <button
          type="button"
          onClick={startClose}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          aria-label="Close panel — drag down to dismiss"
          className="group flex h-7 shrink-0 cursor-pointer touch-none items-center justify-center border-none bg-transparent p-0"
        >
          <span
            aria-hidden
            className="h-1 w-9 rounded-full bg-border transition-colors group-active:bg-text-muted dark:bg-dark-border dark:group-active:bg-dark-text-muted"
          />
        </button>
        {/* `key={activeTool}` remounts on tool switch so scrollTop
            resets to 0. Without this, scrolling deep into a tall panel
            (e.g. Adjust) on the mobile sheet and switching to a shorter
            one left the new panel scrolled past its content. */}
        <div
          key={toolState.activeTool}
          className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-1.5 pb-5"
        >
          <ToolControls />
        </div>
        <LayersList />
      </div>
    </div>
  );
}
