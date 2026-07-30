import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrientationLock } from "./OrientationLock";

const originalMatchMedia = window.matchMedia;
const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function Harness() {
  return (
    <>
      <main data-testid="app-content">
        <button type="button">Editor action</button>
      </main>
      <OrientationLock />
    </>
  );
}

describe("OrientationLock", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    setViewport(653, 280);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    setViewport(originalWidth, originalHeight);
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";
    document.body.style.overscrollBehavior = "";
  });

  it("isolates the app while a narrow coarse-pointer phone is in landscape", () => {
    render(<Harness />);

    const dialog = screen.getByRole("dialog", { name: "Rotate your device" });
    const app = screen.getByTestId("app-content");
    expect(dialog).toHaveFocus();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(app.inert).toBe(true);
    expect(app).toHaveAttribute("aria-hidden", "true");
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overscrollBehavior).toBe("contain");
  });

  it("restores interaction and scrolling after the phone returns to portrait", () => {
    render(<Harness />);
    const app = screen.getByTestId("app-content");

    act(() => {
      setViewport(280, 653);
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.queryByRole("dialog", { name: "Rotate your device" })).not.toBeInTheDocument();
    expect(app.inert).not.toBe(true);
    expect(app).not.toHaveAttribute("aria-hidden");
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
