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
    // Sidebar widths (tablet vs desktop) were originally 240 / 280 px.
    // Once subject-aware tools landed, several panels gained an extra
    // "Apply to: Whole / Subject / Background" segmented row plus
    // optional progress / status cards — at 240 px those Segments
    // wrapped onto two lines and the panel started feeling cramped.
    // Bumped to 288 / 328 px: still leaves >440 px of canvas at the
    // narrowest tablet breakpoint (MOBILE_MAX_PX viewport − 72 px tool rail),
    // and gives every panel enough horizontal room to lay out cleanly
    // including the new subject scope row, the byte-readout progress
    // card, and the Selective-colour 8-band swatch grid.
    // V5 (May 2026 minimalist desktop redesign) — like the ToolRail
    // opposite, the panel no longer carries its own surface or
    // backdrop blur. Controls sit directly on cream; only a soft
    // left divider separates them from the canvas.
    <div
      className={`flex shrink-0 flex-col overflow-hidden border-l border-border-soft ${
        collapsed ? "w-72" : "w-82"
      }`}
    >
      {/* Header — V4 (May 2026): single-line rhythm. The prior layout
          painted three echoes of the same fact — coral icon chip + tool
          name + uppercase group caption — even though the active tool
          rail button already tells the user which tool is selected.
          Stripping the chip and stacking name + group inline gives the
          panel a quieter chrome that defers to the controls below. */}
      <div className="flex shrink-0 items-baseline gap-2 border-b border-border-soft px-4 py-3.5">
        <div className="min-w-0 flex-1 truncate">
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-text">
            {tool.name}
          </span>
          <span className="ml-2 text-[11px] font-medium tracking-[0.04em] text-text-muted uppercase">
            {tool.group}
          </span>
        </div>
        {/* Cancel — desktop parity with mobile's ✕ tap in the
            MobileToolFooter. Visible only when the active tool has
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
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-text-muted transition-colors hover:bg-surface hover:text-text"
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
        className="panel-fade-in scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-3.5 pb-4"
      >
        <ToolControls />
      </div>
      <LayersList />
    </div>
  );
}
