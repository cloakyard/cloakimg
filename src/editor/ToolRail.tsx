// ToolRail.tsx — The left tool rail (desktop + tablet) and the
// horizontally-scrolling bottom MobileToolbar (mobile only).
//
// Both render the same tool set with group separators, but the rail is
// a vertical column with active markers, while the mobile toolbar is a
// row of icon-and-label chips.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { I } from "../components/icons";
import { ALL_TOOLS, type Tool, type ToolId } from "./tools";

interface RailProps {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
}

type RailItem = { sep: true; key: string } | { sep: false; tool: Tool };

function withSeparators(): RailItem[] {
  const items: RailItem[] = [];
  let lastGroup: string | null = null;
  for (const tool of ALL_TOOLS) {
    if (lastGroup && tool.group !== lastGroup) {
      items.push({ sep: true, key: `sep-${lastGroup}-${tool.group}` });
    }
    items.push({ sep: false, tool });
    lastGroup = tool.group;
  }
  return items;
}

export function ToolRail({ activeTool, onSelect }: RailProps) {
  const items = withSeparators();

  return (
    <div className="editor-paper no-scrollbar flex w-18 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface py-2 dark:border-dark-border dark:bg-dark-surface">
      {items.map((item) => {
        if (item.sep) {
          return (
            <div
              key={item.key}
              className="mx-3 my-1.5 h-px bg-border-soft dark:bg-dark-border-soft"
            />
          );
        }
        const { tool } = item;
        const Ic = tool.icon;
        const active = tool.id === activeTool;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            title={tool.name}
            aria-label={tool.name}
            aria-pressed={active}
            className={`relative mx-auto my-0.5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-none p-0 ${
              active
                ? "bg-coral-50 text-coral-700 shadow-[inset_0_0_0_1px_var(--coral-200)] dark:bg-coral-900/30 dark:text-coral-300"
                : "bg-transparent text-text-muted dark:text-dark-text-muted"
            }`}
          >
            <Ic size={17} />
            {active && (
              <span className="absolute top-[20%] -left-2 bottom-[20%] w-0.5 rounded-sm bg-coral-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function MobileToolbar({ activeTool, onSelect }: RailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Symmetric overflow tracking: a fade+chevron on each side disappears
  // when the user reaches that edge. New users land with only the
  // leftmost 5 tools visible, so the right hint surfaces the rest;
  // once they've scrolled past, the left hint reminds them they can
  // swipe back to Move/Crop/etc.
  const [hasOverflowLeft, setHasOverflowLeft] = useState(false);
  const [hasOverflowRight, setHasOverflowRight] = useState(false);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      // 2px tolerance handles sub-pixel rounding at fractional zooms.
      setHasOverflowLeft(el.scrollLeft > 2);
      setHasOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // First-mount nudge: if there's overflow, briefly bump the scroller
  // a few pixels and back so the chevron+gradient animate into view —
  // pure visual cue, no scroll state changes.
  const nudgedRef = useRef(false);
  useEffect(() => {
    if (nudgedRef.current) return;
    if (!hasOverflowRight) return;
    const el = scrollerRef.current;
    if (!el) return;
    nudgedRef.current = true;
    const start = el.scrollLeft;
    const t1 = window.setTimeout(() => {
      el.scrollTo({ left: start + 14, behavior: "smooth" });
    }, 450);
    const t2 = window.setTimeout(() => {
      el.scrollTo({ left: start, behavior: "smooth" });
    }, 950);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [hasOverflowRight]);

  return (
    <div className="editor-paper relative shrink-0 border-t border-border-soft dark:border-dark-border-soft">
      <div
        ref={scrollerRef}
        className="no-scrollbar flex gap-1 overflow-x-auto px-2 py-2 pb-[max(env(safe-area-inset-bottom),8px)]"
      >
        {ALL_TOOLS.map((tool) => {
          const Ic = tool.icon;
          const active = tool.id === activeTool;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(tool.id)}
              aria-label={tool.name}
              aria-pressed={active}
              className={`relative flex min-h-12 min-w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-none px-1.5 py-2 ${
                active
                  ? "bg-coral-50 text-coral-700 shadow-[inset_0_0_0_1px_var(--coral-200)] dark:bg-coral-900/30 dark:text-coral-300"
                  : "bg-transparent text-text-muted dark:text-dark-text-muted"
              }`}
            >
              <Ic size={18} />
              <span className="text-[10px] leading-tight font-semibold">{tool.name}</span>
            </button>
          );
        })}
      </div>
      {/* Overflow hints — gradient fades each toolbar edge into a soft
          falloff so the affordance reads as "scrollable" rather than a
          hard cut-off. Chevron sits on top of the fade; both are
          pointer-events:none so they never intercept taps on the edge
          tools. The hint on each side fades out once the user has
          scrolled to that edge. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-start pl-1.5 transition-opacity duration-200 ${
          hasOverflowLeft ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to right, var(--surface) 30%, color-mix(in srgb, var(--surface) 70%, transparent) 70%, transparent 100%)",
        }}
      >
        <I.ChevronLeft
          size={14}
          stroke={2.25}
          className="text-coral-500 dark:text-coral-400"
          style={{ animation: "ci-tool-hint-left 1.6s ease-in-out infinite" }}
        />
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end pr-1.5 transition-opacity duration-200 ${
          hasOverflowRight ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to left, var(--surface) 30%, color-mix(in srgb, var(--surface) 70%, transparent) 70%, transparent 100%)",
        }}
      >
        <I.ChevronRight
          size={14}
          stroke={2.25}
          className="text-coral-500 dark:text-coral-400"
          style={{ animation: "ci-tool-hint 1.6s ease-in-out infinite" }}
        />
      </div>
    </div>
  );
}
