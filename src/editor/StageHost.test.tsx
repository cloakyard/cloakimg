import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { StageHost, StageProvider, useStageProps } from "./StageHost";

vi.mock("./ImageCanvas", () => ({
  ImageCanvas: ({
    fabricInteractive,
    cursor,
  }: {
    fabricInteractive?: boolean;
    cursor?: string;
  }) => <output data-testid="stage">{JSON.stringify({ fabricInteractive, cursor })}</output>,
}));
function OldTool() {
  useStageProps({ cursor: "grab", fabricInteractive: false });
  return null;
}
function NewTool() {
  useStageProps({ cursor: "crosshair", fabricInteractive: true });
  return null;
}
function Editor({ tool }: { tool: "old" | "new" | null }) {
  return (
    <StageProvider>
      <StageHost />
      {tool === "old" ? <OldTool /> : tool === "new" ? <NewTool /> : null}
    </StageProvider>
  );
}
describe("stage registration", () => {
  for (const strict of [false, true]) {
    it(`keeps the incoming tool interactive after outgoing cleanup (${strict ? "StrictMode" : "normal"})`, () => {
      const view = (tool: "old" | "new" | null) =>
        strict ? (
          <StrictMode>
            <Editor tool={tool} />
          </StrictMode>
        ) : (
          <Editor tool={tool} />
        );
      const { rerender } = render(view("old"));
      rerender(view("new"));
      expect(screen.getByTestId("stage")).toHaveTextContent('"fabricInteractive":true');
      expect(screen.getByTestId("stage")).toHaveTextContent('"cursor":"crosshair"');
      rerender(view(null));
      expect(screen.getByTestId("stage")).toHaveTextContent("{}");
    });
  }
});
