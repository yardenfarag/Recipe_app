import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import type { ShoppingListItem } from "@shared/types/shoppingList";

import { AddItemForm } from "@/components/list/AddItemForm";
import i18n from "@/lib/i18n";

const milk: ShoppingListItem = {
  id: "m1",
  name: "Milk",
  quantity: null,
  unit: null,
  checked: false,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
};

function renderForm(onAdd = vi.fn().mockResolvedValue(undefined), items: ShoppingListItem[] = []) {
  render(
    <I18nextProvider i18n={i18n}>
      <AddItemForm items={items} onAdd={onAdd} />
    </I18nextProvider>,
  );
  return onAdd;
}

const nameField = () => screen.getByRole("textbox", { name: "Item name" });

describe("AddItemForm", () => {
  it("Enter adds the item with its amount and empties the fields", async () => {
    const onAdd = renderForm();
    fireEvent.change(nameField(), { target: { value: "  lemons " } });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), { target: { value: "3" } });
    fireEvent.submit(nameField().closest("form")!);
    expect(onAdd).toHaveBeenCalledWith("lemons", 3, null);
    expect((nameField() as HTMLInputElement).value).toBe("");
  });

  it("asks for a name, and for a positive amount", () => {
    const onAdd = renderForm();
    fireEvent.submit(nameField().closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("Enter what you need to buy.");
    fireEvent.change(nameField(), { target: { value: "eggs" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), { target: { value: "zero" } });
    fireEvent.submit(nameField().closest("form")!);
    expect(screen.getByRole("alert").textContent).toBe("Quantity must be a positive number.");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("warns while typing a name already on the list", () => {
    renderForm(undefined, [milk]);
    fireEvent.change(nameField(), { target: { value: "milk " } });
    expect(screen.getByText(/Already on your list · 1 line/)).toBeDefined();
  });

  it("gives back what was typed if adding fails", async () => {
    renderForm(vi.fn().mockRejectedValue(new Error("offline")));
    fireEvent.change(nameField(), { target: { value: "bread" } });
    fireEvent.submit(nameField().closest("form")!);
    await vi.waitFor(() => expect((nameField() as HTMLInputElement).value).toBe("bread"));
  });
});
