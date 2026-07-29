import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ALL_TOOLS } from "../editor/tools";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("renders the workbench identity, honest product facts, and the Cloakyard-family mark", () => {
    render(<Landing onStart={() => undefined} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A complete photo workbench. Your pixels stay put.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(String(ALL_TOOLS.length))).toBeInTheDocument();
    expect(screen.getByText("Editor tools")).toBeInTheDocument();
    expect(screen.getByText("Image uploads")).toBeInTheDocument();
    expect(screen.getByLabelText("CloakIMG home").querySelector("img")).toHaveAttribute(
      "src",
      "/cloakimg-mark.svg",
    );
    expect(screen.getByLabelText("Product context")).toHaveTextContent(
      "Photo workbenchLocal-first",
    );
  });

  it("opens the shared project dialog and reports intent before starting", () => {
    const onIntent = vi.fn();
    render(<Landing onStart={() => undefined} onIntent={onIntent} />);

    fireEvent.click(screen.getByRole("button", { name: "Open editor" }));

    expect(onIntent).toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Start a new project" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByText("Files never leave your browser")).toBeInTheDocument();
  });
});
