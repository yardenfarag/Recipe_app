"use client";

import type { Session, User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { createAuthActivityTracker } from "@shared/lib/authActivity";

import { logAuth, setActivityAuth } from "@/lib/activity/activityLog";
import { getSupabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the stored session has been read. Don't redirect before then. */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true });

// Logins and signups for the activity log, with the mobile app's rules (shared/lib/authActivity.ts, ADR 020).
const authActivity = createAuthActivityTracker();

/** Holds the signed-in session for every page. Signed-in screens render in the browser (ADR 026). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setActivityAuth(data.session ? { accessToken: data.session.access_token } : null);
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });

    // Also fires when another tab signs in or out.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Before the login is logged, so its row belongs to the account.
      setActivityAuth(next ? { accessToken: next.access_token } : null);
      const activity = authActivity(event, next);
      // A sign-in in another tab reaches this one too; only the tab where it happened logs it.
      if (activity && document.visibilityState !== "hidden") logAuth(activity.name, activity.properties);
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ session, user: session?.user ?? null, loading }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
