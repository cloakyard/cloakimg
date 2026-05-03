// MobileSheet.tsx — On mobile, the right panel becomes a bottom sheet
// pinned above the toolbar. Same controls, friendlier layout.
//
// The sheet sits *in flow* between the canvas and the toolbar so that
// opening it pushes the canvas up — the image stays fully visible
// while the user is editing instead of disappearing under an overlay.
// Closed state floats a coral chevron-up FAB above the toolbar; the
// open drawer puts a matching coral chevron-down FAB at its top edge
// (dual purpose: tap to close, drag down to dismiss). A short
// slide-up / slide-down animation drives the transition between the
// two states. Switching tools auto-pops the drawer back open.

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { I } from "../icons";
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
    return (
      <div ref={wrapRef} className="contents">
        <button
          type="button"
          onClick={openNow}
          aria-label="Open tool controls"
          className="absolute bottom-22 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-coral-500 p-0 text-white active:bg-coral-600"
          style={{
            animation: "ci-fab-in 200ms ease-out both",
            boxShadow: "0 10px 24px -8px rgba(245,97,58,0.55), 0 4px 10px -2px rgba(0,0,0,0.22)",
          }}
        >
          <I.ChevronUp size={18} stroke={2.5} />
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
    <div ref={wrapRef} className="relative mt-1.5 shrink-0">
      {/* Chevron lives in the outer wrapper so the inner panel can clip
          its content to the animated height without clipping the FAB
          that sits above the drawer's top edge. */}
      <button
        type="button"
        onClick={startClose}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        aria-label="Close panel"
        className="absolute -top-5 left-1/2 z-10 flex h-10 w-10 -translate-x-1/2 cursor-pointer touch-none items-center justify-center rounded-full border-none bg-coral-500 p-0 text-white active:bg-coral-600"
        style={{
          boxShadow: "0 10px 24px -8px rgba(245,97,58,0.55), 0 4px 10px -2px rgba(0,0,0,0.22)",
        }}
      >
        <I.ChevronDown size={17} stroke={2.5} />
      </button>
      <div
        ref={sheetRef}
        className="editor-paper flex flex-col overflow-hidden rounded-t-2xl border-t border-border-soft bg-page-bg dark:border-dark-border dark:bg-dark-page-bg"
        style={sheetStyle}
      >
        <div className="flex shrink-0 items-center gap-2.5 px-4 pt-6 pb-2">
          <span className="text-[13.5px] font-semibold text-coral-700 dark:text-coral-300">
            {findTool(toolState.activeTool).name}
          </span>
        </div>
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-5">
          <ToolControls />
        </div>
        <LayersList />
      </div>
    </div>
  );
}
