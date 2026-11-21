/**
 * Which auth state changes the activity log records as a login or a signup (ADR 020). Both apps feed it every
 * `onAuthStateChange` event: the mobile app in src/hooks/useAuth.tsx, the web app in web/components/AuthProvider.tsx.
 *
 * supabase-js re-emits SIGNED_IN on token refresh and when a web tab regains focus, and a restored session at launch
 * is not a login, so only a change of user counts. Supabase has no signup event: an account made in the last two
 * minutes counts as a signup. Only the provider is kept (`method`), never the email.
 */

export type AuthChangeSession = {
  user: { id: string; created_at: string; app_metadata?: { provider?: unknown } | null };
} | null;

export type AuthActivity = { name: 'auth.signup' | 'auth.login'; properties: { method: string } };

const SIGNUP_WINDOW_MS = 2 * 60_000;

/** Tracks who the last auth event was about, and says what to log for the next one (or nothing). */
export function createAuthActivityTracker(now: () => number = Date.now) {
  let loggedUserId: string | null = null;
  return function onAuthChange(event: string, session: AuthChangeSession): AuthActivity | null {
    const userId = session?.user.id ?? null;
    if (event === 'INITIAL_SESSION') {
      // Restored session on launch (always the first event): not a login.
      loggedUserId = userId;
      return null;
    }
    if (event === 'SIGNED_OUT') {
      loggedUserId = null;
      return null;
    }
    if (event !== 'SIGNED_IN' || !session || userId === loggedUserId) return null;
    loggedUserId = userId;
    const method =
      String(session.user.app_metadata?.provider ?? 'email').replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'email';
    const isNew = now() - Date.parse(session.user.created_at) < SIGNUP_WINDOW_MS;
    return { name: isNew ? 'auth.signup' : 'auth.login', properties: { method } };
  };
}
