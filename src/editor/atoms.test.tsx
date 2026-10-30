// Shared precision and choice control behavior.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { NumericReadout, PropRow, Segment, Slider, ToggleSwitch } from "./atoms";

describe("Segment", () => {
  it("exposes one native radio group and reports the selected value", () => {
    const onChange = vi.fn();
    render(<Segment options={["A", "B", "C"]} active={1} onChange={onChange} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: "B" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "C" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
  it("keeps empty and read-only groups non-interactive", () => {
    const view = render(<Segment options={[]} active={0} />);
    expect(screen.queryByRole("radio")).toBeNull();
    view.rerender(<Segment options={["A", "B"]} active={0} />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
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
      <PropRow
        label="Progressive falloff"
        valueInput={<ToggleSwitch on={false} onChange={() => undefined} />}
      >
        <span>Details</span>
      </PropRow>,
    );

    expect(screen.getByRole("switch", { name: "Progressive falloff" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("supports an explicit toggle name outside PropRow", () => {
    render(<ToggleSwitch ariaLabel="Grayscale" on onChange={() => undefined} />);
    expect(screen.getByRole("switch", { name: "Grayscale" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("disables a read-only toggle instead of leaving a no-op button", () => {
    render(<ToggleSwitch ariaLabel="Read only" on={false} />);
    expect(screen.getByRole("switch", { name: "Read only" })).toBeDisabled();
  });
});
