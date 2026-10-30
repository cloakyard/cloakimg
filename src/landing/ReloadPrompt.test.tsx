import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RegisterSWOptions } from "virtual:pwa-register/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ReloadPrompt } from "./ReloadPrompt";
const pwa = vi.hoisted(() => ({
  useRegisterSW: vi.fn(),
  setNeedRefresh: vi.fn(),
  setOfflineReady: vi.fn(),
  updateServiceWorker: vi.fn(),
}));
vi.mock("virtual:pwa-register/react", () => ({ useRegisterSW: pwa.useRegisterSW }));
function setup({ needRefresh = false, offlineReady = false, deferUpdate = false } = {}) {
  pwa.useRegisterSW.mockReturnValue({
    needRefresh: [needRefresh, pwa.setNeedRefresh],
    offlineReady: [offlineReady, pwa.setOfflineReady],
    updateServiceWorker: pwa.updateServiceWorker,
  });
  return render(<ReloadPrompt deferUpdate={deferUpdate} />);
}
describe("ReloadPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pwa.updateServiceWorker.mockResolvedValue(undefined);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  it("stays hidden until the worker reports a user-facing state", () => {
    setup();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("announces honest caching and pauses dismissal for pointer and focus", () => {
    vi.useFakeTimers();
    setup({ offlineReady: true });
    const notice = screen.getByRole("region");
    expect(notice).toHaveTextContent("Core app cached");
    expect(notice).toHaveTextContent("Some features may still need a connection");
    fireEvent.pointerEnter(notice);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(pwa.setOfflineReady).not.toHaveBeenCalled();
    fireEvent.pointerLeave(notice);
    fireEvent.focus(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(pwa.setOfflineReady).not.toHaveBeenCalled();
    fireEvent.blur(screen.getByRole("button"));
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(pwa.setOfflineReady).toHaveBeenCalledWith(false);
  });
  it("guards repeat updates, retains focusability and hides decorative icons", () => {
    vi.useFakeTimers();
    setup({ needRefresh: true });
    const update = screen.getByRole("button", { name: "Update and reload" });
    fireEvent.click(update);
    fireEvent.click(update);
    expect(pwa.updateServiceWorker).toHaveBeenCalledTimes(1);
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(update).toHaveAttribute("aria-disabled", "true");
    expect(update).toHaveTextContent("Updating…");
    for (const svg of screen.getByRole("region").querySelectorAll("svg"))
      expect(svg).toHaveAttribute("aria-hidden", "true");
  });
  it("retains work and offers retry after activation failure", async () => {
    vi.useFakeTimers();
    pwa.updateServiceWorker.mockRejectedValueOnce(new Error("offline"));
    setup({ needRefresh: true });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Update and reload" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Your work is still here");
    const retry = screen.getByRole("button", { name: "Try again" });
    expect(retry).not.toBeDisabled();
    fireEvent.click(retry);
    expect(pwa.updateServiceWorker).toHaveBeenCalledTimes(2);
  });
  it("defers activation while editing and ignores another tab's activation", () => {
    setup({ needRefresh: true, deferUpdate: true });
    const update = screen.getByRole("button", { name: "Update and reload" });
    fireEvent.click(update);
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
    expect(screen.getByRole("region")).toHaveTextContent("return home to update");
    const options = pwa.useRegisterSW.mock.calls[0]?.[0] as RegisterSWOptions;
    act(() => options.onNeedReload?.());
    expect(pwa.setNeedRefresh).toHaveBeenCalledWith(true);
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();
  });
  it("keeps a pending update available after Later and returning from an editor", () => {
    const view = setup({ needRefresh: true });
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(pwa.setNeedRefresh).not.toHaveBeenCalled();
    view.rerender(<ReloadPrompt deferUpdate />);
    view.rerender(<ReloadPrompt />);
    expect(screen.getByRole("button", { name: "Update and reload" })).toBeInTheDocument();
  });
  it("checks for a deployed worker on foreground, throttled to once a minute", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));
    const update = vi.fn().mockResolvedValue(undefined);
    setup();
    const options = pwa.useRegisterSW.mock.calls[0]?.[0] as RegisterSWOptions;
    act(() =>
      options.onRegisteredSW?.("/sw.js", {
        installing: null,
        update,
      } as unknown as ServiceWorkerRegistration),
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    window.dispatchEvent(new Event("focus"));
    expect(fetch).toHaveBeenCalledWith("/sw.js", { cache: "no-store" });
    expect(update).toHaveBeenCalledTimes(1);
    fetch.mockRestore();
  });
});
