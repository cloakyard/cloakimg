import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ALL_TOOLS } from "./tools";
import { ToolRail } from "./ToolRail";

describe("ToolRail", () => {
  it("keeps search fixed above a complete, accessible icon tool list", () => {
    const onOpenSearch = vi.fn();
    render(<ToolRail activeTool="move" onSelect={() => undefined} onOpenSearch={onOpenSearch} />);

    expect(screen.getByRole("navigation", { name: "Editor tools" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(ALL_TOOLS.length + 1);

    const search = screen.getByRole("button", { name: "Search tools" });
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K");
    fireEvent.click(search);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it("selects a tool and exposes its name through accessible hover/focus labels", () => {
    const onSelect = vi.fn();
    render(<ToolRail activeTool="move" onSelect={onSelect} onOpenSearch={() => undefined} />);

    const crop = screen.getByRole("button", { name: "Crop & rotate" });
    expect(screen.getByRole("button", { name: "Move" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.focus(crop);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Crop & rotate");

    fireEvent.click(crop);
    expect(onSelect).toHaveBeenCalledWith("crop");
  });
});
