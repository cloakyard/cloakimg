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

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileMoreMenu } from "./MobileMoreMenu";

// ModalFrame routes every close path through a ~260ms exit animation
// so the bottom sheet slides down before unmount. Tests that assert
// onClose timing use fake timers to advance past that window.
const EXIT_MS = 260;

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

  // The next three cases drive ModalFrame's animated-close lifecycle.
  // The user-facing contract is unchanged ("clicking dismisses the
  // menu" / "Esc closes" / "Reset runs after the menu is gone") but
  // the timing now includes the exit animation, so the tests use fake
  // timers to advance past the slide-down without waiting in real time.
  describe("animated close", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("clicking File information fires onShowFileProps immediately and onClose after the exit animation", () => {
      const onShowFileProps = vi.fn();
      const onClose = vi.fn();
      render(<MobileMoreMenu {...baseProps} onShowFileProps={onShowFileProps} onClose={onClose} />);
      // fireEvent (not userEvent) — userEvent's internal awaits stall
      // forever under fake timers.
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /File information/i }));
      });
      // The file properties modal must open right away — it slides in
      // while the menu slides out so the handoff feels continuous.
      expect(onShowFileProps).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(EXIT_MS + 16);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    // Reset is destructive — the menu must fully animate closed BEFORE
    // the parent shows its confirm dialog, otherwise the confirm stacks
    // on top of a still-fading menu.
    it("clicking Reset all edits closes the menu before invoking onReset", () => {
      const calls: string[] = [];
      const onReset = vi.fn(() => calls.push("reset"));
      const onClose = vi.fn(() => calls.push("close"));
      render(<MobileMoreMenu {...baseProps} onReset={onReset} onClose={onClose} />);
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: /Reset all edits/i }));
      });
      // Neither has fired yet — both are queued behind the slide-down.
      expect(calls).toEqual([]);
      act(() => {
        vi.advanceTimersByTime(EXIT_MS + 16);
      });
      // close fires first (via ModalFrame's onCloseRef.current()), then
      // the onSettled callback runs onReset — preserving the invariant.
      expect(calls).toEqual(["close", "reset"]);
    });

    it("Escape key dismisses the menu (onClose) after the exit animation", () => {
      const onClose = vi.fn();
      render(<MobileMoreMenu {...baseProps} onClose={onClose} />);
      const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
      act(() => {
        window.dispatchEvent(ev);
      });
      expect(onClose).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(EXIT_MS + 16);
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
