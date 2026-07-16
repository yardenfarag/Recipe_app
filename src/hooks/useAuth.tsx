import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { migrateGuestRecipesToSupabase } from '@/lib/migrateGuestRecipes';
import { supabase } from '@/lib/supabase/client';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
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
          migrateGuestRecipesToSupabase(userId).catch(() => {
            // Keep local copies on failure; nothing lost.
          });
        }, 0);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
