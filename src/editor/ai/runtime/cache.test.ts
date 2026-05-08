// CacheStorage probe tests.
//
// `isHfModelCached` is what tells the consent dialog "the bytes are
// already on disk — skip the download prompt and go straight to
// detection." Bug here = users get re-prompted to download a model
// they already have, OR worse, we silently skip a real download
// because of a false positive. The test fakes CacheStorage with a
// scriptable bucket of URLs so we can drive every branch.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isHfModelCached } from "./cache";
import { ACTIVE_FAMILY, QUALITY_KEYS } from "./bgModels";

interface FakeCache {
  keys(): Promise<Request[]>;
}

function fakeCacheStorage(buckets: Record<string, string[]>) {
  const open = (name: string): FakeCache => ({
    keys: async () => (buckets[name] ?? []).map((url) => new Request(url)),
  });
  return {
    keys: async () => Object.keys(buckets),
    open: async (name: string) => open(name),
    has: async () => false,
    delete: async () => false,
    match: async () => undefined,
  } as unknown as CacheStorage;
}

const originalCaches = globalThis.caches;

afterEach(() => {
  Object.defineProperty(globalThis, "caches", {
    value: originalCaches,
    writable: true,
    configurable: true,
  });
});

describe("cache — isHfModelCached (degraded environments)", () => {
  it("returns false when CacheStorage isn't available (e.g. file://)", async () => {
    Object.defineProperty(globalThis, "caches", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    expect(await isHfModelCached("repo/x", "fp16")).toBe(false);
  });

  it("returns false when CacheStorage throws (private mode, security policy)", async () => {
    Object.defineProperty(globalThis, "caches", {
      value: {
        keys: () => Promise.reject(new Error("denied by browser")),
      },
      writable: true,
      configurable: true,
    });
    expect(await isHfModelCached("repo/x", "fp16")).toBe(false);
  });

  it("ignores non-transformers buckets (workbox runtime, fonts, etc.)", async () => {
    Object.defineProperty(globalThis, "caches", {
      value: fakeCacheStorage({
        "workbox-runtime": [
          "https://huggingface.co/onnx-community/ISNet-ONNX/onnx/model_fp16.onnx",
        ],
        "fonts-cache": ["https://fonts.gstatic.com/s/inter.woff2"],
      }),
      writable: true,
      configurable: true,
    });
    expect(await isHfModelCached("onnx-community/ISNet-ONNX", "fp16")).toBe(false);
  });
});

describe("cache — first-time vs resume per quality tier", () => {
  // Drives both scenarios for every tier the active family ships, so
  // adding a new tier doesn't quietly skip its cache-probe coverage.
  for (const id of QUALITY_KEYS) {
    const tier = ACTIVE_FAMILY.tiers.find((t) => t.id === id)!;

    it(`${id}: first-time visit → not cached → false`, async () => {
      Object.defineProperty(globalThis, "caches", {
        value: fakeCacheStorage({
          "transformers-cache": [],
        }),
        writable: true,
        configurable: true,
      });
      expect(await isHfModelCached(tier.repo, tier.dtype)).toBe(false);
    });

    it(`${id}: resume — bytes already on disk → true`, async () => {
      const filename = filenameFor(tier.dtype);
      Object.defineProperty(globalThis, "caches", {
        value: fakeCacheStorage({
          "transformers-cache": [
            `https://huggingface.co/${tier.repo}/resolve/main/onnx/${filename}`,
          ],
        }),
        writable: true,
        configurable: true,
      });
      expect(await isHfModelCached(tier.repo, tier.dtype)).toBe(true);
    });

    it(`${id}: resume from a v3 cache (legacy bucket name still honoured)`, async () => {
      const filename = filenameFor(tier.dtype);
      Object.defineProperty(globalThis, "caches", {
        value: fakeCacheStorage({
          "transformers-cache-v3": [
            `https://huggingface.co/${tier.repo}/resolve/main/onnx/${filename}`,
          ],
        }),
        writable: true,
        configurable: true,
      });
      expect(await isHfModelCached(tier.repo, tier.dtype)).toBe(true);
    });
  }
});

describe("cache — per-dtype isolation (downloading Better doesn't claim Best)", () => {
  beforeEach(() => {
    // Only the medium (fp16) file is on disk.
    const medium = ACTIVE_FAMILY.tiers.find((t) => t.id === "medium")!;
    Object.defineProperty(globalThis, "caches", {
      value: fakeCacheStorage({
        "transformers-cache": [
          `https://huggingface.co/${medium.repo}/resolve/main/onnx/${filenameFor(medium.dtype)}`,
        ],
      }),
      writable: true,
      configurable: true,
    });
  });

  it("medium probe → true", async () => {
    const tier = ACTIVE_FAMILY.tiers.find((t) => t.id === "medium")!;
    expect(await isHfModelCached(tier.repo, tier.dtype)).toBe(true);
  });

  it("small probe → false (different dtype filename)", async () => {
    const tier = ACTIVE_FAMILY.tiers.find((t) => t.id === "small")!;
    expect(await isHfModelCached(tier.repo, tier.dtype)).toBe(false);
  });

  it("large probe → false", async () => {
    const tier = ACTIVE_FAMILY.tiers.find((t) => t.id === "large")!;
    expect(await isHfModelCached(tier.repo, tier.dtype)).toBe(false);
  });
});

// Mirror of cache.ts:filenameForDtype — duplicated here intentionally so
// the test catches a typo in either copy of the table. If you add a new
// dtype, add it in both places.
function filenameFor(dtype: string): string {
  switch (dtype) {
    case "fp32":
      return "model.onnx";
    case "fp16":
      return "model_fp16.onnx";
    case "q8":
    case "int8":
      return "model_quantized.onnx";
    case "q4":
      return "model_q4.onnx";
    case "q4f16":
      return "model_q4f16.onnx";
    case "bnb4":
      return "model_bnb4.onnx";
    case "uint8":
      return "model_uint8.onnx";
    default:
      return `model_${dtype}.onnx`;
  }
}
