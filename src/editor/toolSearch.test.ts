import { describe, expect, it } from "vitest";
import { searchEditorTools } from "./toolSearch";
import { toolsForTab } from "./tools";

describe("searchEditorTools", () => {
  it("returns the supplied roster unchanged for an empty query", () => {
    const mobileTools = toolsForTab(null);
    expect(searchEditorTools("  ", mobileTools)).toEqual(mobileTools);
  });

  it("matches names, families, aliases, and multiple tokens", () => {
    expect(searchEditorTools("portrait").map((tool) => tool.id)).toEqual(["bgblur"]);
    expect(searchEditorTools("privacy").map((tool) => tool.id)).toEqual(["redact"]);
    expect(searchEditorTools("transparent background").map((tool) => tool.id)).toEqual(["bgrm"]);
    expect(searchEditorTools("passport visa").map((tool) => tool.id)).toEqual(["idphoto"]);
  });

  it("supports British and American color terminology", () => {
    expect(searchEditorTools("colour").map((tool) => tool.id)).toEqual(["hsl"]);
    expect(searchEditorTools("color picker").map((tool) => tool.id)).toEqual(["color"]);
  });
});
