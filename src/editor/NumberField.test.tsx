import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, vi } from "vite-plus/test";
import { NumberField } from "./NumberField";
describe("precision input", () => {
  it("retains partial and out-of-range drafts without coercing or editing the image", () => {
    const commit = vi.fn();
    render(
      <NumberField
        label="Exposure"
        value={0}
        min={-2}
        max={2}
        step={0.1}
        unit="EV"
        onCommit={commit}
      />,
    );
    const input = screen.getByRole("textbox");
    for (const value of ["-", "", "2.5", "1x"]) {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(input).toHaveValue(value);
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(commit).not.toHaveBeenCalled();
    }
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("0");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("commits one signed value on Enter and preserves keyboard precision", async () => {
    const commit = vi.fn();
    function Field() {
      const [value, set] = useState(0);
      return (
        <NumberField
          label="Exposure"
          value={value}
          min={-2}
          max={2}
          step={0.1}
          onCommit={(v) => {
            set(v);
            commit(v);
          }}
        />
      );
    }
    const user = userEvent.setup();
    render(<Field />);
    const input = screen.getByRole("textbox");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "-1.2{Enter}");
    expect(commit).toHaveBeenCalledExactlyOnceWith(-1.2);
    await user.click(input);
    await user.keyboard("{ArrowUp}");
    expect(input).toHaveValue("-1.1");
    await user.keyboard("{Shift>}{ArrowUp}{/Shift}");
    expect(input).toHaveValue("-0.1");
  });
});
