// ToolRail.tsx — The left tool rail on desktop + tablet. Mobile uses
// MobileEditorSurface's morphing bottom sheet for tool selection, so
// the rail never renders below the mobile breakpoint.

import { memo } from "react";
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

// ALL_TOOLS is a module constant, so the rail layout is fixed — compute
// it once instead of rebuilding a ~30-element array on every render.
const RAIL_ITEMS = withSeparators();

// Memoized: the rail only depends on `activeTool` + a stable `onSelect`,
// so it can bail out of the per-slider-tick re-renders that ripple down
// from the editor chrome.
export const ToolRail = memo(function ToolRail({ activeTool, onSelect }: RailProps) {
  return (
    // V5 (May 2026 minimalist desktop redesign) — the rail no longer
    // carries its own surface or backdrop blur; tools sit directly on
    // the cream `--page-bg`. The only structural cue left is a soft
    // right divider so the canvas reads as a distinct field; everything
    // else is hover/active ink only. Mirrors mobile's chrome-free
    // bottom surface.
    <div className="no-scrollbar flex w-18 shrink-0 flex-col overflow-y-auto border-r border-border-soft py-2">
      {RAIL_ITEMS.map((item) => {
        if (item.sep) {
          return <div key={item.key} className="mx-3 my-1.5 h-px bg-border-soft" />;
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
            // Active state — V4 (May 2026): one cue, the coral bar at
            // the rail edge, plus a coral ink shift. The prior
            // treatment painted four signals at once (background fill +
            // inset ring + edge bar + scale-105); each made the
            // selection harder to scan, not easier. A single sharp
            // marker reads as the canonical "you are here" anchor.
            className={`relative mx-auto my-0.5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-0 transition-colors duration-150 ease-out ${
              active
                ? "text-coral-600 dark:text-coral-400"
                : "text-text-muted hover:bg-surface hover:text-text"
            }`}
          >
            <Ic size={17} />
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-[18%] -left-2 bottom-[18%] w-[2.5px] rounded-r-sm bg-coral-500"
              />
            )}
          </button>
        );
      })}
    </div>
  );
});
