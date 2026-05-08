// Tests for the shared smart-action error chip.
//
// Four tools (Crop · Redact · RemoveBg · Watermark) used to render
// nearly-identical inline error chips with subtly different a11y
// affordances. Centralising into <SmartActionError /> means a fix or
// refinement to the chip lands in every tool at once. These tests
// pin the contract so a future change can't quietly drop the alert
// role or the dismiss button on one of the consumers.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SmartActionError } from "./SmartActionError";

describe("SmartActionError", () => {
  it("renders nothing when message is null (panels mount the component unconditionally)", () => {
    const { container } = render(<SmartActionError message={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when message is empty string (truthy gate)", () => {
    const { container } = render(<SmartActionError message="" />);
    expect(container.innerHTML).toBe("");
  });

  it("renders an alert-role region when message is present (screen reader announcement)", () => {
    render(<SmartActionError message="Couldn't find a clear subject in this photo." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/Couldn't find a clear subject/);
  });

  it("includes the message text verbatim, never truncated", () => {
    const long =
      "The on-device runtime didn't compile in this browser. Try a recent Chrome / Safari, or use the Chroma keyer.";
    render(<SmartActionError message={long} />);
    expect(screen.getByRole("alert")).toHaveTextContent(long);
  });

  it("does NOT render a dismiss button when onDismiss is omitted", () => {
    render(<SmartActionError message="some failure" />);
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
  });

  it("renders a dismiss X button when onDismiss is provided", () => {
    const onDismiss = vi.fn();
    render(<SmartActionError message="some failure" onDismiss={onDismiss} />);
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });

  it("clicking the dismiss button calls onDismiss exactly once", async () => {
    const onDismiss = vi.fn();
    render(<SmartActionError message="some failure" onDismiss={onDismiss} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("the dismiss button has aria-label='Dismiss error' (a11y contract for screen readers)", () => {
    render(<SmartActionError message="x" onDismiss={() => undefined} />);
    expect(screen.getByRole("button", { name: "Dismiss error" })).toBeInTheDocument();
  });

  it("re-renders cleanly when the message changes (no stale text from previous error)", () => {
    const { rerender } = render(<SmartActionError message="first" />);
    expect(screen.getByRole("alert")).toHaveTextContent("first");
    rerender(<SmartActionError message="second" />);
    expect(screen.getByRole("alert")).toHaveTextContent("second");
    expect(screen.queryByText("first")).toBeNull();
  });
});
