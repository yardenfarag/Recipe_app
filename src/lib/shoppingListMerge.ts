import type { ShoppingListIncomingItem, ShoppingListItem } from '@/types/shoppingList';

/** Trim, lowercase, collapse internal whitespace. */
export function normalizeShoppingName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Empty / null units normalize to the same key. */
export function normalizeShoppingUnit(unit: string | null | undefined): string {
  return (unit ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function hasQuantity(quantity: number | null | undefined): boolean {
  return typeof quantity === 'number' && Number.isFinite(quantity);
}

/** Unit-aware key used when combining matching lines. */
export function shoppingListCombineKey(
  name: string,
  quantity: number | null,
  unit: string | null | undefined,
): string {
  const qtyMode = hasQuantity(quantity) ? 'qty' : 'noqty';
  return `${normalizeShoppingName(name)}|${normalizeShoppingUnit(unit)}|${qtyMode}`;
}

/** @deprecated Use shoppingListCombineKey — kept for migration call sites. */
export const shoppingListMergeKey = shoppingListCombineKey;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function createId(seed = 0): string {
  return `list-${Date.now()}-${seed}-${Math.random().toString(36).slice(2, 10)}`;
}

export type AppendShoppingListResult = {
  items: ShoppingListItem[];
  /** Display names (first existing casing) that were already on the list. */
  alreadyOnList: string[];
};

/**
 * Always appends new lines — duplicates are allowed. Reports which incoming
 * names already appeared on the list so the UI can tip the user.
 */
export function appendToShoppingList(
  existing: ShoppingListItem[],
  incoming: ShoppingListIncomingItem[],
  now = new Date().toISOString(),
): AppendShoppingListResult {
  const result: ShoppingListItem[] = existing.map((item) => ({
    ...item,
    sourceRecipeIds: item.sourceRecipeIds ? [...item.sourceRecipeIds] : undefined,
  }));

  const existingNames = new Map<string, string>();
  for (const item of result) {
    const key = normalizeShoppingName(item.name);
    if (!existingNames.has(key)) existingNames.set(key, item.name);
  }

  const alreadyKeys = new Set<string>();
  let seed = 0;

  for (const next of incoming) {
    const name = next.name.trim();
    if (!name) continue;

    const nameKey = normalizeShoppingName(name);
    if (existingNames.has(nameKey)) {
      alreadyKeys.add(nameKey);
    } else {
      existingNames.set(nameKey, name);
    }

    const quantity = hasQuantity(next.quantity) ? next.quantity : null;
    const unit = next.unit?.trim() ? next.unit.trim() : null;

    result.push({
      id: createId(seed),
      name,
      quantity,
      unit,
      checked: false,
      sourceRecipeIds: next.sourceRecipeId ? [next.sourceRecipeId] : undefined,
      created_at: now,
      updated_at: now,
    });
    seed += 1;
  }

  return {
    items: result,
    alreadyOnList: [...alreadyKeys].map((key) => existingNames.get(key) ?? key),
  };
}

/**
 * How many lines share each normalized name. Counts ≤ 1 are omitted.
 */
export function getDuplicateNameCounts(items: ShoppingListItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeShoppingName(item.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...counts.entries()]) {
    if (count <= 1) counts.delete(key);
  }
  return counts;
}

/**
 * Collapse every line with the same normalized name into one line per unit
 * (quantities summed when both have amounts). Opt-in — never runs on add.
 */
export function combineDuplicatesForName(
  items: ShoppingListItem[],
  name: string,
  now = new Date().toISOString(),
): ShoppingListItem[] {
  const target = normalizeShoppingName(name);
  const kept: ShoppingListItem[] = [];
  const group: ShoppingListItem[] = [];

  for (const item of items) {
    if (normalizeShoppingName(item.name) === target) group.push(item);
    else kept.push(item);
  }

  if (group.length <= 1) return items;

  const byUnit = new Map<string, ShoppingListItem>();
  for (const item of group) {
    const key = shoppingListCombineKey(item.name, item.quantity, item.unit);
    const current = byUnit.get(key);
    if (!current) {
      byUnit.set(key, {
        ...item,
        sourceRecipeIds: item.sourceRecipeIds ? [...item.sourceRecipeIds] : undefined,
        updated_at: now,
      });
      continue;
    }

    const mergedQuantity =
      hasQuantity(current.quantity) && hasQuantity(item.quantity)
        ? Math.round(((current.quantity as number) + (item.quantity as number)) * 100) / 100
        : current.quantity ?? item.quantity;

    byUnit.set(key, {
      ...current,
      quantity: mergedQuantity,
      checked: current.checked && item.checked,
      sourceRecipeIds: uniqueIds([
        ...(current.sourceRecipeIds ?? []),
        ...(item.sourceRecipeIds ?? []),
      ]),
      updated_at: now,
    });
  }

  return [...kept, ...byUnit.values()];
}

/**
 * Unchecked first, then cluster same names together, then oldest first.
 */
export function sortShoppingListItems(items: ShoppingListItem[]): ShoppingListItem[] {
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    const nameCmp = normalizeShoppingName(a.name).localeCompare(normalizeShoppingName(b.name));
    if (nameCmp !== 0) return nameCmp;
    return a.created_at.localeCompare(b.created_at);
  });
}
