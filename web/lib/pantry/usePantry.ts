"use client";

import { useCallback, useEffect, useState } from "react";

import { deletePantryItems, fetchPantryItems, movePantryItem, renamePantryItem, upsertPantryItems, type NewPantryItem } from "@shared/lib/supabase/pantry";
import type { PantryItem, PantryPlace } from "@shared/types/pantry";

import { useAuth } from "@/components/AuthProvider";

type Loaded = { userId: string; items: PantryItem[] | null };

/**
 * The signed-in person's pantry (PIN-181): what they have at home, by place. Changes show at once and are saved
 * straight to their own rows; a failed save puts the list back as the server has it, and the caller says so.
 * `items` is null while loading and when it couldn't be read (`failed`).
 */
export function usePantry() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const read = useCallback(async (id: string): Promise<Loaded> => {
    try {
      return { userId: id, items: await fetchPantryItems() };
    } catch {
      return { userId: id, items: null };
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void read(userId).then((next) => {
      if (!cancelled) setLoaded(next);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, read]);

  const current = loaded && loaded.userId === userId ? loaded : null;
  const items = current?.items ?? null;

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoaded(null);
    setLoaded(await read(userId));
  }, [read, userId]);

  /** Puts the server's list back after a failed change. */
  const resync = useCallback(() => {
    if (userId) void read(userId).then(setLoaded);
  }, [read, userId]);

  const setItems = useCallback(
    (edit: (items: PantryItem[]) => PantryItem[]) =>
      setLoaded((previous) => (previous?.items && previous.userId === userId ? { ...previous, items: edit(previous.items) } : previous)),
    [userId],
  );

  const add = useCallback(
    async (rows: NewPantryItem[]) => {
      if (!userId) return [];
      try {
        const saved = await upsertPantryItems(userId, rows);
        setItems((list) => [...list.filter((item) => !saved.some((s) => s.id === item.id)), ...saved]);
        return saved;
      } catch (error) {
        resync();
        throw error;
      }
    },
    [resync, setItems, userId],
  );

  const remove = useCallback(
    async (ids: string[]) => {
      setItems((list) => list.filter((item) => !ids.includes(item.id)));
      try {
        await deletePantryItems(ids);
      } catch (error) {
        resync();
        throw error;
      }
    },
    [resync, setItems],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      setItems((list) => list.map((item) => (item.id === id ? { ...item, name, nameEn: "" } : item)));
      try {
        await renamePantryItem(id, name);
      } catch (error) {
        resync();
        throw error;
      }
    },
    [resync, setItems],
  );

  const move = useCallback(
    async (id: string, place: PantryPlace) => {
      setItems((list) => list.map((item) => (item.id === id ? { ...item, place } : item)));
      try {
        await movePantryItem(id, place);
      } catch (error) {
        resync();
        throw error;
      }
    },
    [resync, setItems],
  );

  return { items, failed: current !== null && current.items === null, reload, add, remove, rename, move };
}
