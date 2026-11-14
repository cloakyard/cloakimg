import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { ToolSearchModal } from "./ToolSearchModal";

describe("ToolSearchModal", () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "does not choose a tool while confirming an IME candidate (%j)",
    (composition) => {
      const onClose = vi.fn();
      const onSelect = vi.fn();
      render(<ToolSearchModal onClose={onClose} onSelect={onSelect} />);
      const input = screen.getByRole("combobox", { name: "Search editor tools" });
      fireEvent.change(input, { target: { value: "crop" } });
      fireEvent.keyDown(input, { key: "Enter", ...composition });
      expect(onSelect).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect(input).toHaveValue("crop");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onSelect).toHaveBeenCalledExactlyOnceWith("crop");
    },
  );
  it("filters by names, aliases, and tool families", () => {
    render(<ToolSearchModal onClose={() => undefined} onSelect={() => undefined} />);

    const input = screen.getByRole("combobox", { name: "Search editor tools" });
    fireEvent.change(input, { target: { value: "background" } });

    expect(screen.getByRole("option", { name: /Portrait blur/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Remove BG/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Crop & rotate/i })).toBeNull();

    fireEvent.change(input, { target: { value: "privacy" } });
    expect(screen.getByRole("option", { name: /Redact/i })).toBeInTheDocument();
  });

  it("supports keyboard selection and closes immediately before switching tools", () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    render(<ToolSearchModal onClose={onClose} onSelect={onSelect} />);

    const input = screen.getByRole("combobox", { name: "Search editor tools" });
    fireEvent.change(input, { target: { value: "crop" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("crop");
  });

  it("shows an actionable empty state", () => {
    render(<ToolSearchModal onClose={() => undefined} onSelect={() => undefined} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Search editor tools" }), {
      target: { value: "not-a-real-tool" },
    });

    expect(screen.getByText("No tool found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText("Move")).toBeInTheDocument();
  });
});
