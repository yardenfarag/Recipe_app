"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { sortShoppingListItems } from "@shared/lib/shoppingListMerge";
import {
  clearShoppingList,
  deleteCheckedShoppingListItems,
  deleteShoppingListItem,
  fetchShoppingList,
  insertShoppingListItem,
  updateShoppingListItem,
} from "@shared/lib/supabase/shoppingList";
import type { ShoppingListIncomingItem, ShoppingListItem } from "@shared/types/shoppingList";

import { useAuth } from "@/components/AuthProvider";
import { useHouseholdLive } from "@/lib/household/HouseholdProvider";
import { addToShoppingList, combineOnShoppingList, type AddToListMode, type AddToListResult } from "@/lib/list/shoppingListSync";

export type ItemPatch = { name?: string; quantity?: number | null; unit?: string | null };

/**
 * The signed-in person's shopping list: the same rows the mobile app reads, so a change on either shows on the
 * other. Checking, editing and removing show at once and are put back if saving fails. The list is read again when
 * the tab comes back into view, so what was ticked on the phone in the shop is there on return, and when someone
 * else in the household changes it (live, ADR 034).
 */
export function useShoppingList() {
  const { user } = useAuth();
  const userId = user?.id;
  const [items, setItemsState] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const requestId = useRef(0);
  /** Saves in flight. A re-read while one runs could bring back what was just changed, so it waits. */
  const pending = useRef(0);

  const setItems = useCallback((next: ShoppingListItem[]) => {
    itemsRef.current = next;
    setItemsState(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const id = ++requestId.current;
    setError(null);
    try {
      const data = await fetchShoppingList();
      if (requestId.current !== id || pending.current > 0) return;
      setItems(sortShoppingListItems(data));
    } catch (caught) {
      if (requestId.current !== id) return;
      setError(caught instanceof Error ? caught.message : "load failed");
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, [setItems, userId]);

  useEffect(() => {
    // Loads from the network, so state is set after the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Someone else in the household changed the list (ADR 034). While a save of ours runs, the read waits for it.
  const staleWhileSaving = useRef(false);
  useHouseholdLive("list", () => {
    if (pending.current > 0) staleWhileSaving.current = true;
    else void refresh();
  });

  /** Runs a save, stopping any read in flight from overwriting what it changes. */
  const saving = useCallback(
    async <T>(work: () => Promise<T>): Promise<T> => {
      pending.current += 1;
      requestId.current += 1;
      try {
        return await work();
      } finally {
        pending.current -= 1;
        if (pending.current === 0 && staleWhileSaving.current) {
          staleWhileSaving.current = false;
          void refresh();
        }
      }
    },
    [refresh],
  );

  /** Changes one line at once, saves it, and puts back only that line if saving fails. */
  const changeItem = useCallback(
    (id: string, change: (item: ShoppingListItem) => ShoppingListItem) =>
      saving(async () => {
        const before = itemsRef.current.find((item) => item.id === id);
        if (!before) return;
        const after = { ...change(before), updated_at: new Date().toISOString() };
        setItems(sortShoppingListItems(itemsRef.current.map((item) => (item.id === id ? after : item))));
        try {
          await updateShoppingListItem(after);
        } catch (caught) {
          // Someone else in the household removed this line meanwhile (no row came back): it's gone, not an error.
          if ((caught as { code?: string } | null)?.code === "PGRST116") {
            setItems(itemsRef.current.filter((item) => item.id !== id));
            void refresh();
            return;
          }
          // Only if nothing newer was done to it meanwhile (a second click while the first was saving).
          setItems(sortShoppingListItems(itemsRef.current.map((item) => (item.id === id && item.updated_at === after.updated_at ? before : item))));
          throw caught;
        }
      }),
    [refresh, saving, setItems],
  );

  const toggleChecked = useCallback((id: string) => changeItem(id, (item) => ({ ...item, checked: !item.checked })), [changeItem]);

  const updateItem = useCallback(
    (id: string, patch: ItemPatch) =>
      changeItem(id, (item) => ({
        ...item,
        name: patch.name?.trim() ? patch.name.trim() : item.name,
        quantity: patch.quantity !== undefined ? patch.quantity : item.quantity,
        unit: patch.unit !== undefined ? (patch.unit?.trim() ? patch.unit.trim() : null) : item.unit,
      })),
    [changeItem],
  );

  const removeItem = useCallback(
    (id: string) =>
      saving(async () => {
        const index = itemsRef.current.findIndex((item) => item.id === id);
        if (index === -1) return;
        const removed = itemsRef.current[index];
        setItems(itemsRef.current.filter((item) => item.id !== id));
        try {
          await deleteShoppingListItem(id);
        } catch (caught) {
          setItems(sortShoppingListItems([...itemsRef.current, removed]));
          throw caught;
        }
      }),
    [saving, setItems],
  );

  /** Puts a removed line back (Undo). It gets a new id; its age is kept, so it returns to the same place. */
  const restoreItem = useCallback(
    (item: ShoppingListItem) =>
      saving(async () => {
        if (!userId) return;
        const { id: _id, ...rest } = item;
        void _id;
        const saved = await insertShoppingListItem(userId, { ...rest, updated_at: new Date().toISOString() });
        setItems(sortShoppingListItems([...itemsRef.current, saved]));
      }),
    [saving, setItems, userId],
  );

  const add = useCallback(
    (incoming: ShoppingListIncomingItem[], mode: AddToListMode): Promise<AddToListResult> =>
      saving(async () => {
        if (!userId) throw new Error("Not signed in.");
        const result = await addToShoppingList(userId, incoming, mode);
        setItems(result.items);
        return result;
      }),
    [saving, setItems, userId],
  );

  const combineDuplicates = useCallback(
    (name: string) =>
      saving(async () => {
        if (!userId) return;
        setItems(await combineOnShoppingList(userId, name));
      }),
    [saving, setItems, userId],
  );

  const clearChecked = useCallback(
    () =>
      saving(async () => {
        const previous = itemsRef.current;
        setItems(previous.filter((item) => !item.checked));
        try {
          await deleteCheckedShoppingListItems();
        } catch (caught) {
          setItems(previous);
          throw caught;
        }
      }),
    [saving, setItems],
  );

  const clearAll = useCallback(
    () =>
      saving(async () => {
        const previous = itemsRef.current;
        setItems([]);
        try {
          await clearShoppingList();
        } catch (caught) {
          setItems(previous);
          throw caught;
        }
      }),
    [saving, setItems],
  );

  return { items, loading, error, refresh, add, combineDuplicates, toggleChecked, updateItem, removeItem, restoreItem, clearChecked, clearAll };
}
