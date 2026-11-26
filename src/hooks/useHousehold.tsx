import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { reloadPantryCache } from '@/hooks/usePantry';
import {
  fetchHousehold,
  HouseholdError,
  setHouseholdStaples,
  subscribeToHousehold,
  type HouseholdChange,
} from '@shared/lib/supabase/household';
import type { Household } from '@shared/types/household';

export type HouseholdStatus = 'signed_out' | 'loading' | 'ready' | 'failed';

/** The shared rows another member can change under this phone: the list and the pantry. */
export type SharedRows = Exclude<HouseholdChange, 'household'>;

type HouseholdContextValue = {
  /** Null when signed out, and until the first read lands. */
  household: Household | null;
  status: HouseholdStatus;
  /** Re-reads the household. With `maxAgeMs`, skips it when the last read is that fresh (focus, foreground). */
  refresh: (options?: { maxAgeMs?: number }) => Promise<Household | null>;
  /** Shows what a call returned (set up, rename, join, leave, remove), without another read. */
  apply: (next: Household) => void;
  /** Replaces "Always have": shown at once, saved in order (the last change wins). */
  setStaples: (next: string[]) => void;
  /** True when the last "Always have" save failed. */
  staplesError: boolean;
  /** Called (debounced) when someone in the household changed the list or the pantry. Returns the unsubscribe. */
  onRemoteChange: (what: SharedRows, listener: () => void) => () => void;
};

const noop = () => {};

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  status: 'signed_out',
  refresh: async () => null,
  apply: noop,
  setStaples: noop,
  staplesError: false,
  onRemoteChange: () => noop,
});

/** Several stamps in a burst (a recipe's worth of list rows) become one re-read. */
const CHANGE_DEBOUNCE_MS = 400;

/**
 * The signed-in person's household (docs/adr/034-households.md), read once and shared by every screen: Settings →
 * Household, the join screen, the list (strip, "Added by") and the pantry ("Always have"). Guests have none.
 *
 * It watches the household for live changes (`subscribeToHousehold`): a change to the household itself re-reads it,
 * and a change to the list or pantry tells the screens showing them to re-read (`useHouseholdChange`), each by its
 * own rules. Coming back to the app does both, since a phone in the background misses live events.
 */
export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [household, setHousehold] = useState<Household | null>(null);
  const [status, setStatus] = useState<HouseholdStatus>('signed_out');
  const [staplesError, setStaplesError] = useState(false);

  const householdRef = useRef<Household | null>(null);
  const userRef = useRef<string | null>(userId);
  userRef.current = userId;
  // The read under way and whose it is: a new account never waits on the previous account's read.
  const inFlight = useRef<{ user: string; run: Promise<Household | null> } | null>(null);
  const lastReadAt = useRef(0);
  const listeners = useRef(new Map<SharedRows, Set<() => void>>());
  const timers = useRef(new Map<HouseholdChange, ReturnType<typeof setTimeout>>());
  // "Always have" saves: the newest list waiting to be saved, the list it was changed from, and whether a save is
  // running. The server applies only the difference, so a staple someone else changed meanwhile is kept.
  const staplesPending = useRef<string[] | null>(null);
  const staplesBase = useRef<string[] | null>(null);
  const staplesSaving = useRef(false);

  const show = useCallback((next: Household | null) => {
    householdRef.current = next;
    setHousehold(next);
  }, []);

  const emit = useCallback(
    (what: SharedRows) => {
      if (what === 'pantry' && userRef.current) void reloadPantryCache(userRef.current);
      for (const listener of listeners.current.get(what) ?? []) listener();
    },
    [],
  );

  const refresh = useCallback(
    async (options?: { maxAgeMs?: number }): Promise<Household | null> => {
      const forUser = userRef.current;
      if (!forUser) return null;
      if (options?.maxAgeMs != null && householdRef.current && Date.now() - lastReadAt.current < options.maxAgeMs) {
        return householdRef.current;
      }
      if (inFlight.current?.user === forUser) return inFlight.current.run;
      // The entry exists before the read starts, so the read can tell whether it is still the current one.
      const entry = { user: forUser } as { user: string; run: Promise<Household | null> };
      entry.run = (async () => {
        if (!householdRef.current) setStatus('loading');
        try {
          const next = await fetchHousehold();
          if (userRef.current !== forUser) return null;
          lastReadAt.current = Date.now();
          // An "Always have" save on its way wins over what the server had a moment ago.
          const local = householdRef.current;
          const merged =
            (staplesSaving.current || staplesPending.current) && local && local.id === next.id
              ? { ...next, staples: local.staples }
              : next;
          show(merged);
          setStatus('ready');
          return merged;
        } catch (err) {
          if (userRef.current !== forUser) return null;
          if (err instanceof HouseholdError && err.code === 'not_signed_in') {
            show(null);
            setStatus('signed_out');
            return null;
          }
          // A failed re-read keeps what is shown.
          setStatus(householdRef.current ? 'ready' : 'failed');
          return householdRef.current;
        } finally {
          if (inFlight.current === entry) inFlight.current = null;
        }
      })();
      inFlight.current = entry;
      return entry.run;
    },
    [show],
  );

  const schedule = useCallback(
    (what: HouseholdChange) => {
      const existing = timers.current.get(what);
      if (existing) clearTimeout(existing);
      timers.current.set(
        what,
        setTimeout(() => {
          timers.current.delete(what);
          if (what === 'household') void refresh();
          else emit(what);
        }, CHANGE_DEBOUNCE_MS),
      );
    },
    [emit, refresh],
  );

  const apply = useCallback(
    (next: Household) => {
      const before = householdRef.current;
      lastReadAt.current = Date.now();
      show(next);
      setStatus('ready');
      // Joined or left: the list and pantry on screen belong to the old household now.
      if (before && before.id !== next.id) {
        schedule('list');
        schedule('pantry');
      }
    },
    [schedule, show],
  );

  // Sign in, sign out, another account.
  useEffect(() => {
    if (authLoading) return;
    staplesPending.current = null;
    staplesBase.current = null;
    setStaplesError(false);
    if (!userId) {
      show(null);
      setStatus('signed_out');
      return;
    }
    show(null);
    setStatus('loading');
    lastReadAt.current = 0;
    void refresh();
  }, [authLoading, refresh, show, userId]);

  // Live changes from the other members (and this phone's own saves, which are harmless re-reads).
  const householdId = household?.id ?? null;
  useEffect(() => {
    if (!userId || !householdId) return;
    return subscribeToHousehold(householdId, schedule);
  }, [householdId, schedule, userId]);

  // Back from the background: live events may have been missed.
  useEffect(() => {
    if (!userId) return;
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous.match(/inactive|background/) && next === 'active') {
        void refresh({ maxAgeMs: 5_000 });
        schedule('list');
        schedule('pantry');
      }
      previous = next;
    });
    return () => subscription.remove();
  }, [refresh, schedule, userId]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const saveStaples = useCallback(async () => {
    if (staplesSaving.current) return;
    staplesSaving.current = true;
    try {
      while (staplesPending.current) {
        const toSave = staplesPending.current;
        const base = staplesBase.current ?? undefined;
        staplesPending.current = null;
        staplesBase.current = null;
        const saved = await setHouseholdStaples(toSave, base);
        const current = householdRef.current;
        // Only show the server's cleaned-up list when nothing newer is waiting.
        if (!staplesPending.current && current) show({ ...current, staples: saved });
      }
      setStaplesError(false);
    } catch {
      staplesPending.current = null;
      staplesBase.current = null;
      setStaplesError(true);
      staplesSaving.current = false;
      void refresh();
      return;
    }
    staplesSaving.current = false;
  }, [refresh, show]);

  const setStaples = useCallback(
    (next: string[]) => {
      const current = householdRef.current;
      if (!current) return;
      // Changes waiting together are one difference from the list shown before the first of them.
      if (!staplesPending.current) staplesBase.current = current.staples;
      show({ ...current, staples: next });
      staplesPending.current = next;
      void saveStaples();
    },
    [saveStaples, show],
  );

  const onRemoteChange = useCallback((what: SharedRows, listener: () => void) => {
    let set = listeners.current.get(what);
    if (!set) {
      set = new Set();
      listeners.current.set(what, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }, []);

  const value = useMemo<HouseholdContextValue>(
    () => ({ household, status, refresh, apply, setStaples, staplesError, onRemoteChange }),
    [apply, household, onRemoteChange, refresh, setStaples, staplesError, status],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

/** The household and its actions. See HouseholdProvider. */
export function useHousehold() {
  return useContext(HouseholdContext);
}

/** Runs `listener` when someone in the household changed the list or the pantry (debounced). */
export function useHouseholdChange(what: SharedRows, listener: () => void) {
  const { onRemoteChange } = useHousehold();
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => onRemoteChange(what, () => latest.current()), [onRemoteChange, what]);
}
