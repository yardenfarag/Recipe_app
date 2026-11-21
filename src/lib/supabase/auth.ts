/**
 * The mobile app's auth: the shared calls (shared/lib/supabase/auth.ts) plus what needs the device —
 * Apple, Google through the system browser, the pinch:// redirect, and logging.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { authRedirectUri } from '@/lib/authRedirect';
import { flushInteractions, logAuth } from '@/lib/interactionLog';
import { supabase } from '@/lib/supabase/client';
import {
  completeOAuthFromCallbackUrl as completeSharedOAuth,
  friendlyAuthError,
  requestPasswordReset as requestSharedPasswordReset,
  setAuthFailureReporter,
} from '@shared/lib/supabase/auth';

export {
  consumePasswordRecoveryUrl,
  deleteAccount,
  hasSession,
  saveAccountLocale,
  sendSignInCode,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
  verifyResetCode,
  verifySignInCode,
  type AuthError,
} from '@shared/lib/supabase/auth';

WebBrowser.maybeCompleteAuthSession();

// Supabase's error code only (e.g. invalid_credentials), never the email or message.
setAuthFailureReporter((action, reason) => logAuth(`auth.${action}_failed`, { reason }));

export async function signOut() {
  // Log and send before the session goes, so these rows stay with the account.
  logAuth('auth.logout');
  await flushInteractions().catch(() => {});
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** True when the current session includes an Apple identity. */
export function userHasAppleIdentity(user: {
  identities?: { provider: string }[] | null;
  app_metadata?: { provider?: string; providers?: string[] } | null;
} | null): boolean {
  if ((user?.identities ?? []).some((id) => id.provider === 'apple')) return true;
  const meta = user?.app_metadata;
  if (meta?.provider === 'apple') return true;
  if (Array.isArray(meta?.providers) && meta.providers.includes('apple')) return true;
  return false;
}

/**
 * Re-prompts Sign in with Apple to obtain an authorization code for token revoke
 * during account deletion.
 */
export async function requestAppleAuthorizationCodeForDeletion(): Promise<string | null> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  return credential.authorizationCode ?? null;
}

/** Whether the native "Sign in with Apple" button should be shown (iOS only). */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

export async function signInWithApple() {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple sign-in could not be completed. Please try again.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw friendlyAuthError(error, 'social');
}

/** Finish OAuth from a callback URL (PKCE code or legacy token hash). */
export async function completeOAuthFromCallbackUrl(url: string): Promise<void> {
  const { errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error('Google sign-in could not be completed. Please try again.');
  await completeSharedOAuth(url);
}

/**
 * Google OAuth via the system browser.
 *
 * NOTE: In Expo Go the redirect uses the `exp://` proxy scheme, which is
 * flaky — you may need `npx expo start --tunnel` and the redirect URL
 * registered in the Supabase dashboard. Reliable deep-linking with the
 * `pinch://` scheme requires a dev build (Phase 3, ADR 007).
 */
export async function signInWithGoogle() {
  const redirectTo = authRedirectUri('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw friendlyAuthError(error, 'social');
  if (!data.url) throw new Error('Google sign-in could not be started. Please try again.');

  // Web: leave the page and come back to /app/auth-callback, which exchanges the code.
  // A popup loses window.opener on Google's pages, so it can't report back.
  if (Platform.OS === 'web') {
    window.location.assign(data.url);
    return new Promise<never>(() => {});
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
  });

  if (result.type !== 'success') {
    // User dismissed the browser — not an error worth surfacing.
    return { cancelled: true as const };
  }

  await completeOAuthFromCallbackUrl(result.url);
  return { cancelled: false as const };
}

export async function requestPasswordReset(email: string): Promise<void> {
  await requestSharedPasswordReset(email, authRedirectUri('reset-password'));
}
