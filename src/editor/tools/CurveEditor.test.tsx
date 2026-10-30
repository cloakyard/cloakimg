import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, it, expect, vi } from "vite-plus/test";
import { CurveEditor } from "./CurveEditor";
import { IDENTITY_CURVE } from "../toolState";
vi.mock("../EditorContext", () => ({
  useEditorReadOnly: () => ({ doc: null, historyVersion: 0 }),
}));
function Harness() {
  const [curve, setCurve] = useState(IDENTITY_CURVE);
  return <CurveEditor curve={curve} onChange={setCurve} />;
}
describe("precise tone curve", () => {
  it("adds, selects, nudges and removes interior points while protecting endpoints", () => {
    render(<Harness />);
    expect(screen.getByRole("spinbutton", { name: "Curve input" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove point" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Add point" }));
    const input = screen.getByRole("spinbutton", { name: "Curve input" });
    expect(input).toHaveValue(128);
    fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowRight" });
    expect(input).toHaveValue(129);
    const output = screen.getByRole("spinbutton", { name: "Curve output" });
    fireEvent.change(output, { target: { value: "200" } });
    fireEvent.blur(output);
    expect(output).toHaveValue(200);
    fireEvent.keyDown(screen.getByRole("application"), { key: "ArrowDown", shiftKey: true });
    expect(output).toHaveValue(190);
    fireEvent.click(screen.getByRole("button", { name: "Remove point" }));
    expect(screen.getAllByRole("button", { name: /Point \d/ })).toHaveLength(2);
    fireEvent.keyDown(screen.getByRole("application"), { key: "Delete" });
    expect(screen.getAllByRole("button", { name: /Point \d/ })).toHaveLength(2);
  });
  it("retains an invalid endpoint edit and explicitly restores identity", () => {
    render(<Harness />);
    const output = screen.getByRole("spinbutton", { name: "Curve output" });
    fireEvent.change(output, { target: { value: "300" } });
    fireEvent.blur(output);
    expect(output).toHaveAttribute("aria-invalid", "true");
    fireEvent.keyDown(output, { key: "Escape" });
    expect(output).toHaveValue(0);
    fireEvent.change(output, { target: { value: "30" } });
    fireEvent.blur(output);
    expect(output).toHaveValue(30);
    fireEvent.click(screen.getByRole("button", { name: "Reset curve" }));
    expect(output).toHaveValue(0);
  });
});
