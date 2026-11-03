// PropertiesPanel.tsx — The right-side panel on desktop and tablet.
// Shows the active tool's icon + name + group header on top, then
// renders ToolControls below.

import { useState } from "react";
import { useActiveTool } from "./EditorContext";
import { LayersList } from "./LayersList";
import { TOOL_GROUP_LABELS } from "./toolSearch";
import { findTool } from "./tools";
import { ToolActions } from "./ToolActions";
import { ToolControls } from "./ToolControls";

interface Props {
  collapsed?: boolean;
}

export function PropertiesPanel({ collapsed = false }: Props) {
  const activeTool = useActiveTool();
  const tool = findTool(activeTool);
  const [feedback, setFeedback] = useState<HTMLDivElement | null>(null);

  return (
    <div
      data-compact={collapsed}
      className={`editor-properties flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface ${
        collapsed ? "w-72" : "w-82"
      }`}
    >
      <div className="editor-properties__header">
        <div className="editor-properties__heading">
          <h2>{tool.name}</h2>
          <span className="text-[0.8125rem] text-text-muted">{TOOL_GROUP_LABELS[tool.group]}</span>
        </div>
        {collapsed && activeTool !== "move" && (
          <ToolActions key={`actions-${activeTool}`} compact feedback={feedback} />
        )}
      </div>

      {/* `key={activeTool}` remounts the scroll container on every tool
          switch so scrollTop resets to 0. Without this, scrolling deep
          into a tall panel (e.g. Adjust) and switching to a shorter one
          left the new panel scrolled past its content. The remount only
          re-creates this div — Fabric, EditorContext, and LayersList
          (sibling) are unaffected, so there's no perf cost.

          `overscroll-contain` lives here (not on `.scroll-thin`)
          because horizontal-only preset rows inside the panel inherit
          .scroll-thin for the thin-scrollbar look but should NOT
          contain vertical pans — that broke vertical scrolling when a
          user touched a preset thumbnail. Containment now applies only
          where the rubber-band actually needs catching: the panel's
          own vertical scroll. */}
      <div
        key={activeTool}
        className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-3.5 pb-4"
      >
        <div ref={setFeedback} className="editor-tool-feedback" />
        <ToolControls />
      </div>
      <LayersList />
      {!collapsed && activeTool !== "move" && <ToolActions key={`actions-${activeTool}`} />}
    </div>
  );
}
