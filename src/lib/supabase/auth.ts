import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { normalizeEmail } from '@/lib/authValidation';
import { supabase } from '@/lib/supabase/client';

WebBrowser.maybeCompleteAuthSession();

/**
 * Returns `needsConfirmation: true` when the project has email confirmation
 * enabled — in that case no session is created until the user clicks the link
 * in their inbox. For fast MVP testing, disable "Confirm email" in
 * Supabase → Authentication → Providers → Email.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw friendlyAuthError(error, 'signup');
  return { needsConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw friendlyAuthError(error, 'signin');
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
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

/**
 * Google OAuth via the system browser.
 *
 * NOTE: In Expo Go the redirect uses the `exp://` proxy scheme, which is
 * flaky — you may need `npx expo start --tunnel` and the redirect URL
 * registered in the Supabase dashboard. Reliable deep-linking with the
 * `pinch://` scheme requires a dev build (Phase 3, ADR 007).
 */
export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri({ scheme: 'pinch', path: 'auth-callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw friendlyAuthError(error, 'social');
  if (!data.url) throw new Error('Google sign-in could not be started. Please try again.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
  });

  if (result.type !== 'success') {
    // User dismissed the browser — not an error worth surfacing.
    return { cancelled: true as const };
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error('Google sign-in could not be completed. Please try again.');

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) {
    throw new Error('Google sign-in did not return a valid session.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) throw friendlyAuthError(sessionError, 'social');

  return { cancelled: false as const };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = Linking.createURL('reset-password');
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo,
  });
  if (error) throw friendlyAuthError(error, 'reset');
}

export async function consumePasswordRecoveryUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const code = query.get('code') ?? hash.get('code');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw friendlyAuthError(error, 'reset');
    return;
  }

  const accessToken = query.get('access_token') ?? hash.get('access_token');
  const refreshToken = query.get('refresh_token') ?? hash.get('refresh_token');
  if (!accessToken || !refreshToken) {
    throw new Error('This password reset link is invalid or has expired.');
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw friendlyAuthError(error, 'reset');
}

export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw friendlyAuthError(error, 'update');
}

type AuthAction = 'signin' | 'signup' | 'social' | 'reset' | 'update';

function friendlyAuthError(error: unknown, action: AuthAction): Error {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  if (code === 'invalid_credentials') {
    return new Error('The email or password is incorrect.');
  }
  if (code === 'email_not_confirmed') {
    return new Error('Confirm your email before signing in.');
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return new Error('Too many attempts. Wait a few minutes and try again.');
  }
  if (code === 'weak_password') {
    return new Error('Choose a stronger password with at least 8 characters, a letter, and a number.');
  }
  if (code === 'same_password') {
    return new Error('Choose a password you have not used for this account.');
  }

  const fallback: Record<AuthAction, string> = {
    signin: 'Sign-in failed. Check your details and try again.',
    signup: "We couldn't create the account. Try signing in or reset your password.",
    social: 'Sign-in could not be completed. Please try again.',
    reset: 'The reset request could not be completed. Please try again.',
    update: 'Your password could not be updated. Request a new reset link and try again.',
  };
  return new Error(fallback[action]);
}
