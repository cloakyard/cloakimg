import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(() => vi.restoreAllMocks());

it("keeps recovery focus inside the card and remounts the failed editor on retry", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  let broken = true;
  function Editor() {
    if (broken) throw new Error("Test editor failure");
    return <p>Recovered editor</p>;
  }
  render(
    <ErrorBoundary variant="card" secondaryAction={{ label: "Back to start" }}>
      <Editor />
    </ErrorBoundary>,
  );
  const user = userEvent.setup();
  const retry = screen.getByRole("button", { name: "Try again" });
  await waitFor(() => expect(retry).toHaveFocus());
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Back to start" })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByLabelText("Error details")).toHaveFocus();
  await user.tab({ shift: true });
  expect(retry).toHaveFocus();
  await user.tab();
  expect(screen.getByLabelText("Error details")).toHaveFocus();
  broken = false;
  await user.click(retry);
  expect(screen.getByText("Recovered editor")).toBeVisible();
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

it("uses the configured recovery action for Escape in the standalone modal", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const recover = vi.fn();
  function Broken(): never {
    throw new Error("Test app failure");
  }
  render(
    <ErrorBoundary primaryAction={{ label: "Recover", onClick: recover }}>
      <Broken />
    </ErrorBoundary>,
  );
  await waitFor(() => expect(screen.getByRole("button", { name: "Recover" })).toHaveFocus());
  await userEvent.setup().keyboard("{Escape}");
  expect(recover).toHaveBeenCalledOnce();
});
