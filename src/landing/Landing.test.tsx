import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { Landing } from "./Landing";

// Actual motion and replay run in the production browser gate.
vi.mock("../../docs/air/artwork.mjs", () => ({
  mountAirArtwork: () => ({ destroy() {} }),
}));

describe("Landing", () => {
  it("renders the photo entry, local-processing facts and the Cloakyard-family mark", () => {
    render(<Landing onStart={() => undefined} />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Your photos. Your way.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse files" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Your photos stay on your device." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("CloakIMG home").querySelector("img")).toHaveAttribute(
      "src",
      "/cloakimg-mark.svg",
    );
    expect(screen.queryByLabelText("Product context")).not.toBeInTheDocument();
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
