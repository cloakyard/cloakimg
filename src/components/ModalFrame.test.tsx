import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ModalFrame } from "./ModalFrame";

function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Launch dialog
      </button>
      <div role="dialog" aria-label="Underlying tool sheet">
        Tool controls
      </div>
      {open && (
        <ModalFrame onClose={() => setOpen(false)} labelledBy="test-dialog-title">
          <h2 id="test-dialog-title">Test dialog</h2>
          <button type="button">Primary action</button>
        </ModalFrame>
      )}
    </>
  );
}

describe("ModalFrame", () => {
  it("isolates a stacked dialog, moves focus, and restores the page immediately after Escape", () => {
    render(<Harness />);

    const launch = screen.getByRole("button", { name: "Launch dialog" });
    launch.focus();
    fireEvent.click(launch);

    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    const underlying = document.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Underlying tool sheet"]',
    );

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveClass("cloak-dialog");
    expect(dialog).toHaveFocus();
    expect(underlying).not.toBeNull();
    expect(underlying).toHaveAttribute("aria-hidden", "true");
    expect(underlying?.inert).toBe(true);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Test dialog" })).toBeNull();
    expect(underlying).not.toHaveAttribute("aria-hidden");
    expect(underlying?.inert).not.toBe(true);
    expect(launch).toHaveFocus();
  });

  it("can render a keyboard-first dialog without enter or exit motion", () => {
    function InstantHarness() {
      const [open, setOpen] = useState(true);
      return open ? (
        <ModalFrame instant onClose={() => setOpen(false)} labelledBy="instant-title">
          <h2 id="instant-title">Instant dialog</h2>
        </ModalFrame>
      ) : null;
    }

    render(<InstantHarness />);
    const dialog = screen.getByRole("dialog", { name: "Instant dialog" });
    expect(dialog.className).not.toContain("ci-modal-card-enter");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Instant dialog" })).toBeNull();
  });

  it("routes scrim dismissal through the exit-motion budget", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Launch dialog" }));

    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.queryByRole("dialog", { name: "Test dialog" })).toBeNull();
  });
});
