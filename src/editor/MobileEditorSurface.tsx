// Compact controls stay above a persistent tool dock. The catalogue is an
// overlay, so browsing tools never unregisters the current pending apply.
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useActiveTool, useEditorActions } from "./EditorContext";
import { CompactToolNav } from "./CompactToolNav";
import { LayersList } from "./LayersList";
import { ToolActions } from "./ToolActions";
import { ToolControls } from "./ToolControls";
import { findTool, type ToolId } from "./tools";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [availablePx, setAvailablePx] = useState(0);
  const [dockH, setDockH] = useState(72);
  const [headingSlot, setHeadingSlot] = useState<HTMLDivElement | null>(null);
  const [chromeH, setChromeH] = useState(112);
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
    const update = () =>
      setChromeH(
        header.getBoundingClientRect().height +
          (actionsRef.current?.getBoundingClientRect().height ?? 0),
      );
    const observer = new ResizeObserver(update);
    observer.observe(header);
    if (actionsRef.current) observer.observe(actionsRef.current);
    update();
    return () => observer.disconnect();
  }, [expanded, activeTool]);

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
  const handleClose = useCallback(() => setMoveOpen(false), []);
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

  const handleSelectTool = useCallback(
    (id: ToolId) => {
      if (id !== activeTool) void setActiveTool(id);
    },
    [activeTool, setActiveTool],
  );
  const room = Math.max(0, availablePx - dockH);
  const short = room < 360;
  const maxHeight =
    expandedControls || short
      ? Math.max(chromeH + 64, room - (short ? 64 : 128))
      : Math.min(room - 96, Math.max(room * 0.55, chromeH + 168));
  const height = Math.min(chromeH + contentH, maxHeight || 320);

  return (
    <div ref={wrapRef} className="editor-mobile-workspace">
      {expanded && (
        <div
          role="region"
          aria-label="Tool controls"
          className="editor-mobile-surface"
          style={{ "--mobile-panel-height": `${height}px` } as CSSProperties}
        >
          <div ref={headerRef} className="editor-mobile-header">
            <div className="editor-mobile-heading">
              <h2 className={`editor-mobile-title${activeTool === "adjust" ? " sr-only" : ""}`}>
                {findTool(activeTool).name}
              </h2>
              <div ref={setHeadingSlot} />
            </div>
            <button
              type="button"
              className="air-button air-button--quiet"
              aria-label={expandedControls ? "Return to split view" : "Expand controls"}
              aria-pressed={expandedControls}
              onClick={() => setExpandedControls((value) => !value)}
            >
              {expandedControls ? "Split view" : "Expand"}
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
          <ToolActions key={`actions-${activeTool}`} ref={actionsRef} onClose={handleClose} />
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
