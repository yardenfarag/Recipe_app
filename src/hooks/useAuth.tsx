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

import { logAuth } from '@/lib/interactionLog';
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

// Who the last auth event was about. supabase-js re-emits SIGNED_IN on token
// refresh and when a web tab regains focus, so only a change of user counts.
let loggedUserId: string | null = null;

function logAuthChange(event: string, nextSession: Session | null) {
  const userId = nextSession?.user.id ?? null;
  if (event === 'INITIAL_SESSION') {
    // Restored session on launch (always the first event): not a login.
    loggedUserId = userId;
    return;
  }
  if (event === 'SIGNED_OUT') {
    loggedUserId = null;
    return;
  }
  if (event !== 'SIGNED_IN' || !nextSession || userId === loggedUserId) return;
  loggedUserId = userId;
  const user = nextSession.user;
  const method = String(user.app_metadata?.provider ?? 'email').replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'email';
  // Supabase has no separate signup event; a brand-new account is a signup.
  const isNew = Date.now() - Date.parse(user.created_at) < 2 * 60_000;
  logAuth(isNew ? 'auth.signup' : 'auth.login', { method });
}

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
      logAuthChange(event, nextSession);

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
