// Tests for MaskReadyPill.
//
// The pill is the user's signal that the next smart action is
// effectively free (no download, no detection). Each of the four
// smart-action panels surfaces it; a regression here would silently
// hide the affordance from every panel. We pin the contract:
//   • renders nothing when the mask isn't ready (no layout reserved)
//   • renders an accessible status region when ready
//   • align prop drives the row alignment

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaskReadyPill } from "./MaskReadyPill";

describe("MaskReadyPill", () => {
  it("renders nothing when ready=false (no layout space reserved)", () => {
    const { container } = render(<MaskReadyPill ready={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders an accessible status region when ready=true", () => {
    render(<MaskReadyPill ready={true} />);
    expect(screen.getByRole("status", { name: /Subject mask ready/i })).toBeInTheDocument();
  });

  it("includes a visible 'Mask ready' label", () => {
    render(<MaskReadyPill ready={true} />);
    expect(screen.getByText(/Mask ready/i)).toBeInTheDocument();
  });

  it("default alignment is end (matches the smart-button row pattern)", () => {
    const { container } = render(<MaskReadyPill ready={true} />);
    expect(container.firstChild).toHaveClass("justify-end");
  });

  it("accepts align='start' for left-aligned rows", () => {
    const { container } = render(<MaskReadyPill ready={true} align="start" />);
    expect(container.firstChild).toHaveClass("justify-start");
  });

  it("accepts align='center'", () => {
    const { container } = render(<MaskReadyPill ready={true} align="center" />);
    expect(container.firstChild).toHaveClass("justify-center");
  });

  it("toggles cleanly between ready states across renders (no stale DOM)", () => {
    const { rerender, container } = render(<MaskReadyPill ready={false} />);
    expect(container.innerHTML).toBe("");
    rerender(<MaskReadyPill ready={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    rerender(<MaskReadyPill ready={false} />);
    expect(container.innerHTML).toBe("");
  });
});
