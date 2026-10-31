// Compact controls stay above a persistent tool dock. The catalogue is an
// overlay, so browsing tools never unregisters the current pending apply.
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { I } from "../components/icons";
import { useActiveTool, useEditorActions } from "./EditorContext";
import { CompactToolNav } from "./CompactToolNav";
import { LayersList } from "./LayersList";
import { ToolControls } from "./ToolControls";
import { findTool, type ToolId } from "./tools";

const DRAG_DISMISS_PX = 100;
const DRAG_DISMISS_VELOCITY = 0.11;
const DRAG_SETTLE_MS = 220;
const EASING = "var(--air-ease-out)";

export function MobileEditorSurface({
  onOpenSearch,
  moveRequest,
}: {
  onOpenSearch: () => void;
  moveRequest: number;
}) {
  const activeTool = useActiveTool();
  const { setActiveTool, cancelCurrentTool, runBusy } = useEditorActions();
  const [moveOpen, setMoveOpen] = useState(false);
  const expanded = activeTool !== "move" || moveOpen;
  const lastMoveRequest = useRef(moveRequest);
  useEffect(() => {
    if (moveRequest !== lastMoveRequest.current) setMoveOpen(true);
    lastMoveRequest.current = moveRequest;
  }, [moveRequest]);
  const [expandedControls, setExpandedControls] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [availablePx, setAvailablePx] = useState(0);
  const [dockH, setDockH] = useState(72);
  const [headingSlot, setHeadingSlot] = useState<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(56);
  const [contentH, setContentH] = useState(240);
  const observerRef = useRef<ResizeObserver | null>(null);

  useLayoutEffect(() => {
    const parent = wrapRef.current?.parentElement;
    const dock = dockRef.current;
    if (!parent || !dock) return;
    const update = () => {
      setAvailablePx(parent.clientHeight);
      setDockH(dock.getBoundingClientRect().height);
    };
    const observer = new ResizeObserver(update);
    observer.observe(parent);
    observer.observe(dock);
    update();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const update = () => setHeaderH(header.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(header);
    update();
    return () => observer.disconnect();
  }, [expanded]);

  const setContentRef = useCallback((element: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!element) return;
    const update = () => setContentH(element.getBoundingClientRect().height);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observerRef.current = observer;
    update();
  }, []);
  useEffect(() => () => observerRef.current?.disconnect(), []);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setExpandedControls(false);
  }, [activeTool]);

  // setActiveTool awaits the pending bake while the stage and panel remain
  // mounted. Cancel uses the provider's tool-entry checkpoint on every layout.
  const handleClose = useCallback(async () => {
    await setActiveTool("move");
    setMoveOpen(false);
  }, [setActiveTool]);
  const handleCancel = useCallback(async () => {
    await runBusy("Cancelling…", cancelCurrentTool);
    setMoveOpen(false);
  }, [cancelCurrentTool, runBusy]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"], [role="listbox"]')
      )
        return;
      // Base UI may close the listbox before this window listener runs.
      // Its trigger still owns Escape; don't cancel the pending image edit.
      if (
        target?.closest(
          'input, textarea, [contenteditable=true], [role="combobox"], [role="listbox"], [role="option"], [role="dialog"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      void handleCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, handleCancel]);

  // Drag-to-dismiss on the drag handle. Pointer capture keeps the
  // gesture stable off-edge; velocity lets a short flick dismiss; a
  // short drag retargets from its current position and settles back.
  // Only the handle intercepts, so content keeps native scrolling.
  const dragPointerIdRef = useRef<number | null>(null);
  const dragStartYRef = useRef(0);
  const dragStartTimeRef = useRef(0);
  const dragBaseYRef = useRef(0);
  const dragDeltaRef = useRef(0);
  const dragSettleTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (dragSettleTimerRef.current !== null) {
        window.clearTimeout(dragSettleTimerRef.current);
      }
    },
    [],
  );

  const onDragStart = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, input, [role=combobox]")) return;
    if (dragPointerIdRef.current !== null) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    if (dragSettleTimerRef.current !== null) {
      window.clearTimeout(dragSettleTimerRef.current);
      dragSettleTimerRef.current = null;
    }
    dragPointerIdRef.current = event.pointerId;
    dragStartYRef.current = event.clientY;
    dragStartTimeRef.current = performance.now();
    const transform = window.getComputedStyle(sheet).transform;
    const currentY = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
    dragBaseYRef.current = currentY;
    dragDeltaRef.current = currentY;
    sheet.style.transition = "none";
    sheet.style.transform = `translateY(${currentY}px)`;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onDragMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (dragPointerIdRef.current !== event.pointerId) return;
    const travel = Math.max(0, event.clientY - dragStartYRef.current);
    const delta = dragBaseYRef.current + travel;
    dragDeltaRef.current = delta;
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`;
  }, []);

  const finishDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled = false) => {
      if (dragPointerIdRef.current !== event.pointerId) return;
      dragPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      const sheet = sheetRef.current;
      if (!sheet) return;
      const elapsed = Math.max(1, performance.now() - dragStartTimeRef.current);
      const travel = Math.max(0, dragDeltaRef.current - dragBaseYRef.current);
      const velocity = travel / elapsed;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const dismiss =
        !cancelled && (dragDeltaRef.current >= DRAG_DISMISS_PX || velocity > DRAG_DISMISS_VELOCITY);
      sheet.style.transition = reduceMotion ? "none" : `transform ${DRAG_SETTLE_MS}ms ${EASING}`;
      if (!dismiss) {
        sheet.style.transform = "";
        dragDeltaRef.current = 0;
        if (reduceMotion) sheet.style.transition = "none";
        else {
          dragSettleTimerRef.current = window.setTimeout(() => {
            sheet.style.transition = "none";
            dragSettleTimerRef.current = null;
          }, DRAG_SETTLE_MS);
        }
        return;
      }
      sheet.style.transform = reduceMotion ? "" : "translateY(100%)";
      const settle = () => {
        sheet.style.transition = "none";
        sheet.style.transform = "";
        dragDeltaRef.current = 0;
        dragSettleTimerRef.current = null;
        void handleClose();
      };
      if (reduceMotion) settle();
      else dragSettleTimerRef.current = window.setTimeout(settle, DRAG_SETTLE_MS);
    },
    [handleClose],
  );

  const handleSelectTool = useCallback(
    (id: ToolId) => {
      if (id !== activeTool) void setActiveTool(id);
    },
    [activeTool, setActiveTool],
  );
  const room = Math.max(0, availablePx - dockH);
  const short = room < 360;
  const maxHeight =
    expandedControls || short ? Math.max(headerH + 64, room - (short ? 64 : 128)) : room * 0.55;
  const height = Math.min(headerH + contentH, maxHeight || 320);

  return (
    <div ref={wrapRef} className="editor-mobile-workspace">
      {expanded && (
        <div
          ref={sheetRef}
          role="region"
          aria-label="Tool controls"
          className="editor-mobile-surface"
          style={{ "--mobile-panel-height": `${height}px` } as CSSProperties}
        >
          <div ref={headerRef} className="editor-mobile-header">
            <div
              className="editor-mobile-heading touch-none"
              onPointerDown={onDragStart}
              onPointerMove={onDragMove}
              onPointerUp={finishDrag}
              onPointerCancel={(event) => finishDrag(event, true)}
            >
              <h2 className={`editor-mobile-title${activeTool === "adjust" ? " sr-only" : ""}`}>
                {findTool(activeTool).name}
              </h2>
              <div ref={setHeadingSlot} />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              aria-label={expandedControls ? "Return to split view" : "Expand controls"}
              aria-pressed={expandedControls}
              onClick={() => setExpandedControls((value) => !value)}
            >
              <I.ChevronDown
                size={18}
                style={{ transform: expandedControls ? undefined : "rotate(180deg)" }}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              aria-label="Cancel"
              className="btn btn-ghost btn-icon"
            >
              <I.X size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => void handleClose()}
              className="btn btn-secondary btn-sm"
            >
              Done
            </button>
          </div>
          <div
            ref={scrollRef}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div ref={setContentRef}>
              <div key={activeTool} className="flex flex-col gap-4 px-4 pt-3 pb-4">
                <ToolControls
                  headingSlot={headingSlot}
                  onExpandControls={() => setExpandedControls(true)}
                />
              </div>
              <LayersList />
            </div>
          </div>
        </div>
      )}
      <div ref={dockRef} className="editor-mobile-dock">
        <CompactToolNav
          activeTool={activeTool}
          onSelect={handleSelectTool}
          onOpenSearch={onOpenSearch}
        />
      </div>
    </div>
  );
}
