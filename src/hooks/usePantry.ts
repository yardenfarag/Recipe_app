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
