// Tests for the apply-on-tool-switch hook.
//
// Eight panels register their bake into the EditorContext's pending-
// apply slot via this hook. A regression here would mean every preview
// tool (Adjust / Filter / Levels / HSL / BgBlur / Border / Frame /
// Crop) silently drops mid-edit changes when the user switches tools
// or hits Export. Pin the contract:
//
//   • register on mount when `enabled` (default true)
//   • clear when `enabled` flips false
//   • re-register when `enabled` flips back true
//   • the registered callback always invokes the LATEST `apply`
//     reference (the hook's stale-closure escape hatch)
//   • cleanup on unmount

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  return {
    pending: null as null | (() => void | Promise<void>),
    register: ((fn: null | (() => void | Promise<void>)) => {
      harness.pending = fn;
    }) as (fn: null | (() => void | Promise<void>)) => void,
  };
});

vi.mock("./EditorContext", () => ({
  useEditorActions: () => ({
    registerPendingApply: harness.register,
  }),
}));

import { useApplyOnToolSwitch } from "./useApplyOnToolSwitch";

beforeEach(() => {
  harness.pending = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function Probe({
  apply,
  enabled = true,
}: {
  apply: () => void | Promise<void>;
  enabled?: boolean;
}) {
  useApplyOnToolSwitch(apply, enabled);
  return null;
}

describe("useApplyOnToolSwitch", () => {
  it("registers the apply callback on mount when enabled is true (default)", () => {
    const apply = vi.fn();
    render(<Probe apply={apply} />);
    expect(harness.pending).not.toBeNull();
  });

  it("the registered callback invokes the live apply when fired", () => {
    const apply = vi.fn();
    render(<Probe apply={apply} />);
    void harness.pending?.();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("does NOT register when enabled is false (panel is pristine)", () => {
    render(<Probe apply={() => undefined} enabled={false} />);
    expect(harness.pending).toBeNull();
  });

  it("registers when enabled flips from false to true (user just dirtied the panel)", () => {
    const apply = vi.fn();
    const { rerender } = render(<Probe apply={apply} enabled={false} />);
    expect(harness.pending).toBeNull();
    rerender(<Probe apply={apply} enabled={true} />);
    expect(harness.pending).not.toBeNull();
  });

  it("clears the slot when enabled flips from true to false (user undid back to clean)", () => {
    const apply = vi.fn();
    const { rerender } = render(<Probe apply={apply} enabled={true} />);
    expect(harness.pending).not.toBeNull();
    rerender(<Probe apply={apply} enabled={false} />);
    expect(harness.pending).toBeNull();
  });

  it("the registered callback always invokes the LATEST apply (stale-closure escape hatch)", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Probe apply={first} />);
    rerender(<Probe apply={second} />);
    // The slot was registered ONCE on mount, but the ref inside the
    // hook has captured the latest apply on each render.
    void harness.pending?.();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("clears the slot on unmount", () => {
    const { unmount } = render(<Probe apply={() => undefined} />);
    expect(harness.pending).not.toBeNull();
    unmount();
    expect(harness.pending).toBeNull();
  });

  it("does not re-register on every render at slider-tick rate (perf guard)", () => {
    const registerSpy = vi.fn(harness.register);
    harness.register = registerSpy;
    const { rerender } = render(<Probe apply={() => undefined} />);
    const initialCalls = registerSpy.mock.calls.length;
    // Simulate 10 slider-tick re-renders with the same enabled flag.
    for (let i = 0; i < 10; i++) rerender(<Probe apply={() => undefined} enabled={true} />);
    // Register should NOT have been called per-render — only on the
    // initial mount. The applyRef catches the new closure each time
    // without going through the EditorContext slot.
    expect(registerSpy.mock.calls.length).toBe(initialCalls);
  });

  it("supports an async apply (returns a promise) without changing the contract", async () => {
    const work: { resolve?: () => void } = {};
    const apply = vi.fn(
      () =>
        new Promise<void>((r) => {
          work.resolve = r;
        }),
    );
    render(<Probe apply={apply} />);
    let p: void | Promise<void> | undefined;
    act(() => {
      p = harness.pending?.();
    });
    expect(apply).toHaveBeenCalled();
    work.resolve?.();
    await p;
  });
});
