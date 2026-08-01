// Tests for the shared property atoms.
//
// Segment ships in 14 places (Adjust, BgBlur, Border, Crop, Default,
// Draw, Redact, RemoveBg, Resize, Text, Watermark, …) so a regression
// in the sliding-pill geometry leaks into every panel.
//
// The bug we hit before this fix: the pill's width subtracted a
// hard-coded `4px` and its translate added `4px` per slot, but the
// parent's padding scaled from `p-0.5` (2 px) on mouse to `p-1`
// (4 px) on coarse pointers. On touch, the rightmost pill ate its
// right margin and visually touched the outer border.
//
// The fix sources the inset from a `--seg-inset` CSS variable that
// flips with the parent's pointer-coarse padding, so the pill
// geometry tracks the real padding regardless of input device.
//
// These tests pin the contract:
//   • renders nothing-ish (just the chrome) when options=[]
//   • renders one button per option, with aria-pressed mirroring
//   • the sliding pill exists and uses var(--seg-inset) — not
//     a literal `4px` — for both width and translate
//   • clicking forwards the index to onChange

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumericReadout, PropRow, Segment, Slider, ToggleSwitch } from "./atoms";

describe("Segment", () => {
  it("renders one <button> per option", () => {
    render(<Segment options={["A", "B", "C"]} active={0} onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "C" })).toBeInTheDocument();
  });

  it("emits onChange with the clicked index", () => {
    const onChange = vi.fn();
    render(<Segment options={["A", "B", "C"]} active={0} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "C" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("renders the sliding pill alongside the buttons (aria-hidden span)", () => {
    const { container } = render(
      <Segment options={["A", "B"]} active={0} onChange={() => undefined} />,
    );
    const pill = container.querySelector('span[aria-hidden="true"]');
    expect(pill).not.toBeNull();
  });

  it("pill width and transform reference --seg-inset (not a hard-coded 4px)", () => {
    const { container } = render(
      <Segment options={["A", "B", "C", "D"]} active={3} onChange={() => undefined} />,
    );
    const pill = container.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(pill).not.toBeNull();
    // width must reference the CSS variable so it tracks the parent's
    // padding on both mouse (2 px) and coarse pointers (4 px). A
    // hard-coded `4px` was the source of the rightmost-touches-edge
    // bug on touch.
    expect(pill.style.width).toContain("--seg-inset");
    expect(pill.style.width).not.toMatch(/-\s*4px\s*\)/);
    expect(pill.style.transform).toContain("--seg-inset");
    expect(pill.style.transform).not.toMatch(/\+\s*\d+\s*\*\s*4px/);
  });

  it("parent container declares the --seg-inset variable for both pointer densities", () => {
    const { container } = render(
      <Segment options={["A", "B"]} active={0} onChange={() => undefined} />,
    );
    const root = container.firstChild as HTMLElement;
    // 2 px on regular pointers (matches `p-0.5`), 4 px on coarse
    // (matches `p-1`). The Tailwind variants compile to the
    // utilities below.
    expect(root.className).toContain("[--seg-inset:2px]");
    expect(root.className).toContain("pointer-coarse:[--seg-inset:4px]");
  });

  it("exposes the active option with aria-pressed", () => {
    render(<Segment options={["A", "B", "C"]} active={1} onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "A" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "B" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "C" })).toHaveAttribute("aria-pressed", "false");
  });

  it("renders no buttons when options=[] (graceful empty state)", () => {
    const { container } = render(<Segment options={[]} active={0} onChange={() => undefined} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    // No pill rendered when there are no slots to highlight.
    expect(container.querySelector('span[aria-hidden="true"]')).toBeNull();
  });
});

describe("Slider", () => {
  it("inherits its accessible name from PropRow", () => {
    render(
      <PropRow label="Exposure">
        <Slider value={0.5} onChange={() => undefined} />
      </PropRow>,
    );
    expect(screen.getByRole("slider", { name: "Exposure" })).toBeInTheDocument();
  });

  it("supports arrow, page, home, and end keys", () => {
    const onChange = vi.fn();
    render(<Slider ariaLabel="Strength" value={0.5} step={0.05} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Strength" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "PageDown" });
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: "End" });

    expect(onChange).toHaveBeenNthCalledWith(1, 0.55);
    expect(onChange).toHaveBeenNthCalledWith(2, 0);
    expect(onChange).toHaveBeenNthCalledWith(3, 0);
    expect(onChange).toHaveBeenNthCalledWith(4, 1);
  });

  it("marks read-only sliders disabled and removes them from tab order", () => {
    render(<Slider ariaLabel="Read only" value={0.25} />);
    const slider = screen.getByRole("slider", { name: "Read only" });
    expect(slider).toHaveAttribute("aria-disabled", "true");
    expect(slider).toHaveAttribute("tabindex", "-1");
  });
});

describe("PropRow accessibility", () => {
  it("names an editable numeric readout with its property label", () => {
    render(
      <PropRow
        label="Exposure"
        valueInput={
          <NumericReadout
            display="+0.0"
            normalized={0.5}
            fromNormalized={(value) => value}
            toNormalized={(value) => value}
            onCommit={() => undefined}
          />
        }
      >
        <Slider value={0.5} onChange={() => undefined} />
      </PropRow>,
    );

    expect(screen.getByRole("textbox", { name: "Exposure" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Exposure" })).toBeInTheDocument();
  });

  it("names a toggle placed in the value slot with its property label", () => {
    render(
      <PropRow label="Progressive falloff" valueInput={<ToggleSwitch on={false} />}>
        <span>Details</span>
      </PropRow>,
    );

    expect(screen.getByRole("button", { name: "Progressive falloff" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("supports an explicit toggle name outside PropRow", () => {
    render(<ToggleSwitch ariaLabel="Grayscale" on />);
    expect(screen.getByRole("button", { name: "Grayscale" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
