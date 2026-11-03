import { useAirPresence } from "../../docs/air/presence.tsx";
// Compact controls stay above a persistent tool dock. The catalogue is an
// overlay, so browsing tools never unregisters the current pending apply.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useActiveTool, useEditorActions } from "./EditorContext";
import { CompactToolNav } from "./CompactToolNav";
import { LayersList } from "./LayersList";
import { ToolActions } from "./ToolActions";
import { ToolControls } from "./ToolControls";
import { findTool, type ToolId } from "./tools";

export function MobileEditorSurface({
  onOpenSearch,
  moveRequest,
}: {
  onOpenSearch: () => void;
  moveRequest: number;
}) {
  const activeTool = useActiveTool();
  const { setActiveTool, cancelCurrentTool, runBusy } = useEditorActions();
  const [moveOpen, setMoveOpen] = useState(false);
  const panelOpen = activeTool !== "move" || moveOpen;
  const presence = useAirPresence(panelOpen, "panel");
  const shownTool = useRef(activeTool);
  if (panelOpen) shownTool.current = activeTool;
  const displayTool = shownTool.current;
  const lastMoveRequest = useRef(moveRequest);
  useEffect(() => {
    if (moveRequest !== lastMoveRequest.current) setMoveOpen(true);
    lastMoveRequest.current = moveRequest;
  }, [moveRequest]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTool]);

  // setActiveTool awaits the pending bake while the stage and panel remain
  // mounted. Cancel uses the provider's tool-entry checkpoint on every layout.
  const handleClose = useCallback(() => setMoveOpen(false), []);
  const handleCancel = useCallback(async () => {
    await runBusy("Cancelling…", cancelCurrentTool);
    setMoveOpen(false);
  }, [cancelCurrentTool, runBusy]);
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="dialog"], [role="listbox"]')
      )
        return;
      // Base UI may close the listbox before this window listener runs.
      // Its trigger still owns Escape; don't cancel the pending image edit.
      if (
        target?.closest(
          'input, textarea, [contenteditable=true], [role="combobox"], [role="listbox"], [role="option"], [role="dialog"], [role="menu"]',
        )
      )
        return;
      event.preventDefault();
      void handleCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, handleCancel]);

  const handleSelectTool = useCallback(
    (id: ToolId) => {
      if (id !== activeTool) void setActiveTool(id);
    },
    [activeTool, setActiveTool],
  );
  return (
    <div className="editor-mobile-workspace">
      {presence.mounted && (
        <div
          ref={presence.ref}
          inert={presence.closing}
          role="region"
          aria-label="Tool controls"
          className="editor-mobile-surface"
        >
          <div className="editor-mobile-header">
            <h2 className="editor-mobile-title">{findTool(displayTool).name}</h2>
            <ToolActions
              key={`actions-${displayTool}`}
              toolId={displayTool}
              compact
              feedback={feedback}
              onClose={handleClose}
            />
          </div>
          <div
            ref={scrollRef}
            className="air-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div>
              <div ref={setFeedback} className="editor-tool-feedback" />
              <div key={displayTool} className="flex flex-col gap-4 px-4 pt-3 pb-4">
                <ToolControls toolId={displayTool} />
              </div>
              <LayersList />
            </div>
          </div>
        </div>
      )}
      <div className="editor-mobile-dock">
        <CompactToolNav
          activeTool={activeTool}
          onSelect={handleSelectTool}
          onOpenSearch={onOpenSearch}
        />
      </div>
    </div>
  );
}
