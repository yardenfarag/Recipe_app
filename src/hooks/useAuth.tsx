import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { migrateGuestCollectionsToSupabase } from '@/lib/migrateGuestCollections';
import { migrateGuestRecipesToSupabase } from '@/lib/migrateGuestRecipes';
import { migrateGuestShoppingListToSupabase } from '@/lib/migrateGuestShoppingList';
import { supabase } from '@/lib/supabase/client';

export type MigrationStatus = 'idle' | 'running' | 'done' | 'error';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  migrationStatus: MigrationStatus;
  migrationError: string | null;
  retryMigration: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  migrationStatus: 'idle',
  migrationError: null,
  retryMigration: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus>('idle');

  const runMigration = useCallback(async (userId: string) => {
    setMigrationStatus('running');
    try {
      const recipeMigration = await migrateGuestRecipesToSupabase(userId);
      await migrateGuestCollectionsToSupabase(userId, recipeMigration.idMap);
      await migrateGuestShoppingListToSupabase(userId);
      setMigrationError(null);
      setMigrationStatus('done');
    } catch (err) {
      setMigrationError(
        err instanceof Error
          ? err.message
          : 'Could not sync your local data. Try again in Settings.',
      );
      setMigrationStatus('error');
    }
  }, []);

  const retryMigration = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) return;
    await runMigration(userId);
  }, [runMigration, session?.user?.id]);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
        if (!data.session) {
          setMigrationStatus('idle');
          return;
        }
        // Cold start with an existing session never fires SIGNED_IN — still
        // retry guest→cloud sync (no-op when local stores are empty).
        const userId = data.session.user.id;
        setTimeout(() => {
          void runMigration(userId);
        }, 0);
      })
      .catch(() => {
        setSession(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setLoading(false);

      // Migrate guest recipes on fresh sign-in. Deferred out of the callback
      // to avoid the supabase-js "do not call other methods inside the
      // onAuthStateChange callback" deadlock. Idempotent — the local store is
      // cleared after a successful migration, so repeat events are no-ops.
      if (event === 'SIGNED_IN' && nextSession?.user) {
        const userId = nextSession.user.id;
        setTimeout(() => {
          void runMigration(userId);
        }, 0);
      }

      if (event === 'SIGNED_OUT') {
        setMigrationStatus('idle');
        setMigrationError(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [runMigration]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      migrationStatus,
      migrationError,
      retryMigration,
    }),
    [session, loading, migrationStatus, migrationError, retryMigration],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
