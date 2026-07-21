import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
  getGuestShoppingList,
  setGuestShoppingList,
} from '@/lib/guestShoppingList';
import {
  appendToShoppingList,
  combineDuplicatesForName,
  sortShoppingListItems,
} from '@/lib/shoppingListMerge';
import {
  clearShoppingList,
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchShoppingList,
  syncMergedShoppingList,
  updateShoppingListItem,
} from '@/lib/supabase/shoppingList';
import type {
  ShoppingListIncomingItem,
  ShoppingListItem,
} from '@/types/shoppingList';

export type AddShoppingItemsResult = {
  items: ShoppingListItem[];
  /** Names that were already on the list before this add. */
  alreadyOnList: string[];
};

/**
 * Loads the shopping list for guest (AsyncStorage) or signed-in (Supabase)
 * users. Adds always append (duplicates allowed); combine is opt-in.
 */
export function useShoppingList() {
  const { user, migrationStatus } = useAuth();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = user ? await fetchShoppingList() : await getGuestShoppingList();
      setItems(sortShoppingListItems(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your shopping list.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const persistList = useCallback(
    async (previous: ShoppingListItem[], next: ShoppingListItem[]) => {
      const sorted = sortShoppingListItems(next);
      if (user) {
        const saved = await syncMergedShoppingList(user.id, previous, sorted);
        setItems(sortShoppingListItems(saved));
        return saved;
      }
      await setGuestShoppingList(sorted);
      setItems(sorted);
      return sorted;
    },
    [user],
  );

  const addItems = useCallback(
    async (incoming: ShoppingListIncomingItem[]): Promise<AddShoppingItemsResult> => {
      const previous = user ? await fetchShoppingList() : await getGuestShoppingList();
      const { items: next, alreadyOnList } = appendToShoppingList(previous, incoming);
      const saved = await persistList(previous, next);
      return { items: saved, alreadyOnList };
    },
    [persistList, user],
  );

  const addManual = useCallback(
    async (name: string, quantity: number | null, unit: string | null) => {
      return addItems([{ name, quantity, unit }]);
    },
    [addItems],
  );

  const addFromRecipe = useCallback(
    async (
      ingredients: { name: string; quantity: number; unit: string }[],
      recipeId?: string,
    ) => {
      return addItems(
        ingredients.map((ing) => ({
          name: ing.name,
          quantity: Number.isFinite(ing.quantity) ? ing.quantity : null,
          unit: ing.unit?.trim() ? ing.unit : null,
          sourceRecipeId: recipeId,
        })),
      );
    },
    [addItems],
  );

  const combineDuplicates = useCallback(
    async (name: string) => {
      const previous = user ? await fetchShoppingList() : await getGuestShoppingList();
      const next = combineDuplicatesForName(previous, name);
      if (next.length === previous.length) return previous;
      return persistList(previous, next);
    },
    [persistList, user],
  );

  const toggleChecked = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const previous = itemsRef.current;
      const next = sortShoppingListItems(
        previous.map((item) =>
          item.id === id ? { ...item, checked: !item.checked, updated_at: now } : item,
        ),
      );
      itemsRef.current = next;
      setItems(next);

      try {
        const target = next.find((item) => item.id === id);
        if (!target) return;
        if (user) {
          await updateShoppingListItem(target);
        } else {
          await setGuestShoppingList(next);
        }
      } catch (err) {
        itemsRef.current = previous;
        setItems(previous);
        throw err;
      }
    },
    [user],
  );

  const updateItem = useCallback(
    async (
      id: string,
      patch: { name?: string; quantity?: number | null; unit?: string | null },
    ) => {
      const now = new Date().toISOString();
      const previous = itemsRef.current;
      const next = sortShoppingListItems(
        previous.map((item) => {
          if (item.id !== id) return item;
          return {
            ...item,
            name: patch.name?.trim() ? patch.name.trim() : item.name,
            quantity: patch.quantity !== undefined ? patch.quantity : item.quantity,
            unit:
              patch.unit !== undefined
                ? patch.unit?.trim()
                  ? patch.unit.trim()
                  : null
                : item.unit,
            updated_at: now,
          };
        }),
      );
      itemsRef.current = next;
      setItems(next);

      try {
        const target = next.find((item) => item.id === id);
        if (!target) return;
        if (user) {
          await updateShoppingListItem(target);
        } else {
          await setGuestShoppingList(next);
        }
      } catch (err) {
        itemsRef.current = previous;
        setItems(previous);
        throw err;
      }
    },
    [user],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const previous = itemsRef.current;
      const next = previous.filter((item) => item.id !== id);
      itemsRef.current = next;
      setItems(next);

      try {
        if (user) {
          // Client-generated ids are local-only until sync; skip cloud delete.
          if (!id.startsWith('list-')) {
            await deleteShoppingListItem(id);
          }
        } else {
          await setGuestShoppingList(next);
        }
      } catch (err) {
        itemsRef.current = previous;
        setItems(previous);
        throw err;
      }
    },
    [user],
  );

  const clearChecked = useCallback(async () => {
    const previous = itemsRef.current;
    const next = previous.filter((item) => !item.checked);
    itemsRef.current = next;
    setItems(next);

    try {
      if (user) {
        await deleteCheckedShoppingListItems();
      } else {
        await setGuestShoppingList(next);
      }
    } catch (err) {
      itemsRef.current = previous;
      setItems(previous);
      throw err;
    }
  }, [user]);

  const clearAll = useCallback(async () => {
    const previous = itemsRef.current;
    itemsRef.current = [];
    setItems([]);

    try {
      if (user) {
        await clearShoppingList();
      } else {
        await setGuestShoppingList([]);
      }
    } catch (err) {
      itemsRef.current = previous;
      setItems(previous);
      throw err;
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      if (user && migrationStatus === 'running') {
        setLoading(true);
        return;
      }
      void refresh();
    }, [refresh, user, migrationStatus]),
  );

  useEffect(() => {
    if (!user) return;
    if (migrationStatus === 'done' || migrationStatus === 'error') {
      void refresh();
    }
  }, [user, migrationStatus, refresh]);

  return {
    items,
    loading,
    error,
    refresh,
    addManual,
    addFromRecipe,
    combineDuplicates,
    toggleChecked,
    updateItem,
    removeItem,
    clearChecked,
    clearAll,
  };
}
