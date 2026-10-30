// Secondary mobile actions; Compare remains in the top bar and canvas gesture.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { MobileMoreMenu } from "./MobileMoreMenu";

// ModalFrame routes pointer close paths through a ~260ms exit budget
// so the sheet settles before unmount. Escape remains immediate.

const baseProps = {
  fileName: "photo.jpg",
  hasDoc: true,
  canReset: true,
  onShowFileProps: () => undefined,
  onReset: () => undefined,
  onClose: () => undefined,
};

describe("MobileMoreMenu", () => {
  it("renders File information and Reset all edits", () => {
    render(<MobileMoreMenu {...baseProps} />);
    expect(screen.getByText(/File information/i)).toBeInTheDocument();
    expect(screen.getByText(/Reset all edits/i)).toBeInTheDocument();
  });

  // Regression guard. If a future refactor re-adds compare to this
  // menu, the canvas pill stops being the single source of truth and
  // users get two competing affordances with different gesture models
  // (tap-toggle here vs press-and-hold on the pill).
  it("does NOT contain a 'Show original' / 'Hide original' entry — compare lives on the canvas now", () => {
    render(<MobileMoreMenu {...baseProps} />);
    expect(screen.queryByText(/Show original/i)).toBeNull();
    expect(screen.queryByText(/Hide original/i)).toBeNull();
  });

  it("File information shows the file name as a hint when a doc is loaded", () => {
    render(<MobileMoreMenu {...baseProps} fileName="vacation.heic" />);
    expect(screen.getByText("vacation.heic")).toBeInTheDocument();
  });

  it("File information shows 'No file loaded' when hasDoc is false", () => {
    render(<MobileMoreMenu {...baseProps} hasDoc={false} />);
    expect(screen.getByText(/No file loaded/i)).toBeInTheDocument();
  });

  it("File information button is disabled when hasDoc is false", () => {
    render(<MobileMoreMenu {...baseProps} hasDoc={false} />);
    expect(screen.getByRole("button", { name: /File information/i })).toBeDisabled();
  });

  it("Reset all edits button is disabled when canReset is false", () => {
    render(<MobileMoreMenu {...baseProps} canReset={false} />);
    expect(screen.getByRole("button", { name: /Reset all edits/i })).toBeDisabled();
  });

  it.each(["File information", "Reset all edits"])(
    "closes before handing off %s",
    async (label) => {
      const calls: string[] = [];
      render(
        <MobileMoreMenu
          {...baseProps}
          onClose={() => calls.push("close")}
          onShowFileProps={() => calls.push("info")}
          onReset={() => calls.push("reset")}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      await waitFor(() =>
        expect(calls).toEqual(["close", label === "File information" ? "info" : "reset"]),
      );
    },
  );
  it("Escape dismisses the focused menu", async () => {
    const onClose = vi.fn();
    render(<MobileMoreMenu {...baseProps} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    await waitFor(() => expect(dialog).toHaveFocus());
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
