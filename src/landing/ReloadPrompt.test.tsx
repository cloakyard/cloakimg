import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RegisterSWOptions } from "virtual:pwa-register/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReloadPrompt } from "./ReloadPrompt";

const pwa = vi.hoisted(() => ({
  useRegisterSW: vi.fn(),
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(),
}));

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: pwa.useRegisterSW,
}));

function renderPrompt({
  needRefresh = false,
  offlineReady = false,
}: {
  needRefresh?: boolean;
  offlineReady?: boolean;
} = {}) {
  pwa.useRegisterSW.mockReturnValue({
    needRefresh: [needRefresh, pwa.setNeedRefresh],
    offlineReady: [offlineReady, pwa.setOfflineReady],
    updateServiceWorker: pwa.updateServiceWorker,
  });
  return render(<ReloadPrompt />);
}

describe("ReloadPrompt", () => {
  beforeEach(() => {
    pwa.useRegisterSW.mockReset();
    pwa.setNeedRefresh.mockReset();
    pwa.setOfflineReady.mockReset();
    pwa.updateServiceWorker.mockReset();
    pwa.updateServiceWorker.mockResolvedValue(undefined);
  });

  it("stays hidden until the service worker reports a user-facing state", () => {
    renderPrompt();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("announces an honest offline-ready state and pauses dismissal during interaction", () => {
    vi.useFakeTimers();
    renderPrompt({ offlineReady: true });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Core editor cached. The editor interface is available offline.",
    );

    const prompt = screen
      .getByTestId("pwa-toast-positioner")
      .querySelector("[data-state='offline']");
    expect(prompt).not.toBeNull();
    expect(prompt).toHaveTextContent("AI models and some formats may still need a connection.");
    fireEvent.pointerEnter(prompt!);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(pwa.setOfflineReady).not.toHaveBeenCalled();

    fireEvent.pointerLeave(prompt!);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(pwa.setOfflineReady).toHaveBeenCalledWith(false);
    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(false);
  });

  it("exposes a guarded update action and hides decorative icons", () => {
    vi.useFakeTimers();
    renderPrompt({ needRefresh: true });

    const positioner = screen.getByTestId("pwa-toast-positioner");
    expect(positioner).toHaveClass("pointer-events-none");
    expect(positioner.className).toContain("safe-area-inset-bottom");
    expect(positioner.className).toContain("--z-toast");

    const update = screen.getByRole("button", { name: "Update" });
    fireEvent.click(update);

    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(update).toBeDisabled();
    expect(update).toHaveAttribute("aria-busy", "true");
    expect(update).toHaveTextContent("Updating…");

    for (const icon of positioner.querySelectorAll("svg")) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("checks for a deployed service worker again when the app returns to the foreground", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const update = vi.fn().mockResolvedValue(undefined);
    renderPrompt();

    const options = pwa.useRegisterSW.mock.calls[0]?.[0] as RegisterSWOptions;
    act(() => {
      options.onRegisteredSW?.("/sw.js", {
        installing: null,
        update,
      } as unknown as ServiceWorkerRegistration);
    });

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith("/sw.js", { cache: "no-store" });
    expect(update).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});
