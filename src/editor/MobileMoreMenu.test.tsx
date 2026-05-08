// Tests for MobileMoreMenu.
//
// The menu used to host three actions: File information · Show original ·
// Reset. "Show original" was demoted to a press-and-hold pill on the
// canvas (see MobileCompareButton) because flipping back-and-forth via
// this menu took four taps and felt cumbersome.
//
// These tests pin the reduced surface so a future refactor can't
// silently re-introduce the compare entry here (which would dilute the
// canvas pill as the canonical compare affordance) and so the remaining
// actions stay discoverable.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileMoreMenu } from "./MobileMoreMenu";

const baseProps = {
  fileName: "photo.jpg",
  hasDoc: true,
  canReset: true,
  onShowFileProps: () => undefined,
  onReset: () => undefined,
  onClose: () => undefined,
};

describe("MobileMoreMenu", () => {
  it("renders File information and Reset all edits", () => {
    render(<MobileMoreMenu {...baseProps} />);
    expect(screen.getByText(/File information/i)).toBeInTheDocument();
    expect(screen.getByText(/Reset all edits/i)).toBeInTheDocument();
  });

  // Regression guard. If a future refactor re-adds compare to this
  // menu, the canvas pill stops being the single source of truth and
  // users get two competing affordances with different gesture models
  // (tap-toggle here vs press-and-hold on the pill).
  it("does NOT contain a 'Show original' / 'Hide original' entry — compare lives on the canvas now", () => {
    render(<MobileMoreMenu {...baseProps} />);
    expect(screen.queryByText(/Show original/i)).toBeNull();
    expect(screen.queryByText(/Hide original/i)).toBeNull();
  });

  it("File information shows the file name as a hint when a doc is loaded", () => {
    render(<MobileMoreMenu {...baseProps} fileName="vacation.heic" />);
    expect(screen.getByText("vacation.heic")).toBeInTheDocument();
  });

  it("File information shows 'No file loaded' when hasDoc is false", () => {
    render(<MobileMoreMenu {...baseProps} hasDoc={false} />);
    expect(screen.getByText(/No file loaded/i)).toBeInTheDocument();
  });

  it("File information button is disabled when hasDoc is false", () => {
    render(<MobileMoreMenu {...baseProps} hasDoc={false} />);
    expect(screen.getByRole("button", { name: /File information/i })).toBeDisabled();
  });

  it("Reset all edits button is disabled when canReset is false", () => {
    render(<MobileMoreMenu {...baseProps} canReset={false} />);
    expect(screen.getByRole("button", { name: /Reset all edits/i })).toBeDisabled();
  });

  it("clicking File information fires onShowFileProps then onClose", async () => {
    const onShowFileProps = vi.fn();
    const onClose = vi.fn();
    render(<MobileMoreMenu {...baseProps} onShowFileProps={onShowFileProps} onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /File information/i }));
    expect(onShowFileProps).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Reset is destructive — onClose must fire *before* onReset so the
  // menu doesn't sit open over the confirm dialog the parent shows.
  it("clicking Reset all edits closes the menu before invoking onReset", async () => {
    const calls: string[] = [];
    const onReset = vi.fn(() => calls.push("reset"));
    const onClose = vi.fn(() => calls.push("close"));
    render(<MobileMoreMenu {...baseProps} onReset={onReset} onClose={onClose} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Reset all edits/i }));
    expect(calls).toEqual(["close", "reset"]);
  });

  it("Escape key dismisses the menu (onClose)", () => {
    const onClose = vi.fn();
    render(<MobileMoreMenu {...baseProps} onClose={onClose} />);
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    window.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
