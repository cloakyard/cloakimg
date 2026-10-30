// PropertiesPanel.tsx — The right-side panel on desktop and tablet.
// Shows the active tool's icon + name + group header on top, then
// renders ToolControls below.

import { I } from "../components/icons";
import { useActiveTool, useEditorActions, useEditorReadOnly } from "./EditorContext";
import { LayersList } from "./LayersList";
import { findTool } from "./tools";
import { ToolControls } from "./ToolControls";

interface Props {
  collapsed?: boolean;
}

export function PropertiesPanel({ collapsed = false }: Props) {
  // Read only the slices this wrapper needs: the active tool id (changes
  // on tool switch only) + the cancel affordance. Subscribing to the
  // omnibus `useEditor()` re-rendered the whole panel — header, controls
  // wrapper, and LayersList — on every slider tick.
  const activeTool = useActiveTool();
  const { cancelCurrentTool } = useEditorActions();
  const { canCancelCurrentTool } = useEditorReadOnly();
  const tool = findTool(activeTool);

  return (
    <div
      className={`editor-properties flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface ${
        collapsed ? "w-72" : "w-82"
      }`}
    >
      <div className="editor-properties__header">
        <div className="editor-properties__heading">
          <h2>{tool.name}</h2>
          <span className="text-[0.8125rem] text-text-muted">{tool.group}</span>
        </div>
        {/* Cancel — desktop parity with mobile's ✕ tap in the pinned
            tool header. Visible only when the active tool has
            actual rollback-able work (a pending apply OR commits since
            tool entry). Tapping discards the pending bake, rolls
            history back to the tool-entry checkpoint, and parks the
            user back on Move. Esc is the keyboard equivalent (wired
            in EditorShell). */}
        {canCancelCurrentTool && (
          <button
            type="button"
            onClick={() => void cancelCurrentTool()}
            title="Cancel changes (Esc)"
            aria-label="Cancel changes"
            className="btn btn-ghost btn-icon-xs rounded-md pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <I.X size={14} stroke={2} />
          </button>
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
        <ToolControls />
      </div>
      <LayersList />
    </div>
  );
}
