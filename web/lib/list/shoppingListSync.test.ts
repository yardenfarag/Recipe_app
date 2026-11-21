import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ShoppingListItem } from "@shared/types/shoppingList";

const remote = vi.hoisted(() => ({
  fetchShoppingList: vi.fn(),
  syncMergedShoppingList: vi.fn(),
}));
vi.mock("@shared/lib/supabase/shoppingList", () => remote);

import { addToShoppingList, saveListChanges } from "@/lib/list/shoppingListSync";

const line = (id: string, name: string, quantity: number | null = null, unit: string | null = null): ShoppingListItem => ({
  id,
  name,
  quantity,
  unit,
  checked: false,
  created_at: `2026-11-01T00:00:0${id.length}.000Z`,
  updated_at: "2026-11-01T00:00:00.000Z",
});

beforeEach(() => {
  remote.fetchShoppingList.mockReset();
  // The server gives a client id (list-…) a real one, and returns lines in the order given.
  remote.syncMergedShoppingList.mockReset().mockImplementation(async (_user: string, _previous: ShoppingListItem[], next: ShoppingListItem[]) =>
    next.map((item) => (item.id.startsWith("list-") ? { ...item, id: `saved-${item.name}` } : item)),
  );
});

describe("saveListChanges", () => {
  it("sends only the lines that changed, not the whole list", async () => {
    const milk = line("a", "milk");
    const eggs = line("b", "eggs");
    const bread = line("c", "bread");
    const next = [milk, { ...eggs, checked: true }, line("list-1", "lemons")];
    const saved = await saveListChanges("u1", [milk, eggs, bread], next);

    const [, previous, changed] = remote.syncMergedShoppingList.mock.calls[0];
    expect(previous.map((item: ShoppingListItem) => item.id)).toEqual(["b", "c"]); // eggs changed, bread removed
    expect(changed.map((item: ShoppingListItem) => item.id)).toEqual(["b", "list-1"]);
    expect(saved.map((item) => item.id).sort()).toEqual(["a", "b", "saved-lemons"]);
  });
});

describe("addToShoppingList", () => {
  it("append: keeps a repeated name as its own line and reports it", async () => {
    remote.fetchShoppingList.mockResolvedValue([line("a", "Milk", 1, "l")]);
    const result = await addToShoppingList("u1", [{ name: "milk", quantity: 1, unit: "l" }], "append");
    expect(result.items).toHaveLength(2);
    expect(result.alreadyOnList).toEqual(["Milk"]);
    expect(result.addedCount).toBe(1);
  });

  it("merge: stacks the same name and unit onto one line", async () => {
    remote.fetchShoppingList.mockResolvedValue([line("a", "milk", 1, "l")]);
    const result = await addToShoppingList("u1", [{ name: "Milk", quantity: 0.5, unit: "l", sourceRecipeId: "r1" }], "merge");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(1.5);
    expect(result).toMatchObject({ addedCount: 0, mergedCount: 1 });
  });
});
