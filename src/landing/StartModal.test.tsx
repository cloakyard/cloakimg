import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { StartModal } from "./StartModal";

describe("new canvas keyboard actions", () => {
  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "does not create a canvas while an input method confirms text (%j)",
    (composition) => {
      const onConfirm = vi.fn();
      render(
        <StartModal initialTab="blank" isPhone={false} onCancel={() => {}} onConfirm={onConfirm} />,
      );
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter", ...composition });
      expect(onConfirm).not.toHaveBeenCalled();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
      expect(onConfirm).toHaveBeenCalledTimes(1);
    },
  );

  it("leaves Enter on Cancel to the native button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <StartModal initialTab="blank" isPhone={false} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    await user.tab();
    screen.getByRole("button", { name: "Cancel" }).focus();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();
    // A separate mount avoids reusing a closing dialog after its Cancel action.
  });

  it("creates exactly one canvas through keyboard activation of Create", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <StartModal initialTab="blank" isPhone={false} onCancel={() => {}} onConfirm={onConfirm} />,
    );
    await user.tab();
    screen.getByRole("button", { name: "Create canvas" }).focus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
