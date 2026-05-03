// ToolRail.tsx — The left tool rail (desktop + tablet) and the
// horizontally-scrolling bottom MobileToolbar (mobile only).
//
// Both render the same tool set with group separators, but the rail is
// a vertical column with active markers, while the mobile toolbar is a
// row of icon-and-label chips.

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
  return (
    <div className="editor-paper no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-t border-border-soft px-2 py-2 pb-[max(env(safe-area-inset-bottom),8px)] dark:border-dark-border-soft">
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
            className={`flex min-h-12 min-w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-none px-1.5 py-2 ${
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
  );
}
