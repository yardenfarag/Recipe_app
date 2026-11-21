import { describe, expect, it } from "vitest";

import type { ShoppingListItem } from "@shared/types/shoppingList";

import { displayOrder, groupShoppingList, ingredientToListItem, neighbourId, parseQuantity, shoppingAmount } from "@/lib/list/shoppingListView";

const item = (id: string, name: string, checked = false, quantity: number | null = null, unit: string | null = null): ShoppingListItem => ({
  id,
  name,
  quantity,
  unit,
  checked,
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
});

describe("groupShoppingList", () => {
  it("groups what is left to buy by aisle, in shop order, with checked items apart", () => {
    const { groups, checked } = groupShoppingList([
      item("1", "salt"),
      item("2", "milk"),
      item("3", "onion"),
      item("4", "garlic", true),
      item("5", "dish soap"),
    ]);
    expect(groups.map((group) => [group.aisle, group.items.map((entry) => entry.name)])).toEqual([
      ["produce", ["onion"]],
      ["dairy", ["milk"]],
      ["spices", ["salt"]],
      ["other", ["dish soap"]],
    ]);
    expect(checked.map((entry) => entry.name)).toEqual(["garlic"]);
  });

  it("puts the items in the order they are shown, checked last", () => {
    const order = displayOrder([item("1", "salt"), item("2", "milk", true), item("3", "onion")]);
    expect(order.map((entry) => entry.id)).toEqual(["3", "1", "2"]);
  });
});

describe("neighbourId", () => {
  const order = [item("a", "a"), item("b", "b"), item("c", "c")];
  it("is the next item, or the one before at the end, or none when alone", () => {
    expect(neighbourId(order, "a")).toBe("b");
    expect(neighbourId(order, "c")).toBe("b");
    expect(neighbourId([order[0]], "a")).toBeNull();
    expect(neighbourId(order, "zzz")).toBeNull();
  });
});

describe("shoppingAmount", () => {
  it("shows the amount with its unit, the unit alone, or nothing", () => {
    expect(shoppingAmount({ quantity: 2, unit: "cup" }, "en")).toBe("2 cups");
    expect(shoppingAmount({ quantity: null, unit: "bunch" }, "en")).toBe("bunch");
    expect(shoppingAmount({ quantity: null, unit: null }, "en")).toBeNull();
  });
});

describe("parseQuantity", () => {
  it("takes empty as no amount and refuses anything but a positive number", () => {
    expect(parseQuantity("")).toEqual({ ok: true, quantity: null });
    expect(parseQuantity(" 2.5 ")).toEqual({ ok: true, quantity: 2.5 });
    expect(parseQuantity("1,5")).toEqual({ ok: true, quantity: 1.5 });
    expect(parseQuantity("0")).toEqual({ ok: false });
    expect(parseQuantity("-1")).toEqual({ ok: false });
    expect(parseQuantity("lots")).toEqual({ ok: false });
  });
});

describe("ingredientToListItem", () => {
  it("uses the amount for the chosen measuring system", () => {
    const flour = { name: "flour", quantity: 1, unit: "cup", metric: { quantity: 120, unit: "g" }, spoons: { quantity: 1, unit: "cup" } };
    expect(ingredientToListItem(flour, "metric", "r1")).toEqual({ name: "flour", quantity: 120, unit: "g", sourceRecipeId: "r1" });
    expect(ingredientToListItem(flour, "original")).toEqual({ name: "flour", quantity: 1, unit: "cup" });
  });

  it("leaves the number off when the source never gave one", () => {
    expect(ingredientToListItem({ name: "salt", quantity: 0, unit: "to taste" }, "original")).toEqual({ name: "salt", quantity: null, unit: "to taste" });
    expect(ingredientToListItem({ name: "parsley", quantity: 0, unit: "" }, "original")).toEqual({ name: "parsley", quantity: null, unit: null });
  });
});
