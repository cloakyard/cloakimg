// MobileEditorSurface.tsx — One bottom surface, three states. A single
// morphing shell that progresses through:
//
//   collapsed  →  picker  →  tool  →  collapsed
//        \                              /
//         \________ X / ✓ / drag-down _/
//
// V3.4 design goals (Braun + fluid, peeled further back):
//   • Idle is just text. The collapsed state has NO container — no
//     background, border, shape, or shadow. Just "Tools" + Grid icon
//     floating on the cream page. Tap target is 44 × 140 invisibly.
//   • One surface. The shell stays open across the picker → tool
//     transition; only the inner content cross-fades.
//   • Hairline edges only when expanded. The implicit container
//     materialises (background fades to white, top corners round to
//     16 px, hairline inset) as the shell grows from icon-sized to
//     full-sheet.
//   • In-flow geometry. Wrapper height animates so the canvas above
//     reflows; the entire photo stays visible during a tool session.
//   • Pinned tool header. Like CloakPDF, ✕ and ✓ stay together at the
//     top-right while only the controls body scrolls. This keeps the
//     session actions reachable without stealing a second row below
//     the controls.
//
// History semantics:
//   • ✓ — keep changes, reset tool to Move, collapse the surface.
//   • ✕ — rewind via repeated undo() back to the checkpoint captured
//     when the surface entered tool mode, then collapse.
//   • Drag-down or tap drag-handle — same as ✓ (keep changes, close).
//   • TopBar Undo / Redo work normally throughout; the checkpoint
//     math clamps so manual rewind past the checkpoint never
//     over-rewinds on ✕.

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { I } from "../components/icons";
import { useEditor } from "./EditorContext";
import { LayersList } from "./LayersList";
import { ToolControls } from "./ToolControls";
import { searchEditorTools } from "./toolSearch";
import { findTool, toolsForTab, type Tool, type ToolId } from "./tools";

type Mode = "collapsed" | "picker" | "tool";

// Geometry — V3.4 strips the container in collapsed state. The
// collapsed footprint is just the size needed for icon + label; no
// background, no border, no shape. Tap target stays comfortably 44 px
// (icon row + padding) while the visual is just text + glyph floating
// on the cream page.
const COLLAPSED_W = 140;
const COLLAPSED_H = 44;
const EXPANDED_R = 8;

// Chrome heights for sheet sizing. The picker keeps the compact drag
// handle; an active tool swaps that row for a pinned title + action
// header matching CloakPDF's mobile editor.
const HANDLE_H = 44;
const TOOL_HEADER_H = 56;

// Surface colour settles on the same restrained timing as the shared
// dialogs. Width and height update immediately so the canvas does not
// re-layout across several frames while a live preview is painting.
const MORPH_MS = 320;
const EASING = "var(--ease-out)";

// Hoisted because the drag handlers temporarily disable transitions
// and must restore the same string React owns afterward.
const SHEET_TRANSITION = [
  `background-color ${MORPH_MS}ms ${EASING}`,
  `box-shadow ${MORPH_MS}ms ${EASING}`,
].join(", ");

const DRAG_DISMISS_PX = 100;
const MOBILE_TOOLS = toolsForTab(null);

interface SurfaceProps {
  /** Notify parent when the surface enters / leaves an expanded state.
   *  The parent doesn't strictly need this today (the in-flow height
   *  drives canvas reflow on its own), but exposing it keeps the
   *  shape compatible with future "mute background while sheet is
   *  open" needs. */
  onExpandedChange?: (expanded: boolean) => void;
}

export function MobileEditorSurface({ onExpandedChange }: SurfaceProps = {}) {
  const {
    toolState,
    setActiveTool,
    undo,
    historyDepth,
    flushPendingApply,
    registerPendingApply,
    runBusy,
  } = useEditor();
  const [mode, setMode] = useState<Mode>("collapsed");
  const [toolQuery, setToolQuery] = useState("");

  // History cursor captured the moment the surface enters `tool` mode.
  // Cancel (✕) rewinds back to it; cleared on collapse so each tool
  // session starts fresh. Robust against the user pressing TopBar Undo
  // mid-session: if depth has already drifted below the checkpoint,
  // the rewind loop simply doesn't run.
  const checkpointRef = useRef<number | null>(null);

  // Measured cap: half the canvas+surface column so the sheet never
  // grows taller than the canvas above. Falls back to a sane default
  // until the first measurement lands.
  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [maxPx, setMaxPx] = useState(0);
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

  // V3.5: measured natural height of whatever's currently rendered
  // inside the sheet. Drives the sheet's actual height so a short tool
  // (Perspective, Color picker) doesn't waste vertical real estate by
  // sitting in a half-height shell. Capped by maxPx so a tall picker
  // grid or Adjust panel still tops out at ~50 % of the column.
  //
  // Callback ref (not useRef + useLayoutEffect) so the ResizeObserver
  // attaches the moment the contentRef element mounts. The collapsed
  // branch doesn't render contentRef, so a one-shot useLayoutEffect on
  // [] would run when the ref is null and never re-attach when expanded
  // remounts the element. The callback ref fires on every mount/unmount
  // of the underlying div, so the observer always tracks the live node.
  const [contentH, setContentH] = useState(COLLAPSED_H);
  const observerRef = useRef<ResizeObserver | null>(null);
  const setContentRef = useCallback((el: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setContentH(entry.contentRect.height);
    });
    ro.observe(el);
    observerRef.current = ro;
    setContentH(el.getBoundingClientRect().height);
  }, []);
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  const expanded = mode !== "collapsed";

  // Notify parent on expanded transitions.
  useEffect(() => {
    onExpandedChange?.(expanded);
  }, [expanded, onExpandedChange]);

  // Sync external activeTool changes with the surface mode.
  //   • activeTool flips to a real tool while collapsed/picker → tool mode
  //   • activeTool flips back to Move while in tool mode → collapse
  // The lastToolRef guards against re-entry on unrelated re-renders.
  const lastToolRef = useRef(toolState.activeTool);
  useEffect(() => {
    if (lastToolRef.current === toolState.activeTool) return;
    const prev = lastToolRef.current;
    lastToolRef.current = toolState.activeTool;
    if (toolState.activeTool !== "move") {
      // Reset the checkpoint when entering from collapsed (genuinely
      // new tool session). Picker → tool keeps any pre-captured
      // checkpoint, which is none until the tool effect below fires.
      if (mode === "collapsed") checkpointRef.current = null;
      setMode("tool");
    } else if (prev !== "move") {
      setMode("collapsed");
    }
  }, [toolState.activeTool, mode]);

  // Capture the history checkpoint on the rising edge into tool mode;
  // clear it on collapse. Picker → tool preserves any existing
  // checkpoint (today: none, since picker doesn't commit anything).
  useEffect(() => {
    if (mode === "tool" && checkpointRef.current === null) {
      checkpointRef.current = historyDepth();
    } else if (mode === "collapsed") {
      checkpointRef.current = null;
    }
  }, [mode, historyDepth]);

  // Picker and tool controls reuse the same scroll node so the sheet
  // can morph without remounting. Reset that node before paint when
  // its content identity changes; otherwise selecting a tool from the
  // bottom of the picker opens the new panel at the same deep offset.
  useLayoutEffect(() => {
    if (mode === "collapsed") return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [mode, toolQuery, toolState.activeTool]);

  const handleClose = useCallback(async () => {
    // Run the tool's auto-bake BEFORE unmounting it. The previous flow
    // — setActiveTool("move") then trust setActiveTool's internal
    // `runBusy(pending)` — bakes after a 2-rAF delay, by which time
    // React has already unmounted the tool component and its cleanup
    // has stripped any in-canvas overlays the apply needs (Crop's
    // bounding rect, Perspective's four handles). Awaiting
    // flushPendingApply here keeps the tool mounted until the bake
    // finishes, so findCropRect etc. still resolve.
    if (mode === "tool") {
      await runBusy("Applying…", flushPendingApply);
      setActiveTool("move");
    }
    setToolQuery("");
    setMode("collapsed");
  }, [mode, setActiveTool, runBusy, flushPendingApply]);

  const handleCancel = useCallback(async () => {
    // Discard any pending apply first — otherwise the subsequent
    // setActiveTool("move") would happily bake the very work the user
    // just asked to throw away (its internal pendingApply flush fires
    // unconditionally on tool change).
    registerPendingApply(null);
    const checkpoint = checkpointRef.current;
    if (checkpoint !== null) {
      while (historyDepth() > checkpoint) {
        const before = historyDepth();
        await undo();
        if (historyDepth() === before) break;
      }
    }
    setActiveTool("move");
    setMode("collapsed");
  }, [historyDepth, undo, setActiveTool, registerPendingApply]);

  // Esc key dismisses any expanded mode (parity with desktop / hardware
  // keyboard sessions).
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, handleClose]);

  // Drag-to-dismiss on the drag handle. Same gesture as the V3.1
  // MobileSheet (tested on iOS Safari) — only the handle area
  // intercepts, so native scrolling inside the content area stays
  // untouched.
  const touchStartY = useRef<number | null>(null);
  const dragDeltaRef = useRef(0);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
    dragDeltaRef.current = 0;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
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
    // Restore the exact morph transition React believes is set (NOT "")
    // — otherwise React, seeing `transition` unchanged on later renders,
    // never re-writes it and the next open/close stops animating.
    sheetRef.current.style.transition = SHEET_TRANSITION;
    sheetRef.current.style.transform = "";
    const d = dragDeltaRef.current;
    dragDeltaRef.current = 0;
    if (d > DRAG_DISMISS_PX) void handleClose();
  }, [handleClose]);

  const handleSelectTool = useCallback(
    (id: ToolId) => {
      setToolQuery("");
      setActiveTool(id);
      // The activeTool effect transitions mode → tool.
    },
    [setActiveTool],
  );

  const visibleTools = useMemo(() => searchEditorTools(toolQuery, MOBILE_TOOLS), [toolQuery]);
  const activeTool = findTool(toolState.activeTool);
  const modalProps = expanded
    ? ({
        role: "dialog",
        "aria-modal": true,
        "aria-label": mode === "picker" ? "Tools" : "Tool controls",
      } as const)
    : {};

  // Sheet height = pinned chrome + measured scroll content, capped at
  // half the column. Picker and tool headers both stay outside the
  // scroller, so controls gain the space previously consumed by the
  // bottom action row.
  const expandedHeight = maxPx > 0 ? maxPx : 360;
  const expandedChromeHeight = mode === "tool" ? TOOL_HEADER_H : HANDLE_H;
  const sheetHeight =
    mode === "collapsed" ? COLLAPSED_H : Math.min(expandedChromeHeight + contentH, expandedHeight);
  const sheetStyle: CSSProperties = {
    width: expanded ? "100%" : `${COLLAPSED_W}px`,
    height: `${sheetHeight}px`,
    borderTopLeftRadius: expanded ? `${EXPANDED_R}px` : 0,
    borderTopRightRadius: expanded ? `${EXPANDED_R}px` : 0,
    backgroundColor: expanded ? "var(--surface)" : "transparent",
    boxShadow: expanded ? "inset 0 1px 0 0 var(--color-rule)" : "none",
    transition: SHEET_TRANSITION,
  };

  return (
    <div
      ref={wrapRef}
      className="flex shrink-0 flex-col items-center"
      style={{
        // Lift the collapsed icon+label clear of the iOS home indicator.
        // On expand the sheet extends to the screen edge; the footer
        // absorbs the safe-area inset inside its own padding.
        marginBottom: expanded ? 0 : "max(env(safe-area-inset-bottom),0.5rem)",
      }}
    >
      <div
        ref={sheetRef}
        {...modalProps}
        className="editor-mobile-surface relative overflow-hidden"
        style={sheetStyle}
      >
        {!expanded ? (
          /* Collapsed — just the icon + label, no chrome around it. */
          <button
            type="button"
            onClick={() => setMode("picker")}
            aria-label="Open tools"
            aria-expanded={expanded}
            className="flex w-full cursor-pointer items-center justify-center gap-2 border-none bg-transparent py-2.5 font-[inherit] text-text"
            style={{ height: COLLAPSED_H }}
          >
            <I.Grid2x2 size={18} stroke={2} />
            <span className="text-[13px] font-semibold">Tools</span>
          </button>
        ) : (
          /* Expanded — pinned picker/tool header followed by the only
              scroll container. ResizeObserver on contentRef measures
              the middle's natural height so short tools stay compact
              while long panels use the full half-sheet allowance. */
          <div className="flex h-full flex-col">
            {mode === "tool" ? (
              <div
                className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4"
                style={{ height: TOOL_HEADER_H }}
              >
                <div
                  className="flex min-w-0 flex-1 touch-none items-center"
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  onTouchCancel={onTouchEnd}
                >
                  <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-text">
                    {activeTool.name}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleCancel()}
                    aria-label="Cancel"
                    className="btn btn-ghost btn-icon"
                  >
                    <I.X size={18} stroke={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleClose()}
                    aria-label="Done"
                    className="btn btn-outline-coral btn-icon"
                  >
                    <I.Check size={18} stroke={2} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleClose()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onTouchCancel={onTouchEnd}
                aria-label="Close — drag down to dismiss"
                className="group flex shrink-0 cursor-pointer touch-none items-center justify-center border-none bg-transparent p-0"
                style={{ height: HANDLE_H }}
              >
                <span
                  aria-hidden
                  className="h-1 w-9 rounded-full bg-border transition-colors group-active:bg-text-muted dark:group-active:bg-dark-text-muted"
                />
              </button>
            )}

            <div
              ref={scrollRef}
              className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <div ref={setContentRef}>
                {mode === "picker" ? (
                  // No panel-fade-in here. A transform-based animation
                  // on the scroller's direct content is a known iOS
                  // Safari quirk that breaks momentum scroll for the
                  // first finger touch after mount — users reported
                  // "can't scroll the tool picker" once the fade was
                  // added. The outer sheet morph already carries the
                  // motion; the picker grid lands on a calm fade by
                  // virtue of the sheet's own enter animation.
                  <div style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1rem)" }}>
                    <div className="sticky top-0 z-10 bg-surface px-4 pt-1 pb-2">
                      <div
                        role="search"
                        aria-label="Editor tools"
                        className="flex h-11 items-center gap-2 rounded-md border border-border bg-page-bg px-3 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-coral-500"
                      >
                        <I.Search
                          size={16}
                          className="shrink-0 text-coral-600 dark:text-coral-400"
                          aria-hidden="true"
                        />
                        <label htmlFor="mobile-editor-tool-search" className="sr-only">
                          Search editor tools
                        </label>
                        <input
                          id="mobile-editor-tool-search"
                          name="mobile-editor-tool-search"
                          type="search"
                          value={toolQuery}
                          onChange={(event) => setToolQuery(event.target.value)}
                          placeholder="Search tools…"
                          aria-label="Search editor tools"
                          aria-describedby="mobile-editor-tool-search-count"
                          autoComplete="off"
                          spellCheck={false}
                          className="editor-tool-search-input h-full min-w-0 flex-1 appearance-none border-none bg-transparent font-[inherit] text-[13px] text-text outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:appearance-none"
                        />
                        {toolQuery ? (
                          <button
                            type="button"
                            onClick={() => setToolQuery("")}
                            aria-label="Clear editor tool search"
                            className="btn btn-ghost btn-icon -mr-3 shrink-0"
                          >
                            <I.X size={14} aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                      <p
                        id="mobile-editor-tool-search-count"
                        aria-live="polite"
                        className="t-mono mt-1.5 text-[9px] tracking-[0.05em] text-text-muted uppercase"
                      >
                        {toolQuery.trim()
                          ? `${visibleTools.length} matching ${visibleTools.length === 1 ? "tool" : "tools"}`
                          : `${MOBILE_TOOLS.length} editor tools`}
                      </p>
                    </div>

                    {visibleTools.length > 0 ? (
                      <div className="grid grid-cols-3 gap-x-1 gap-y-2 px-4">
                        {visibleTools.map((tool) => (
                          <ToolGridCard
                            key={tool.id}
                            tool={tool}
                            active={tool.id === toolState.activeTool}
                            onClick={() => handleSelectTool(tool.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-5 py-7 text-center">
                        <div className="text-sm font-semibold text-text">No tool found</div>
                        <div className="mt-1 text-xs leading-relaxed text-text-muted">
                          Try “crop”, “background”, “colour”, or “privacy”.
                        </div>
                        <button
                          type="button"
                          onClick={() => setToolQuery("")}
                          className="btn btn-ghost btn-sm mt-4"
                        >
                          Clear search
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div
                      key={toolState.activeTool}
                      className="flex flex-col gap-4 px-4 pt-1.5"
                      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
                    >
                      <ToolControls />
                    </div>
                    <LayersList />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tool grid card ─────────────────────────────────────────────────
// Same visual treatment as the prior MobileToolsPicker card — generous
// outlined icon + tight label. Restraint over decoration.

interface CardProps {
  tool: Tool;
  active: boolean;
  onClick: () => void;
}

function ToolGridCard({ tool, active, onClick }: CardProps) {
  const Ic = tool.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tool.name}
      aria-pressed={active}
      className={`flex cursor-pointer flex-col items-center justify-start gap-1.5 rounded-lg border bg-transparent px-1 py-2.5 font-[inherit] transition-colors focus-visible:outline-2 focus-visible:outline-coral-500 focus-visible:outline-offset-1 ${
        active
          ? "border-coral-500 bg-coral-50/50 text-coral-700 dark:bg-coral-900/20 dark:text-coral-300"
          : "border-transparent text-text"
      }`}
    >
      <Ic size={26} stroke={active ? 2 : 1.6} />
      <span className="text-[11px] leading-tight font-medium tracking-[-0.005em] whitespace-nowrap">
        {tool.name}
      </span>
    </button>
  );
}
