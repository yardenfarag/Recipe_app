import { describe, expect, it } from 'vitest';

import {
  appendToShoppingList,
  combineDuplicatesForName,
  getDuplicateNameCounts,
  normalizeShoppingName,
  normalizeShoppingUnit,
  shoppingListCombineKey,
  sortShoppingListItems,
} from './shoppingListMerge';
import type { ShoppingListItem } from '@/types/shoppingList';

function item(
  partial: Partial<ShoppingListItem> & Pick<ShoppingListItem, 'name'>,
): ShoppingListItem {
  return {
    id: partial.id ?? 'id-1',
    name: partial.name,
    quantity: partial.quantity ?? null,
    unit: partial.unit ?? null,
    checked: partial.checked ?? false,
    sourceRecipeIds: partial.sourceRecipeIds,
    created_at: partial.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('normalizeShoppingName', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeShoppingName('  Large  Eggs ')).toBe('large eggs');
  });
});

describe('normalizeShoppingUnit', () => {
  it('treats null and blank as the same', () => {
    expect(normalizeShoppingUnit(null)).toBe('');
    expect(normalizeShoppingUnit('  ')).toBe('');
    expect(normalizeShoppingUnit('Cups')).toBe('cups');
  });
});

describe('shoppingListCombineKey', () => {
  it('separates qty vs no-qty modes', () => {
    expect(shoppingListCombineKey('Eggs', 2, null)).not.toBe(
      shoppingListCombineKey('Eggs', null, null),
    );
  });
});

describe('appendToShoppingList', () => {
  it('always adds a new line even when the name already exists', () => {
    const existing = [item({ id: 'a', name: 'Eggs', quantity: 3, unit: null })];
    const { items, alreadyOnList } = appendToShoppingList(existing, [
      { name: 'eggs', quantity: 2, unit: null },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].quantity).toBe(3);
    expect(items[1].quantity).toBe(2);
    expect(alreadyOnList).toEqual(['Eggs']);
  });

  it('reports nothing when the name is new', () => {
    const { items, alreadyOnList } = appendToShoppingList([], [
      { name: 'Milk', quantity: 1, unit: 'cup' },
    ]);
    expect(items).toHaveLength(1);
    expect(alreadyOnList).toEqual([]);
  });

  it('keeps different units as separate lines', () => {
    const existing = [item({ id: 'a', name: 'Flour', quantity: 1, unit: 'cup' })];
    const { items } = appendToShoppingList(existing, [
      { name: 'Flour', quantity: 100, unit: 'g' },
    ]);
    expect(items).toHaveLength(2);
  });
});

describe('getDuplicateNameCounts', () => {
  it('only returns names that appear more than once', () => {
    const counts = getDuplicateNameCounts([
      item({ id: 'a', name: 'Eggs' }),
      item({ id: 'b', name: 'eggs', quantity: 2 }),
      item({ id: 'c', name: 'Milk' }),
    ]);
    expect(counts.get('eggs')).toBe(2);
    expect(counts.has('milk')).toBe(false);
  });
});

describe('combineDuplicatesForName', () => {
  it('sums quantities for the same name+unit', () => {
    const combined = combineDuplicatesForName(
      [
        item({ id: 'a', name: 'Eggs', quantity: 3, unit: null }),
        item({ id: 'b', name: 'eggs', quantity: 2, unit: null }),
        item({ id: 'c', name: 'Milk', quantity: 1, unit: 'cup' }),
      ],
      'Eggs',
    );
    expect(combined).toHaveLength(2);
    const eggs = combined.find((i) => normalizeShoppingName(i.name) === 'eggs');
    expect(eggs?.quantity).toBe(5);
  });

  it('keeps different units as separate lines after combine', () => {
    const combined = combineDuplicatesForName(
      [
        item({ id: 'a', name: 'Flour', quantity: 1, unit: 'cup' }),
        item({ id: 'b', name: 'Flour', quantity: 100, unit: 'g' }),
      ],
      'Flour',
    );
    expect(combined).toHaveLength(2);
  });
});

describe('sortShoppingListItems', () => {
  it('puts unchecked items before checked and clusters names', () => {
    const sorted = sortShoppingListItems([
      item({ id: 'c', name: 'C', checked: true, created_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'a2', name: 'A', checked: false, created_at: '2026-01-02T00:00:00.000Z' }),
      item({ id: 'b', name: 'B', checked: false, created_at: '2026-01-01T00:00:00.000Z' }),
      item({ id: 'a1', name: 'A', checked: false, created_at: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['a1', 'a2', 'b', 'c']);
  });
});
