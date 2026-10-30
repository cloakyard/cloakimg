/** Persistent tool navigation. Tool changes leave the image and history mounted. */
import { memo, useEffect, useRef } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { I } from "../components/icons";
import { ALL_TOOLS, type ToolId } from "./tools";
interface Props {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
  onOpenSearch: () => void;
}
export const ToolRail = memo(function ToolRail({ activeTool, onSelect, onOpenSearch }: Props) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView?.({ block: "nearest", behavior: "auto" });
  }, [activeTool]);
  return (
    <Tooltip.Provider delay={400}>
      <nav
        aria-label="Editor tools"
        className="editor-toolrail flex w-18 shrink-0 flex-col overflow-hidden border-r border-border bg-surface"
      >
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                className="img-rail-search"
                onClick={onOpenSearch}
                aria-label="Search tools"
                aria-keyshortcuts="Meta+K Control+K"
              />
            }
          >
            <I.Search size={18} aria-hidden="true" />
          </Tooltip.Trigger>
          <Hint>Search tools</Hint>
        </Tooltip.Root>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {ALL_TOOLS.map((tool, index) => {
            const Icon = tool.icon,
              isActive = tool.id === activeTool;
            return (
              <div key={tool.id}>
                {index > 0 && ALL_TOOLS[index - 1]?.group !== tool.group && (
                  <div className="mx-3 my-2 h-px bg-border" />
                )}
                <Tooltip.Root>
                  <Tooltip.Trigger
                    render={
                      <button
                        ref={isActive ? active : undefined}
                        type="button"
                        className="img-rail-tool"
                        onClick={() => onSelect(tool.id)}
                        aria-label={tool.name}
                        aria-pressed={isActive}
                      />
                    }
                  >
                    <Icon size={18} aria-hidden="true" />
                    {isActive && <span className="img-rail-marker" aria-hidden="true" />}
                  </Tooltip.Trigger>
                  <Hint>{tool.name}</Hint>
                </Tooltip.Root>
              </div>
            );
          })}
        </div>
      </nav>
    </Tooltip.Provider>
  );
});
function Hint({ children }: { children: string }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Positioner
        className="air-floating-positioner"
        side="right"
        sideOffset={8}
        collisionPadding={16}
        positionMethod="fixed"
      >
        <Tooltip.Popup role="tooltip" className="air-tooltip">
          {children}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  );
}
