import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useHouseholdChange } from '@/hooks/useHousehold';
import {
  getGuestShoppingList,
  setGuestShoppingList,
} from '@/lib/guestShoppingList';
import {
  appendToShoppingList,
  combineDuplicatesForName,
  mergeIntoShoppingList,
  sortShoppingListItems,
} from '@shared/lib/shoppingListMerge';
import {
  clearShoppingList,
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchShoppingList,
  syncMergedShoppingList,
  updateShoppingListItem,
} from '@shared/lib/supabase/shoppingList';
import type {
  ShoppingListIncomingItem,
  ShoppingListItem,
} from '@shared/types/shoppingList';

export type AddShoppingItemsResult = {
  items: ShoppingListItem[];
  /** Names that were already on the list before this add. */
  alreadyOnList: string[];
};

export type MergeFromRecipesResult = {
  items: ShoppingListItem[];
  addedCount: number;
  mergedCount: number;
};

/** PostgREST's answer to saving a line that isn't there any more (someone else in the household removed it). */
function removedMeanwhile(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'PGRST116';
}

/**
 * Loads the shopping list for guest (AsyncStorage) or signed-in (Supabase)
 * users. Adds always append (duplicates allowed); combine is opt-in.
 *
 * A signed-in person's list is their household's (docs/adr/034-households.md): when someone else changes it, the
 * list is read again. While a change of this phone's own is still saving, that read waits until it has landed, so
 * it can't undo what was just ticked, edited or removed on screen.
 */
export function useShoppingList() {
  const { user, migrationStatus } = useAuth();
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Saves in flight, and whether someone else's change is waiting for them to finish.
  const pendingRef = useRef(0);
  const staleRef = useRef(false);

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

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  /** Runs a save; a household refresh that arrives meanwhile waits until no save is in flight. */
  const track = useCallback(async <T,>(save: () => Promise<T>): Promise<T> => {
    pendingRef.current += 1;
    try {
      return await save();
    } finally {
      pendingRef.current -= 1;
      if (pendingRef.current === 0 && staleRef.current) {
        staleRef.current = false;
        void refreshRef.current();
      }
    }
  }, []);

  useHouseholdChange('list', () => {
    if (!user) return;
    if (pendingRef.current > 0) staleRef.current = true;
    else void refresh();
  });

  const persistList = useCallback(
    async (previous: ShoppingListItem[], next: ShoppingListItem[]) =>
      track(async () => {
        const sorted = sortShoppingListItems(next);
        if (user) {
          const saved = await syncMergedShoppingList(user.id, previous, sorted);
          setItems(sortShoppingListItems(saved));
          return saved;
        }
        await setGuestShoppingList(sorted);
        setItems(sorted);
        return sorted;
      }),
    [track, user],
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
          quantity: Number.isFinite(ing.quantity) && ing.quantity > 0 ? ing.quantity : null,
          unit: ing.unit?.trim() ? ing.unit : null,
          sourceRecipeId: recipeId,
        })),
      );
    },
    [addItems],
  );

  /**
   * Flatten ingredients from multiple recipes and stack matching name+unit
   * lines onto the current list (unlike append-only addFromRecipe).
   */
  const addFromRecipes = useCallback(
    async (
      recipes: {
        id: string;
        ingredients: { name: string; quantity: number; unit: string }[];
      }[],
    ): Promise<MergeFromRecipesResult> => {
      const incoming: ShoppingListIncomingItem[] = [];
      for (const recipe of recipes) {
        for (const ing of recipe.ingredients) {
          incoming.push({
            name: ing.name,
            quantity: Number.isFinite(ing.quantity) && ing.quantity > 0 ? ing.quantity : null,
            unit: ing.unit?.trim() ? ing.unit : null,
            sourceRecipeId: recipe.id,
          });
        }
      }

      const previous = user ? await fetchShoppingList() : await getGuestShoppingList();
      const { items: next, addedCount, mergedCount } = mergeIntoShoppingList(
        previous,
        incoming,
      );
      const saved = await persistList(previous, next);
      return { items: saved, addedCount, mergedCount };
    },
    [persistList, user],
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

  /** Someone else in the household removed this line while it was being saved: it's gone, not an error. */
  const dropRemoved = useCallback(
    (id: string) => {
      itemsRef.current = itemsRef.current.filter((item) => item.id !== id);
      setItems(itemsRef.current);
      void refresh();
    },
    [refresh],
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

      await track(async () => {
        try {
          const target = next.find((item) => item.id === id);
          if (!target) return;
          if (user) {
            await updateShoppingListItem(target);
          } else {
            await setGuestShoppingList(next);
          }
        } catch (err) {
          if (removedMeanwhile(err)) return dropRemoved(id);
          itemsRef.current = previous;
          setItems(previous);
          throw err;
        }
      });
    },
    [dropRemoved, track, user],
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

      await track(async () => {
        try {
          const target = next.find((item) => item.id === id);
          if (!target) return;
          if (user) {
            await updateShoppingListItem(target);
          } else {
            await setGuestShoppingList(next);
          }
        } catch (err) {
          if (removedMeanwhile(err)) return dropRemoved(id);
          itemsRef.current = previous;
          setItems(previous);
          throw err;
        }
      });
    },
    [dropRemoved, track, user],
  );

  const removeItem = useCallback(
    async (id: string) => {
      const previous = itemsRef.current;
      const next = previous.filter((item) => item.id !== id);
      itemsRef.current = next;
      setItems(next);

      await track(async () => {
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
      });
    },
    [track, user],
  );

  const clearChecked = useCallback(async () => {
    const previous = itemsRef.current;
    const next = previous.filter((item) => !item.checked);
    itemsRef.current = next;
    setItems(next);

    await track(async () => {
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
    });
  }, [track, user]);

  const clearAll = useCallback(async () => {
    const previous = itemsRef.current;
    itemsRef.current = [];
    setItems([]);

    await track(async () => {
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
    });
  }, [track, user]);

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
    addFromRecipes,
    combineDuplicates,
    toggleChecked,
    updateItem,
    removeItem,
    clearChecked,
    clearAll,
  };
}
