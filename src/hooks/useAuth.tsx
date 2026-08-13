import type { Session, User } from '@supabase/supabase-js';
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

import { migrateGuestDataToSupabase } from '@/lib/migrateGuestData';
import { clearPurchasesUser, configurePurchases } from '@/lib/purchases';
import { runSingleFlight } from '@/lib/singleFlight';
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
  const migrationFlights = useRef(new Map<string, Promise<void>>());

  const runMigration = useCallback(async (userId: string) => {
    return runSingleFlight(migrationFlights.current, userId, async () => {
      setMigrationStatus('running');
      try {
        await migrateGuestDataToSupabase(userId);
        setMigrationError(null);
        setMigrationStatus('done');
      } catch (err) {
        console.error('[guest-migration] sync failed', err);
        setMigrationError('migration_failed');
        setMigrationStatus('error');
      }
    });
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

  useEffect(() => {
    if (loading) return;
    if (session?.user.id) {
      void configurePurchases(session.user.id).catch((error) => {
        console.warn('[purchases] configure failed', error);
      });
    } else {
      void clearPurchasesUser().catch((error) => {
        console.warn('[purchases] logout failed', error);
      });
    }
  }, [loading, session?.user.id]);

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
