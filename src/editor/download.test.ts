import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startBlobDownload } from "./download";

describe("startBlobDownload", () => {
  const createObjectURL = vi.fn(() => "blob:cloakimg-export");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("clicks a download anchor without opening a new tab or share surface", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    startBlobDownload(new Blob(["image"], { type: "image/webp" }), "edited.webp");

    expect(click).toHaveBeenCalledOnce();
    const clickedAnchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(clickedAnchor.download).toBe("edited.webp");
    expect(clickedAnchor.href).toBe("blob:cloakimg-export");
    expect(clickedAnchor.target).toBe("");
    expect(clickedAnchor.isConnected).toBe(false);
    expect(createObjectURL).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:cloakimg-export");
  });
});
