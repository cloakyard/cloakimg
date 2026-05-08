// Vitest setup — registered via vite.config.ts test.setupFiles.
// Jsdom provides DOM, Storage, fetch, but not CacheStorage or Worker.
// We stub them as no-op shells; individual tests override with vi.mock
// or explicit globals when they need a richer fake.

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";

// Auto-tear-down rendered components between tests so a stray dialog
// from one case can't leak into the next case's getByText queries.
afterEach(() => {
  cleanup();
});

// Jsdom's HTMLCanvasElement.getContext is a no-op (returns null) and
// emits a "Not implemented" warning on every call. Our tests don't
// need real canvas pixels — the AI module's `hasOpaqueContent` falls
// back to "assume valid" when getContext returns null, which is the
// path we're exercising. Silence the warning so the test log stays
// readable. This stub is install-once per process.
beforeAll(() => {
  const realError = console.error;
  console.error = (...args: unknown[]) => {
    const first = args[0];
    const msg = typeof first === "string" ? first : first instanceof Error ? first.message : "";
    if (msg.includes("HTMLCanvasElement.prototype.getContext")) return;
    realError(...args);
  };
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
