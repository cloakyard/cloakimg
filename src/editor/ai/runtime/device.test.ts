// Tests for the AI backend-hint picker. The whole point is that iOS
// (where WebKit's WebGPU / GPU delegate can hard-crash the tab) is pinned
// to "wasm", while every other platform stays on "auto" (webgpu →
// wasm fallback). UA strings below are real samples.

import { afterEach, describe, expect, it, vi } from "vitest";
import { isIOS, preferredAiDevice } from "./device";

function stubNavigator(userAgent: string, maxTouchPoints = 0) {
  vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isIOS", () => {
  it("detects iPhone", () => {
    stubNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      5,
    );
    expect(isIOS()).toBe(true);
  });

  it("detects classic iPad UA", () => {
    stubNavigator(
      "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      5,
    );
    expect(isIOS()).toBe(true);
  });

  it("detects iPadOS in desktop mode (Macintosh UA + touch points)", () => {
    stubNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      5,
    );
    expect(isIOS()).toBe(true);
  });

  it("is false for a real Mac (Macintosh UA, no touch)", () => {
    stubNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      0,
    );
    expect(isIOS()).toBe(false);
  });

  it("is false for Windows Chrome", () => {
    stubNavigator(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      0,
    );
    expect(isIOS()).toBe(false);
  });
});

describe("preferredAiDevice", () => {
  it("pins iOS to wasm", () => {
    stubNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      5,
    );
    expect(preferredAiDevice()).toBe("wasm");
  });

  it("uses auto on desktop", () => {
    stubNavigator(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      0,
    );
    expect(preferredAiDevice()).toBe("auto");
  });
});
