import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EmojiPanel } from "./EmojiPanel";

const patchTool = vi.hoisted(() => vi.fn());
vi.mock("../EditorContext", () => ({
  useEditor: () => ({ toolState: { emojiChar: "🙂" }, patchTool }),
}));

describe("custom emoji input", () => {
  beforeEach(() => patchTool.mockClear());

  it.each([{ isComposing: true }, { keyCode: 229 }])(
    "preserves a composed emoji until a separate Enter (%j)",
    (composition) => {
      render(<EmojiPanel />);
      const input = screen.getByRole("textbox", { name: "Paste any emoji" });
      fireEvent.change(input, { target: { value: "👩🏽‍💻" } });
      fireEvent.keyDown(input, { key: "Enter", ...composition });
      expect(patchTool).not.toHaveBeenCalled();
      expect(input).toHaveValue("👩🏽‍💻");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(patchTool).toHaveBeenCalledExactlyOnceWith("emojiChar", "👩🏽‍💻");
      expect(input).toHaveValue("");
    },
  );

  it("retains the explicit Use action for touch input", () => {
    render(<EmojiPanel />);
    fireEvent.change(screen.getByRole("textbox", { name: "Paste any emoji" }), {
      target: { value: "🇮🇳" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use" }));
    expect(patchTool).toHaveBeenCalledExactlyOnceWith("emojiChar", "🇮🇳");
  });
});
