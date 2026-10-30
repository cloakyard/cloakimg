import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { deviceOrder } from "./shared";
afterEach(() => vi.unstubAllGlobals());
describe("AI device selection", () => {
  it.each([
    undefined,
    { requestAdapter: async () => null },
    {
      requestAdapter: async () => {
        throw new Error("GPU unavailable");
      },
    },
  ])("starts with WASM when a GPU adapter is unavailable", async (gpu) => {
    vi.stubGlobal("navigator", { gpu });
    expect(await deviceOrder("auto")).toEqual(["wasm"]);
  });
  it("keeps GPU preference when an adapter exists", async () => {
    vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({}) } });
    expect(await deviceOrder("auto")).toEqual(["webgpu", "wasm"]);
  });
  it("does not probe a GPU for the explicit iOS WASM path", async () => {
    const requestAdapter = vi.fn();
    vi.stubGlobal("navigator", { gpu: { requestAdapter } });
    expect(await deviceOrder("wasm")).toEqual(["wasm"]);
    expect(requestAdapter).not.toHaveBeenCalled();
  });
});
