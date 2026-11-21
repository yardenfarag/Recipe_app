import {
  appendToShoppingList,
  combineDuplicatesForName,
  mergeIntoShoppingList,
  sortShoppingListItems,
} from "@shared/lib/shoppingListMerge";
import { fetchShoppingList, syncMergedShoppingList } from "@shared/lib/supabase/shoppingList";
import type { ShoppingListIncomingItem, ShoppingListItem } from "@shared/types/shoppingList";

function sameLine(a: ShoppingListItem, b: ShoppingListItem): boolean {
  return (
    a.name === b.name &&
    a.quantity === b.quantity &&
    a.unit === b.unit &&
    a.checked === b.checked &&
    (a.sourceRecipeIds ?? []).join(",") === (b.sourceRecipeIds ?? []).join(",")
  );
}

/**
 * Saves the difference between two versions of the list with the shared `syncMergedShoppingList`, but hands it only
 * the lines that changed. That function writes every line it is given, one request each, so on a long list adding
 * one item would otherwise rewrite the whole list. Returns the full list as saved, sorted.
 */
export async function saveListChanges(
  userId: string,
  previous: ShoppingListItem[],
  next: ShoppingListItem[],
): Promise<ShoppingListItem[]> {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextIds = new Set(next.map((item) => item.id));
  const changed = next.filter((item) => {
    const before = previousById.get(item.id);
    return !before || !sameLine(before, item);
  });
  const changedIds = new Set(changed.map((item) => item.id));
  const touchedBefore = previous.filter((item) => !nextIds.has(item.id) || changedIds.has(item.id));

  const saved = await syncMergedShoppingList(userId, touchedBefore, changed);
  const savedById = new Map(changed.map((item, index) => [item.id, saved[index]]));
  return sortShoppingListItems(next.map((item) => savedById.get(item.id) ?? item));
}

export type AddToListMode =
  /** Every ingredient becomes its own line, as the recipe page does; names already listed are reported. */
  | "append"
  /** Same name and unit stack onto one line, as "From recipes" does. */
  | "merge";

export type AddToListResult = {
  items: ShoppingListItem[];
  /** Names that were already on the list (append mode). */
  alreadyOnList: string[];
  /** New lines (merge mode counts; in append mode every line is new). */
  addedCount: number;
  /** Lines stacked onto one already there (merge mode). */
  mergedCount: number;
};

/**
 * Adds to the signed-in person's list. Reads the list fresh first, as mobile does, so lines added on the phone a
 * moment ago are combined with, not lost.
 */
export async function addToShoppingList(userId: string, incoming: ShoppingListIncomingItem[], mode: AddToListMode): Promise<AddToListResult> {
  const previous = await fetchShoppingList();
  if (mode === "append") {
    const { items, alreadyOnList } = appendToShoppingList(previous, incoming);
    const saved = await saveListChanges(userId, previous, items);
    return { items: saved, alreadyOnList, addedCount: items.length - previous.length, mergedCount: 0 };
  }
  const { items, addedCount, mergedCount } = mergeIntoShoppingList(previous, incoming);
  const saved = await saveListChanges(userId, previous, items);
  return { items: saved, alreadyOnList: [], addedCount, mergedCount };
}

/** Folds every line with this name into one per unit, on the list as it is saved now. */
export async function combineOnShoppingList(userId: string, name: string): Promise<ShoppingListItem[]> {
  const previous = await fetchShoppingList();
  const next = combineDuplicatesForName(previous, name);
  if (next.length === previous.length) return sortShoppingListItems(previous);
  return saveListChanges(userId, previous, next);
}
