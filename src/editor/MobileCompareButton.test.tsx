// Tests for MobileCompareButton.
//
// This pill replaced a four-tap path through the More menu (More →
// Show original → More → Hide original) with a single press-and-hold
// gesture. The component is small but load-bearing: it is the *only*
// compare affordance on mobile now, so a regression here would leave
// users unable to flip back to the original. We pin the contract:
//   • renders the visible "Hold" label in the idle state
//   • flips to "Original" while compareActive is true
//   • forwards pointerDown → setCompareActive(true)
//   • forwards pointerUp / pointerLeave / pointerCancel → setCompareActive(false)
//   • exposes aria-pressed mirroring compareActive (a11y)

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileCompareButton } from "./MobileCompareButton";

describe("MobileCompareButton", () => {
  it("renders the 'Hold' label in the idle state", () => {
    render(<MobileCompareButton compareActive={false} setCompareActive={() => undefined} />);
    expect(screen.getByRole("button")).toHaveTextContent(/^Hold$/);
  });

  it("flips to the 'Original' label while compareActive is true", () => {
    render(<MobileCompareButton compareActive={true} setCompareActive={() => undefined} />);
    expect(screen.getByRole("button")).toHaveTextContent(/^Original$/);
  });

  it("aria-pressed mirrors compareActive (a11y contract for assistive tech)", () => {
    const { rerender } = render(
      <MobileCompareButton compareActive={false} setCompareActive={() => undefined} />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(<MobileCompareButton compareActive={true} setCompareActive={() => undefined} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("aria-label changes between idle and active so screen readers announce the state", () => {
    const { rerender } = render(
      <MobileCompareButton compareActive={false} setCompareActive={() => undefined} />,
    );
    expect(
      screen.getByRole("button", { name: /Hold to compare with original/i }),
    ).toBeInTheDocument();
    rerender(<MobileCompareButton compareActive={true} setCompareActive={() => undefined} />);
    expect(
      screen.getByRole("button", { name: /Showing original — release to return/i }),
    ).toBeInTheDocument();
  });

  it("pointerDown engages compare (peek-while-held)", () => {
    const setCompareActive = vi.fn();
    render(<MobileCompareButton compareActive={false} setCompareActive={setCompareActive} />);
    fireEvent.pointerDown(screen.getByRole("button"));
    expect(setCompareActive).toHaveBeenCalledWith(true);
  });

  it("pointerUp releases compare (return to edit)", () => {
    const setCompareActive = vi.fn();
    render(<MobileCompareButton compareActive={true} setCompareActive={setCompareActive} />);
    fireEvent.pointerUp(screen.getByRole("button"));
    expect(setCompareActive).toHaveBeenCalledWith(false);
  });

  // Drag-off-edge release. Without this, dragging the finger off the
  // pill mid-press would leave the canvas stuck in compare mode. The
  // pointerLeave listener guarantees a clean return.
  it("pointerLeave releases compare (drag-off-edge safety net)", () => {
    const setCompareActive = vi.fn();
    render(<MobileCompareButton compareActive={true} setCompareActive={setCompareActive} />);
    fireEvent.pointerLeave(screen.getByRole("button"));
    expect(setCompareActive).toHaveBeenCalledWith(false);
  });

  // pointerCancel fires when the OS interrupts the gesture (palm
  // rejection, system sheet, etc.). We must release in that case too.
  it("pointerCancel releases compare (OS gesture interrupt)", () => {
    const setCompareActive = vi.fn();
    render(<MobileCompareButton compareActive={true} setCompareActive={setCompareActive} />);
    fireEvent.pointerCancel(screen.getByRole("button"));
    expect(setCompareActive).toHaveBeenCalledWith(false);
  });

  it("press → release sequence calls setCompareActive(true) then setCompareActive(false)", () => {
    const setCompareActive = vi.fn();
    const { rerender } = render(
      <MobileCompareButton compareActive={false} setCompareActive={setCompareActive} />,
    );
    fireEvent.pointerDown(screen.getByRole("button"));
    rerender(<MobileCompareButton compareActive={true} setCompareActive={setCompareActive} />);
    fireEvent.pointerUp(screen.getByRole("button"));
    expect(setCompareActive).toHaveBeenNthCalledWith(1, true);
    expect(setCompareActive).toHaveBeenNthCalledWith(2, false);
  });

  // The pill needs touch-none + select-none so iOS doesn't pop the
  // magnifier / text-selection on long-press. Without these, the hold
  // gesture would compete with the system, and users would see a
  // selection bubble instead of seeing the original photo.
  it("button has touch-none and select-none classes (iOS long-press hardening)", () => {
    render(<MobileCompareButton compareActive={false} setCompareActive={() => undefined} />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("touch-none");
    expect(btn).toHaveClass("select-none");
  });
});
