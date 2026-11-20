/**
 * What auth needs on the web beyond the shared calls (shared/lib/supabase/auth.ts): Google through a full-page
 * redirect, reset links that return to this site, and sign-out.
 */
import { friendlyAuthError, requestPasswordReset as requestSharedPasswordReset } from "@shared/lib/supabase/auth";

import { rememberNextPath } from "@/lib/nextPath";
import { authRedirectUrl, getSupabase } from "@/lib/supabase";

/**
 * Leaves for Google and comes back to /app/auth-callback, which finishes sign-in and goes to `next`.
 * A popup loses window.opener on Google's pages, so it can't report back; a redirect is more reliable.
 */
export async function signInWithGoogle(next: string): Promise<never> {
  rememberNextPath(next);
  const { data, error } = await getSupabase().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authRedirectUrl("auth-callback"), skipBrowserRedirect: true },
  });
  if (error) throw friendlyAuthError(error, "social");
  if (!data.url) throw new Error("Google sign-in could not be started. Please try again.");
  window.location.assign(data.url);
  return new Promise<never>(() => {});
}

export async function requestPasswordReset(email: string): Promise<void> {
  await requestSharedPasswordReset(email, authRedirectUrl("reset-password"));
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}
