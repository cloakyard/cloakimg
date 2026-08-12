import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectControl } from "./SelectControl";
import { SelectControlPreview } from "./SelectControl.preview";

function ControlledSelect() {
  const [value, setValue] = useState("india-visa");
  const labels: Record<string, string> = {
    "india-visa": "India · Visa",
    "uk-passport": "United Kingdom · Passport",
    "us-visa": "United States · Visa",
  };
  return (
    <SelectControl
      aria-label="Photo standard"
      value={value}
      displayValue={labels[value]}
      detail="51 × 51 mm"
      onChange={(event) => setValue(event.currentTarget.value)}
    >
      <optgroup label="Passport">
        <option value="uk-passport">United Kingdom · Passport · 35 × 45 mm</option>
      </optgroup>
      <optgroup label="Visa">
        <option value="india-visa">India · Visa · 51 × 51 mm</option>
        <option value="us-visa">United States · Visa · 51 × 51 mm</option>
      </optgroup>
    </SelectControl>
  );
}

describe("SelectControl", () => {
  it("keeps a native form control while exposing the branded trigger", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SelectControl
        aria-label="Photo standard"
        value="india-visa"
        displayValue="India · Visa"
        detail="51 × 51 mm · Browser match: India"
        onChange={onChange}
      >
        <option value="us-visa">United States · Visa</option>
        <option value="india-visa">India · Visa</option>
      </SelectControl>,
    );

    const trigger = screen.getByRole("combobox", { name: "Photo standard" });
    const native = container.querySelector<HTMLSelectElement>(".select-control__native");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(native).toHaveValue("india-visa");
    expect(native).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".select-control__value")).toHaveTextContent("India · Visa");
    expect(container.querySelector(".select-control__detail")).toHaveTextContent(
      "Browser match: India",
    );

    fireEvent.change(native!, { target: { value: "us-visa" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("renders grouped, styled list items and commits pointer selection through onChange", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);

    const trigger = screen.getByRole("combobox", { name: "Photo standard" });
    await user.click(trigger);

    const listbox = screen.getByRole("listbox", { name: "Photo standard options" });
    expect(listbox).toHaveAttribute("data-animate", "true");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(listbox).getAllByRole("group")).toHaveLength(2);
    expect(within(listbox).getAllByRole("option")).toHaveLength(3);
    expect(
      within(listbox).getByRole("option", { name: "India · Visa · 51 × 51 mm" }),
    ).toHaveAttribute("aria-selected", "true");

    await user.click(
      within(listbox).getByRole("option", { name: "United States · Visa · 51 × 51 mm" }),
    );
    expect(trigger).toHaveTextContent("United States · Visa");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("accepts options wrapped in a fragment", async () => {
    const user = userEvent.setup();
    render(
      <SelectControl aria-label="Paper size" defaultValue="a4" displayValue="A4">
        <>
          <option value="a4">A4 · 210 × 297 mm</option>
          <option value="letter">US Letter · 8.5 × 11 in</option>
        </>
      </SelectControl>,
    );

    await user.click(screen.getByRole("combobox", { name: "Paper size" }));
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("supports arrow, Home, End, Enter, Escape, and typeahead keyboard behavior", async () => {
    const user = userEvent.setup();
    render(<ControlledSelect />);

    const trigger = screen.getByRole("combobox", { name: "Photo standard" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(trigger).toHaveTextContent("United States · Visa");

    await user.keyboard("{Home}{Enter}");
    expect(trigger).toHaveTextContent("United Kingdom · Passport");

    await user.keyboard("i");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Photo standard options" })).toHaveAttribute(
      "data-animate",
      "false",
    );
    expect(trigger.getAttribute("aria-activedescendant")).toContain("option-1");
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();

    await user.keyboard("{End}{Enter}");
    expect(trigger).toHaveTextContent("United States · Visa");
  });

  it("light-dismisses without changing the current value", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ControlledSelect />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole("combobox", { name: "Photo standard" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveTextContent("India · Visa");
  });

  it("contains Escape so closing the menu does not dismiss its parent sheet", async () => {
    const user = userEvent.setup();
    const onParentEscape = vi.fn();
    render(
      <div
        onKeyDown={(event) => {
          if (event.key === "Escape") onParentEscape();
        }}
      >
        <ControlledSelect />
      </div>,
    );

    const trigger = screen.getByRole("combobox", { name: "Photo standard" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(onParentEscape).not.toHaveBeenCalled();
  });

  it("exposes loading, error, success, and disabled semantics on the trigger and native select", () => {
    const { container, rerender } = render(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" state="loading">
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    const trigger = screen.getByRole("combobox", { name: "Format" });
    const native = container.querySelector<HTMLSelectElement>(".select-control__native")!;
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute("aria-busy", "true");
    expect(native).toBeDisabled();

    rerender(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" state="error">
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveAttribute("aria-invalid", "true");

    rerender(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" state="success">
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    expect(trigger).not.toHaveAttribute("aria-invalid");

    rerender(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" disabled>
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    expect(trigger).toBeDisabled();
    expect(native).toBeDisabled();
  });

  it("keeps the complete eight-state visual fixture inspectable", () => {
    render(<SelectControlPreview />);
    const preview = screen.getByRole("region", { name: "Select control eight-state preview" });
    for (const label of [
      "Default",
      "Hover",
      "Focus",
      "Active",
      "Disabled",
      "Loading",
      "Error",
      "Success",
    ]) {
      expect(within(preview).getByText(label)).toBeInTheDocument();
    }
    expect(within(preview).getAllByRole("combobox")).toHaveLength(8);
  });
});
