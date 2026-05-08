// preferredQuality tests — the resume-across-sessions path.
//
// `resolvePreferredQuality` is what makes the editor boot into "the
// model the user already has on disk" instead of always defaulting to
// Fast. The previous version of this module shipped two regressions
// the tests below would have caught:
//   • A quota exception on save threw instead of swallowing
//     (private-mode users broke editor startup).
//   • A stale localStorage entry that no longer matched a cached model
//     was returned anyway (re-prompted users for a download they had
//     already paid for in a prior session).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isModelCached } = vi.hoisted(() => ({
  isModelCached: vi.fn<(q: string) => Promise<boolean>>(),
}));

vi.mock("./segment", () => ({ isModelCached }));

import { QUALITY_KEYS } from "./bgModels";
import { indexFor, resolvePreferredQuality, savePreferredQuality } from "./preferredQuality";

const KEY = "cloakimg:bgQuality";

beforeEach(() => {
  isModelCached.mockReset();
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("preferredQuality — savePreferredQuality", () => {
  it("persists each tier id under the canonical localStorage key", () => {
    for (const q of QUALITY_KEYS) {
      savePreferredQuality(q);
      expect(localStorage.getItem(KEY)).toBe(q);
    }
  });

  it("swallows storage failures (private-mode users keep editing)", () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => savePreferredQuality("medium")).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe("preferredQuality — resolvePreferredQuality (resume scenarios)", () => {
  it("returns null on a first-ever visit (no preference, no cache)", async () => {
    isModelCached.mockResolvedValue(false);
    expect(await resolvePreferredQuality()).toBeNull();
  });

  // Drive the resume path for every tier the family ships.
  for (const q of QUALITY_KEYS) {
    it(`returns ${q} when the user previously accepted ${q} and bytes are still on disk`, async () => {
      savePreferredQuality(q);
      isModelCached.mockImplementation(async (asked: string) => asked === q);
      expect(await resolvePreferredQuality()).toBe(q);
    });
  }

  it("falls back when the stored preference's bytes have been evicted", async () => {
    // User accepted "large" once, but the browser cache cleared. They
    // still have the "small" tier from an even earlier session.
    savePreferredQuality("large");
    isModelCached.mockImplementation(async (q: string) => q === "small");
    expect(await resolvePreferredQuality()).toBe("small");
  });

  it("walks largest → smallest when no stored preference exists (legacy users)", async () => {
    isModelCached.mockImplementation(async (q: string) => q !== "large");
    expect(await resolvePreferredQuality()).toBe("medium");
  });

  it("ignores a stored value that doesn't map to a known tier (post-migration safety)", async () => {
    localStorage.setItem(KEY, "ultra"); // imagined future tier we haven't shipped yet
    isModelCached.mockResolvedValue(false);
    expect(await resolvePreferredQuality()).toBeNull();
  });

  it("survives a localStorage read that throws", async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("denied");
    };
    try {
      isModelCached.mockResolvedValue(false);
      expect(await resolvePreferredQuality()).toBeNull();
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

describe("preferredQuality — indexFor (toolState bgQuality is an index)", () => {
  it("agrees with QUALITY_KEYS' position", () => {
    QUALITY_KEYS.forEach((q, i) => {
      expect(indexFor(q)).toBe(i);
    });
  });
});
