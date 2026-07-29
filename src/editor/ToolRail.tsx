// ToolRail.tsx — The left tool rail on desktop + tablet. Mobile uses
// MobileEditorSurface's morphing bottom sheet for tool selection, so
// the rail never renders below the mobile breakpoint. The search
// affordance stays pinned while the tool families scroll independently.

import { memo, useEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { I } from "../components/icons";
import { ALL_TOOLS, type Tool, type ToolId } from "./tools";

interface RailProps {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
  onOpenSearch: () => void;
}

type RailItem = { sep: true; key: string } | { sep: false; tool: Tool };
interface TooltipState {
  id: string;
  label: string;
  left: number;
  top: number;
}

const TOOLTIP_DELAY_MS = 800;

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

// ALL_TOOLS is a module constant, so the rail layout is fixed — compute
// it once instead of rebuilding a ~30-element array on every render.
const RAIL_ITEMS = withSeparators();

// Memoized: the rail only depends on `activeTool` + a stable `onSelect`,
// so it can bail out of the per-slider-tick re-renders that ripple down
// from the editor chrome.
export const ToolRail = memo(function ToolRail({ activeTool, onSelect, onOpenSearch }: RailProps) {
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const tooltipTimerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    activeButtonRef.current?.scrollIntoView?.({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeTool]);

  useEffect(
    () => () => {
      if (tooltipTimerRef.current !== null) window.clearTimeout(tooltipTimerRef.current);
    },
    [],
  );

  const hideTooltip = () => {
    if (tooltipTimerRef.current !== null) {
      window.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setTooltip(null);
  };

  const showTooltip = (id: string, label: string, target: HTMLButtonElement, delay: number) => {
    hideTooltip();
    const reveal = () => {
      const rect = target.getBoundingClientRect();
      setTooltip({
        id,
        label,
        left: rect.right + 8,
        top: rect.top + rect.height / 2,
      });
      tooltipTimerRef.current = null;
    };
    if (delay === 0) reveal();
    else tooltipTimerRef.current = window.setTimeout(reveal, delay);
  };

  const onPointerEnter = (id: string, label: string, event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "mouse") return;
    showTooltip(id, label, event.currentTarget, TOOLTIP_DELAY_MS);
  };

  const onFocus = (id: string, label: string, event: FocusEvent<HTMLButtonElement>) => {
    showTooltip(id, label, event.currentTarget, 0);
  };

  const searchTooltipId = "editor-tool-tooltip-search";

  return (
    <>
      <nav
        aria-label="Editor tools"
        className="editor-toolrail flex w-18 shrink-0 flex-col overflow-hidden border-r border-border bg-surface"
      >
        <button
          type="button"
          onClick={onOpenSearch}
          onPointerEnter={(event) => onPointerEnter("search", "Search tools", event)}
          onPointerLeave={hideTooltip}
          onFocus={(event) => onFocus("search", "Search tools", event)}
          onBlur={hideTooltip}
          aria-label="Search tools"
          aria-keyshortcuts="Meta+K Control+K"
          aria-describedby={tooltip?.id === "search" ? searchTooltipId : undefined}
          className="relative flex h-12 w-full shrink-0 cursor-pointer items-center justify-center border-x-0 border-t-0 border-b border-border bg-page-bg p-0 text-coral-600 hover:bg-coral-50 hover:text-coral-700 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-coral-500 dark:text-coral-400 dark:hover:bg-[var(--color-accent-soft)]"
        >
          <I.Search size={18} aria-hidden="true" />
        </button>

        <div
          className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain py-2"
          onScroll={hideTooltip}
        >
          {RAIL_ITEMS.map((item) => {
            if (item.sep) {
              return <div key={item.key} className="mx-3 my-1.5 h-px bg-border-soft" />;
            }
            const { tool } = item;
            const Ic = tool.icon;
            const active = tool.id === activeTool;
            const tooltipId = `editor-tool-tooltip-${tool.id}`;
            return (
              <button
                key={tool.id}
                ref={active ? activeButtonRef : undefined}
                type="button"
                onClick={() => onSelect(tool.id)}
                onPointerEnter={(event) => onPointerEnter(tool.id, tool.name, event)}
                onPointerLeave={hideTooltip}
                onFocus={(event) => onFocus(tool.id, tool.name, event)}
                onBlur={hideTooltip}
                aria-label={tool.name}
                aria-pressed={active}
                aria-describedby={tooltip?.id === tool.id ? tooltipId : undefined}
                className={`relative mx-auto my-0.5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-coral-500 ${
                  active
                    ? "text-coral-600 dark:text-coral-400"
                    : "text-text-muted hover:bg-page-bg hover:text-text"
                }`}
              >
                <Ic size={18} aria-hidden="true" />
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[18%] -left-2.5 bottom-[18%] w-[2.5px] rounded-r-sm bg-coral-500"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {tooltip &&
        createPortal(
          <div
            id={`editor-tool-tooltip-${tooltip.id}`}
            role="tooltip"
            className="pointer-events-none fixed z-[var(--z-popover)] -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--color-night-rule)] bg-[var(--color-night)] px-2 py-1.5 font-mono text-[10px] font-semibold tracking-[0.03em] text-[var(--color-night-ink)] shadow-[var(--shadow-popover)]"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.label}
          </div>,
          document.body,
        )}
    </>
  );
});
