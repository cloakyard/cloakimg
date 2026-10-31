import { memo } from "react";
import { I } from "../components/icons";
import type { ToolId } from "./tools";

const SHORTCUTS: { label: string; id: ToolId; tools: ToolId[]; icon: typeof I.Sliders }[] = [
  {
    label: "Adjust",
    id: "adjust",
    tools: ["adjust", "levels", "hsl", "filter", "tod", "relight", "color"],
    icon: I.Sliders,
  },
  { label: "Crop", id: "crop", tools: ["crop", "perspective", "resize", "idphoto"], icon: I.Crop },
  { label: "Retouch", id: "spot", tools: ["spot", "bgblur", "bgrm", "tapfix"], icon: I.Eraser },
  { label: "Protect", id: "redact", tools: ["redact"], icon: I.EyeOff },
  {
    label: "Add",
    id: "text",
    tools: ["text", "shapes", "draw", "emoji", "mark", "pen", "image", "frame", "border"],
    icon: I.Type,
  },
];

/** The same labelled shortcuts form a phone dock and a compact tablet rail. */
export const CompactToolNav = memo(function CompactToolNav({
  activeTool,
  onSelect,
  onOpenSearch,
  vertical = false,
}: {
  activeTool: ToolId;
  onSelect: (id: ToolId) => void;
  onOpenSearch: () => void;
  vertical?: boolean;
}) {
  return (
    <nav
      aria-label="Editor tools"
      className={`editor-compact-nav${vertical ? " editor-compact-nav--rail" : ""}`}
    >
      {SHORTCUTS.map(({ label, id, tools, icon: Icon }) => {
        const active = tools.includes(activeTool);
        return (
          <button
            key={id}
            type="button"
            className="editor-compact-tool"
            aria-pressed={active}
            onClick={() => onSelect(id)}
          >
            <Icon size={20} stroke={1.6} />
            <span>{label}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="editor-compact-tool"
        onClick={onOpenSearch}
        aria-label="Open tools"
        aria-haspopup="dialog"
      >
        <I.Grid2x2 size={20} stroke={1.6} />
        <span>Tools</span>
      </button>
    </nav>
  );
});
