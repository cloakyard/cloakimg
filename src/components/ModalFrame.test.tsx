import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, it, expect, vi } from "vite-plus/test";
import { ModalFrame, ModalCloseButton } from "./ModalFrame";
import { SelectControl } from "../editor/SelectControl";
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Launch dialog</button>
      <button>Background command</button>
      {open && (
        <ModalFrame instant onClose={() => setOpen(false)} labelledBy="test-title">
          <h2 id="test-title">Test dialog</h2>
          <SelectControl aria-label="Choice" defaultValue="a" displayValue="A">
            <option value="a">A</option>
            <option value="b">B</option>
          </SelectControl>
          <ModalCloseButton onClose={() => setOpen(false)} />
        </ModalFrame>
      )}
    </>
  );
}
describe("ModalFrame", () => {
  it("names and isolates the modal, then restores focus on keyboard dismissal", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const launch = screen.getByRole("button", { name: "Launch dialog" });
    await user.click(launch);
    const dialog = screen.getByRole("dialog", { name: "Test dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Background command" })).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(launch).toHaveFocus());
  });
  it("dismisses a nested picker before its containing dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Launch dialog" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    await user.click(screen.getByRole("combobox", { name: "Choice" }));
    await screen.findByRole("listbox");
    await waitFor(() => expect(screen.getByRole("option", { name: "A" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("ignores backdrop presses when dismissal is protected", async () => {
    const onClose = vi.fn();
    render(
      <ModalFrame instant dismissOnBackdrop={false} onClose={onClose} labelledBy="safe-title">
        <h2 id="safe-title">Confirm removal</h2>
        <ModalCloseButton onClose={onClose} />
      </ModalFrame>,
    );
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
    fireEvent.pointerDown(document.querySelector(".cloak-modal-root")!);
    fireEvent.click(document.querySelector(".cloak-modal-root")!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
