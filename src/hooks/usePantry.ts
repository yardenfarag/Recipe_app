import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { fetchPantryItems } from '@shared/lib/supabase/pantry';
import type { PantryItem } from '@shared/types/pantry';

export type PantryStatus = 'loading' | 'ready' | 'failed';

type Cache = { userId: string; items: PantryItem[] };

let cache: Cache | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** After a screen changed the pantry: every open `usePantry` shows the new list. */
export function setPantryCache(userId: string, items: PantryItem[]): void {
  cache = { userId, items };
  notify();
}

/** The cached pantry of this account, if one was read in this session. */
export function cachedPantry(userId: string | null | undefined): PantryItem[] | null {
  return userId && cache?.userId === userId ? cache.items : null;
}

// Pantry saves in flight on this phone. A refresh from someone else's change waits for them, so it can't bring back
// a row the person just removed, or drop one they just added, before the save lands.
let writesInFlight = 0;
let reloadWaiting: string | null = null;

/** Wraps a pantry save, so a household refresh (another member's change) waits until it is done. */
export async function trackPantryWrite<T>(write: Promise<T>): Promise<T> {
  writesInFlight += 1;
  try {
    return await write;
  } finally {
    writesInFlight -= 1;
    if (writesInFlight === 0 && reloadWaiting) {
      const userId = reloadWaiting;
      reloadWaiting = null;
      void reloadPantryCache(userId);
    }
  }
}

/**
 * Someone in the household changed the pantry (households, PIN-181): re-read it into the shared cache, so every open
 * `usePantry` shows it. Only when this account's pantry was read already; a failed read keeps what is shown.
 */
export async function reloadPantryCache(userId: string): Promise<void> {
  if (cache?.userId !== userId) return;
  if (writesInFlight > 0) {
    reloadWaiting = userId;
    return;
  }
  try {
    const next = await fetchPantryItems();
    // A save started meanwhile wins: it reloads once it lands.
    if (writesInFlight > 0) {
      reloadWaiting = userId;
      return;
    }
    if (cache?.userId === userId) setPantryCache(userId, next);
  } catch {
    // Keep what is shown; the next focus or change reads again.
  }
}

/**
 * The signed-in person's pantry (PIN-181), read when `active` turns true and kept in a small cache that every screen
 * shares. Guests have none: their list is always empty and ready. A failed read keeps what was cached.
 */
export function usePantry(active = true) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<PantryItem[]>(() => cachedPantry(userId) ?? []);
  const [status, setStatus] = useState<PantryStatus>(() =>
    !userId ? 'ready' : cachedPantry(userId) ? 'ready' : 'loading',
  );

  useEffect(() => {
    const listener = () => {
      const next = cachedPantry(userId);
      if (next) setItems(next);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [userId]);

  const reload = useCallback(async (): Promise<PantryItem[] | null> => {
    if (!userId) {
      setItems([]);
      setStatus('ready');
      return [];
    }
    if (!cachedPantry(userId)) setStatus('loading');
    try {
      const next = await fetchPantryItems();
      setPantryCache(userId, next);
      setItems(next);
      setStatus('ready');
      return next;
    } catch {
      setStatus(cachedPantry(userId) ? 'ready' : 'failed');
      return null;
    }
  }, [userId]);

  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);

  const replace = useCallback(
    (next: PantryItem[]) => {
      setItems(next);
      if (userId) setPantryCache(userId, next);
    },
    [userId],
  );

  return { items, status, reload, replace, userId };
}
