"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { deletePantryItems, fetchPantryItems, movePantryItem, renamePantryItem, upsertPantryItems, type NewPantryItem } from "@shared/lib/supabase/pantry";
import type { PantryItem, PantryPlace } from "@shared/types/pantry";

import { useAuth } from "@/components/AuthProvider";
import { useHouseholdLive } from "@/lib/household/HouseholdProvider";

type Loaded = { userId: string; items: PantryItem[] | null };

/**
 * The household's pantry (PIN-181, ADR 034): what is at home, by place. Changes show at once and are saved
 * straight away; a failed save puts the list back as the server has it, and the caller says so. When someone else
 * in the household changes it, it is read again (after any save of ours in flight).
 * `items` is null while loading and when it couldn't be read (`failed`).
 */
export function usePantry() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Saves in flight. A read that lands meanwhile could bring back what was just changed, so it waits. */
  const pending = useRef(0);
  const stale = useRef(false);

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

  /** Reads the server's list in the background. A failed read keeps what is on screen. */
  const resync = useCallback(() => {
    if (!userId) return;
    void read(userId).then((next) => {
      if (pending.current > 0) {
        stale.current = true;
        return;
      }
      setLoaded((previous) => (next.items === null && previous?.items && previous.userId === next.userId ? previous : next));
    });
  }, [read, userId]);

  useHouseholdLive("pantry", () => {
    if (pending.current > 0) stale.current = true;
    else resync();
  });

  /** Runs a save. If it fails, or someone changed the pantry meanwhile, the list is read again after it. */
  const saving = useCallback(
    async <T>(work: () => Promise<T>): Promise<T> => {
      pending.current += 1;
      try {
        return await work();
      } catch (error) {
        stale.current = true;
        throw error;
      } finally {
        pending.current -= 1;
        if (pending.current === 0 && stale.current) {
          stale.current = false;
          resync();
        }
      }
    },
    [resync],
  );

  const setItems = useCallback(
    (edit: (items: PantryItem[]) => PantryItem[]) =>
      setLoaded((previous) => (previous?.items && previous.userId === userId ? { ...previous, items: edit(previous.items) } : previous)),
    [userId],
  );

  const add = useCallback(
    (rows: NewPantryItem[]) =>
      saving(async () => {
        if (!userId) return [];
        const saved = await upsertPantryItems(userId, rows);
        setItems((list) => [...list.filter((item) => !saved.some((s) => s.id === item.id)), ...saved]);
        return saved;
      }),
    [saving, setItems, userId],
  );

  const remove = useCallback(
    (ids: string[]) =>
      saving(async () => {
        setItems((list) => list.filter((item) => !ids.includes(item.id)));
        await deletePantryItems(ids);
      }),
    [saving, setItems],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      saving(async () => {
        setItems((list) => list.map((item) => (item.id === id ? { ...item, name, nameEn: "" } : item)));
        await renamePantryItem(id, name);
      }),
    [saving, setItems],
  );

  const move = useCallback(
    (id: string, place: PantryPlace) =>
      saving(async () => {
        setItems((list) => list.map((item) => (item.id === id ? { ...item, place } : item)));
        await movePantryItem(id, place);
      }),
    [saving, setItems],
  );

  return { items, failed: current !== null && current.items === null, reload, add, remove, rename, move };
}
