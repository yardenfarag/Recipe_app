import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { ShoppingListItem } from "@shared/types/shoppingList";

import { ShoppingItemRow, type ShoppingItemRowProps } from "@/components/list/ShoppingItemRow";
import { TooltipProvider } from "@/components/ui/Tooltip";
import i18n from "@/lib/i18n";

const milk: ShoppingListItem = {
  id: "m1",
  name: "milk",
  quantity: 2,
  unit: "cup",
  checked: false,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

function renderRow(overrides: Partial<ShoppingItemRowProps> = {}) {
  const props: ShoppingItemRowProps = {
    item: milk,
    language: "en",
    duplicateCount: 0,
    onToggle: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn(),
    onKeepAtHome: vi.fn(),
    onCombine: vi.fn(),
    onMove: vi.fn(),
    checkboxRef: vi.fn(),
    ...overrides,
  };
  render(
    <I18nextProvider i18n={i18n}>
      <TooltipProvider>
        <ul>
          <ShoppingItemRow {...props} />
        </ul>
      </TooltipProvider>
    </I18nextProvider>,
  );
  return props;
}

describe("ShoppingItemRow", () => {
  it("is a checkbox named with the item and its amount, and clicking checks it off", () => {
    const props = renderRow();
    const box = screen.getByRole("checkbox", { name: "milk, 2 cups" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(props.onToggle).toHaveBeenCalledWith(milk);
  });

  it("moves with the arrows and removes with Delete", () => {
    const props = renderRow();
    const box = screen.getByRole("checkbox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "End" });
    expect(props.onMove).toHaveBeenNthCalledWith(1, milk, "next");
    expect(props.onMove).toHaveBeenNthCalledWith(2, milk, "previous");
    expect(props.onMove).toHaveBeenNthCalledWith(3, milk, "last");
    fireEvent.keyDown(box, { key: "Delete" });
    expect(props.onRemove).toHaveBeenCalledWith(milk);
  });

  it("E edits in place: Enter saves the new name and amount", async () => {
    const props = renderRow();
    fireEvent.keyDown(screen.getByRole("checkbox"), { key: "e" });
    const name = screen.getByRole("textbox", { name: "Item name" });
    fireEvent.change(name, { target: { value: "oat milk" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), { target: { value: "1,5" } });
    fireEvent.submit(name.closest("form")!);
    await vi.waitFor(() => expect(props.onSave).toHaveBeenCalledWith(milk, { name: "oat milk", quantity: 1.5, unit: "cup" }));
    await vi.waitFor(() => expect(screen.getByRole("checkbox")).toBeDefined());
  });

  it("Escape leaves the edit without saving", () => {
    const props = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit milk" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Item name" }), { key: "Escape" });
    expect(props.onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).toBeDefined();
  });

  it("refuses an amount that is not a positive number", () => {
    const props = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Edit milk" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), { target: { value: "-2" } });
    fireEvent.submit(screen.getByRole("textbox", { name: "Item name" }).closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("Quantity must be a positive number.");
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("offers to combine when the name is listed more than once, and to keep it at home", () => {
    const props = renderRow({ duplicateCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Also listed · 2" }));
    expect(props.onCombine).toHaveBeenCalledWith(milk);
    fireEvent.click(screen.getByRole("button", { name: /Keep milk in the pantry/ }));
    expect(props.onKeepAtHome).toHaveBeenCalledWith(milk);
  });

  it("a checked item is shown as checked and has no 'have at home' button", () => {
    renderRow({ item: { ...milk, checked: true } });
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button", { name: /Keep milk in the pantry/ })).toBeNull();
  });
});
