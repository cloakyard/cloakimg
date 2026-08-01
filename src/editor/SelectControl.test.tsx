import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectControl } from "./SelectControl";

describe("SelectControl", () => {
  it("keeps a native labelled select under the branded value shell", () => {
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

    const select = screen.getByRole("combobox", { name: "Photo standard" });
    expect(select).toHaveValue("india-visa");
    expect(container.querySelector(".select-control__value")).toHaveTextContent("India · Visa");
    expect(container.querySelector(".select-control__detail")).toHaveTextContent(
      "Browser match: India",
    );

    fireEvent.change(select, { target: { value: "us-visa" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("exposes loading, error, success, and disabled states without replacing the select", () => {
    const { rerender } = render(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" state="loading">
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    const select = screen.getByRole("combobox", { name: "Format" });
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute("aria-busy", "true");

    rerender(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" state="error">
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    expect(select).not.toBeDisabled();
    expect(select).toHaveAttribute("aria-invalid", "true");

    rerender(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" state="success">
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    expect(select).not.toHaveAttribute("aria-invalid");

    rerender(
      <SelectControl aria-label="Format" value="jpg" displayValue="JPG" disabled>
        <option value="jpg">JPG</option>
      </SelectControl>,
    );
    expect(select).toBeDisabled();
  });
});
