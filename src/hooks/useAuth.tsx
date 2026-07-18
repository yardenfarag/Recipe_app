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

import { migrateGuestRecipesToSupabase } from '@/lib/migrateGuestRecipes';
import { supabase } from '@/lib/supabase/client';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  migrationError: string | null;
  retryMigration: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  migrationError: null,
  retryMigration: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  const runMigration = useCallback(async (userId: string) => {
    try {
      await migrateGuestRecipesToSupabase(userId);
      setMigrationError(null);
    } catch (err) {
      setMigrationError(
        err instanceof Error
          ? err.message
          : 'Could not sync your local recipes. Try again in Settings.',
      );
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
    });

    return () => sub.subscription.unsubscribe();
  }, [runMigration]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      migrationError,
      retryMigration,
    }),
    [session, loading, migrationError, retryMigration],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
