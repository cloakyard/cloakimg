// PropertiesPanel.tsx — The right-side panel on desktop and tablet.
// Shows the active tool's icon + name + group header on top, then
// renders ToolControls below.

import { useEditor } from "./EditorContext";
import { LayersList } from "./LayersList";
import { findTool } from "./tools";
import { ToolControls } from "./ToolControls";

interface Props {
  collapsed?: boolean;
}

export function PropertiesPanel({ collapsed = false }: Props) {
  const { toolState } = useEditor();
  const { activeTool } = toolState;
  const tool = findTool(activeTool);
  const Ic = tool.icon;

  return (
    // Sidebar widths (tablet vs desktop) were originally 240 / 280 px.
    // Once subject-aware tools landed, several panels gained an extra
    // "Apply to: Whole / Subject / Background" segmented row plus
    // optional progress / status cards — at 240 px those Segments
    // wrapped onto two lines and the panel started feeling cramped.
    // Bumped to 288 / 328 px: still leaves >440 px of canvas at the
    // narrowest tablet breakpoint (760 px viewport − 72 px tool rail),
    // and gives every panel enough horizontal room to lay out cleanly
    // including the new subject scope row, the byte-readout progress
    // card, and the Selective-colour 8-band swatch grid.
    // Border softened to `border-border-soft` and surface dropped to a
    // glass tint (V3 desktop redesign): mirrors the ToolRail treatment
    // so both sides of the canvas feel like floating chrome around the
    // photo rather than walled-off panes. The trailing chevron from the
    // header was decorative (no collapse action) and removed.
    <div
      className={`editor-paper flex shrink-0 flex-col overflow-hidden border-l border-border-soft bg-surface/60 dark:border-dark-border-soft dark:bg-dark-surface/60 ${
        collapsed ? "w-72" : "w-82"
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
