// PropertiesPanel.tsx — The right-side panel on desktop and tablet.
// Shows the active tool's icon + name + group header on top, then
// renders ToolControls below.

import { I } from "../icons";
import { useEditor } from "./EditorContext";
import { LayersList } from "./LayersList";
import { findTool } from "./tools";
import { ToolControls } from "./ToolControls";

interface Props {
  collapsed?: boolean;
}

export function PropertiesPanel({ collapsed = false }: Props) {
  const { toolState } = useEditor();
  const tool = findTool(toolState.activeTool);
  const Ic = tool.icon;

  return (
    <div
      className={`editor-paper flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface dark:border-dark-border dark:bg-dark-surface ${
        collapsed ? "w-60" : "w-70"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border-soft px-4 py-3.5 dark:border-dark-border-soft">
        <div className="flex h-7.5 w-7.5 items-center justify-center rounded-md bg-coral-50 text-coral-700 dark:bg-coral-900/30 dark:text-coral-300">
          <Ic size={15} />
        </div>
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold tracking-[-0.005em]">{tool.name}</div>
          <div className="t-section-label mt-px">{tool.group}</div>
        </div>
        <I.ChevronDown size={14} className="text-text-muted dark:text-dark-text-muted" />
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-3.5 pb-4">
        <ToolControls />
      </div>
      <LayersList />
    </div>
  );
}
