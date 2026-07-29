// Vitest setup — registered via vite.config.ts test.setupFiles.
// Jsdom provides DOM, Storage, fetch, but not CacheStorage or Worker.
// We stub them as no-op shells; individual tests override with vi.mock
// or explicit globals when they need a richer fake.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Auto-tear-down rendered components between tests so a stray modal
// from one case can't leak into the next case's getByText queries.
afterEach(() => {
  cleanup();
});

// Jsdom's HTMLCanvasElement.getContext returns null but emits a
// "Not implemented" error on every call. The general suite doesn't
// need real canvas pixels; focused rendering tests install their own
// context fakes. Install these immediately because some editor
// modules probe canvas support during import, before test hooks run.
Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(() => null),
});
Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
  configurable: true,
  value: vi.fn((callback: BlobCallback) => callback(null)),
});

// CacheStorage stub. Tests that need it (cache.test.ts) replace this
// with a fake bucket via Object.defineProperty(globalThis, "caches", …).
if (typeof globalThis.caches === "undefined") {
  Object.defineProperty(globalThis, "caches", {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

// Some module-level singletons (subjectMask, runtime) keep state across
// imports. Clear listeners + reset module state between tests so a
// failure in one test doesn't bleed into the next.
afterEach(() => {
  vi.useRealTimers();
});
