import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, vi } from "vite-plus/test";
import { ColorPicker } from "./ColorPicker";
function Harness() {
  const [value, set] = useState("#285ad7");
  return <ColorPicker value={value} onChange={set} />;
}
describe("author color", () => {
  it("preserves invalid hex, accepts shorthand and offers exact RGB values", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Pick a color" }));
    await screen.findByRole("dialog");
    const hex = screen.getByRole("textbox", { name: "Hex value" });
    fireEvent.change(hex, { target: { value: "#nope" } });
    fireEvent.blur(hex);
    expect(hex).toHaveValue("#nope");
    expect(hex).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.change(hex, { target: { value: "#abc" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(hex).toHaveValue("#AABBCC");
    expect(screen.getByRole("spinbutton", { name: "Red" })).toHaveValue(170);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Red" }), { target: { value: "255" } });
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Red" }));
    expect(hex).toHaveValue("#FFBBCC");
  });
  it("keeps hue and saturation available through black and names the brightness axis", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Pick a color" }));
    await screen.findByRole("dialog");
    const brightness = screen.getByRole("slider", { name: /Brightness/ });
    const hue = screen.getByRole("slider", { name: /Hue/ });
    fireEvent.change(brightness, { target: { value: "0" } });
    fireEvent.change(hue, { target: { value: "120" } });
    expect(hue).toHaveValue("120");
    fireEvent.change(brightness, { target: { value: "100" } });
    expect(screen.getByRole("textbox", { name: "Hex value" })).not.toHaveValue("#000000");
  });
  it("does not sample the screen when the API is unavailable", async () => {
    vi.stubGlobal("EyeDropper", undefined);
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Pick a color" }));
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getByRole("button", { name: "Eyedropper" })).toBeDisabled());
    vi.unstubAllGlobals();
  });
});
