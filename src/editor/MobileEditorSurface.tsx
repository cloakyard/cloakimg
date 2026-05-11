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
//   • Symmetric footer. ✕ on the left (cancel + rewind to checkpoint),
//     ✓ on the right (apply + close). Per-tool Reset buttons inside
//     the tool's panel still handle tool-specific resets; the footer
//     pair handles the session-level commit / discard.
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
import { MobileToolFooter } from "./MobileToolFooter";
import { ToolControls } from "./ToolControls";
import { toolsForTab, type Tool, type ToolId } from "./tools";

type Mode = "collapsed" | "picker" | "tool";

// Geometry — V3.4 strips the container in collapsed state. The
// collapsed footprint is just the size needed for icon + label; no
// background, no border, no shape. Tap target stays comfortably 44 px
// (icon row + padding) while the visual is just text + glyph floating
// on the cream page.
const COLLAPSED_W = 140;
const COLLAPSED_H = 44;
const EXPANDED_R = 16;

// Approximate chrome heights for sheet sizing (V3.6).
//   HANDLE_H — the drag-bar row
//   FOOTER_H — X / ✓ row plus its safe-area padding (envelope; iOS
//              home-indicator inset varies, but 56 ± 8 covers it)
// These are added to the measured scroll-content height so the sheet
// sums to the exact total it needs. Slightly off estimates only mean
// the cap kicks in 8 px earlier or later — content always reads
// correctly because the flex layout gives the scroll area whatever's
// left after handle + footer carve out their fixed portions.
const HANDLE_H = 28;
const FOOTER_H = 56;

// Animation timing — every property animates on the same MORPH_MS
// schedule so the geometry feels coordinated rather than staggered.
// V3.5 dropped the crossfade layers (which needed FADE_OUT / FADE_IN
// timings) in favour of in-flow content + measured height — the
// geometry morph itself carries the visual transition now.
const MORPH_MS = 360;
const EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

const DRAG_DISMISS_PX = 100;

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
    sheetRef.current.style.transition = "";
    sheetRef.current.style.transform = "";
    const d = dragDeltaRef.current;
    dragDeltaRef.current = 0;
    if (d > DRAG_DISMISS_PX) void handleClose();
  }, [handleClose]);

  const handleSelectTool = useCallback(
    (id: ToolId) => {
      setActiveTool(id);
      // The activeTool effect transitions mode → tool.
    },
    [setActiveTool],
  );

  const tools = useMemo(() => toolsForTab(null), []);
  const dialogProps = expanded
    ? ({
        role: "dialog",
        "aria-modal": true,
        "aria-label": mode === "picker" ? "Tools" : "Tool controls",
      } as const)
    : {};

  // Sheet height = chrome (handle + optional footer) + measured scroll
  // content, capped at half the column. V3.6 hoists the drag handle
  // and the X / ✓ footer OUT of the scroll container so they stay
  // sticky while only the middle scrolls — the contentRef now wraps
  // just the scrollable region. Tools that need little vertical
  // space stay small; tall ones (Adjust, picker grid) hit the cap and
  // the middle column scrolls within.
  const expandedHeight = maxPx > 0 ? maxPx : 360;
  const sheetHeight =
    mode === "collapsed"
      ? COLLAPSED_H
      : Math.min(HANDLE_H + contentH + (mode === "tool" ? FOOTER_H : 0), expandedHeight);
  const sheetStyle: CSSProperties = {
    width: expanded ? "100%" : `${COLLAPSED_W}px`,
    height: `${sheetHeight}px`,
    borderTopLeftRadius: expanded ? `${EXPANDED_R}px` : 0,
    borderTopRightRadius: expanded ? `${EXPANDED_R}px` : 0,
    backgroundColor: expanded ? "var(--surface)" : "transparent",
    boxShadow: expanded ? "inset 0 1px 0 0 rgba(0,0,0,0.07)" : "none",
    transition: [
      `width ${MORPH_MS}ms ${EASING}`,
      `height ${MORPH_MS}ms ${EASING}`,
      `border-top-left-radius ${MORPH_MS}ms ${EASING}`,
      `border-top-right-radius ${MORPH_MS}ms ${EASING}`,
      `background-color ${MORPH_MS}ms ${EASING}`,
      `box-shadow ${MORPH_MS}ms ${EASING}`,
    ].join(", "),
  };

  return (
    <div
      ref={wrapRef}
      className="flex shrink-0 flex-col items-center"
      style={{
        // Lift the collapsed icon+label clear of the iOS home indicator.
        // Animates to 0 on expand so the sheet extends to the screen
        // edge; the footer absorbs the safe-area inset inside its own
        // padding.
        marginBottom: expanded ? 0 : "max(env(safe-area-inset-bottom),0.5rem)",
        transition: `margin-bottom ${MORPH_MS}ms ${EASING}`,
      }}
    >
      <div ref={sheetRef} {...dialogProps} className="relative overflow-hidden" style={sheetStyle}>
        {!expanded ? (
          /* Collapsed — just the icon + label, no chrome around it. */
          <button
            type="button"
            onClick={() => setMode("picker")}
            aria-label="Open tools"
            aria-expanded={expanded}
            className="flex w-full cursor-pointer items-center justify-center gap-2 border-none bg-transparent py-2.5 font-[inherit] text-text dark:text-dark-text"
            style={{ height: COLLAPSED_H }}
          >
            <I.Grid2x2 size={18} stroke={2} />
            <span className="text-[13px] font-semibold">Tools</span>
          </button>
        ) : (
          /* Expanded — three flex regions:
                top: drag handle (sticky)
                middle: scroll container with the actual content
                bottom: X / ✓ footer (sticky, tool mode only)
              Hoisting the chrome out of the scroller is what keeps it
              visible when the user scrolls a long Adjust panel.
              ResizeObserver on contentRef measures the middle's
              natural height, fed into sheetHeight along with HANDLE_H
              and FOOTER_H so the sheet auto-sizes correctly. */
          <div className="flex h-full flex-col">
            <button
              type="button"
              onClick={() => void handleClose()}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              aria-label="Close — drag down to dismiss"
              className="group flex h-7 shrink-0 cursor-pointer touch-none items-center justify-center border-none bg-transparent p-0"
              style={{ height: HANDLE_H }}
            >
              <span
                aria-hidden
                className="h-1 w-9 rounded-full bg-border transition-colors group-active:bg-text-muted dark:bg-dark-border dark:group-active:bg-dark-text-muted"
              />
            </button>

            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div ref={setContentRef}>
                {mode === "picker" ? (
                  <div
                    className="grid grid-cols-4 gap-x-1 gap-y-3 px-4 pt-1"
                    style={{ paddingBottom: "1rem" }}
                  >
                    {tools.map((tool) => (
                      <ToolGridCard
                        key={tool.id}
                        tool={tool}
                        active={tool.id === toolState.activeTool}
                        onClick={() => handleSelectTool(tool.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <div
                      key={toolState.activeTool}
                      className="flex flex-col gap-4 px-4 pt-1.5 pb-3"
                    >
                      <ToolControls />
                    </div>
                    <LayersList />
                  </>
                )}
              </div>
            </div>

            {mode === "tool" && (
              <MobileToolFooter
                onCancel={() => void handleCancel()}
                onConfirm={() => void handleClose()}
              />
            )}
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
      className={`flex cursor-pointer flex-col items-center justify-start gap-1.5 rounded-xl border bg-transparent px-1 py-2.5 font-[inherit] transition-colors focus-visible:outline-2 focus-visible:outline-coral-500 focus-visible:outline-offset-1 ${
        active
          ? "border-coral-500 bg-coral-50/50 text-coral-700 dark:bg-coral-900/20 dark:text-coral-300"
          : "border-transparent text-text dark:text-dark-text"
      }`}
    >
      <Ic size={26} stroke={active ? 2 : 1.6} />
      <span className="text-[11px] leading-tight font-medium tracking-[-0.005em]">{tool.name}</span>
    </button>
  );
}
