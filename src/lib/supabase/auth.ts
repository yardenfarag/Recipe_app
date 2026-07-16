import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

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
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
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
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
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
  if (error) throw error;
  if (!data.url) throw new Error('Google sign-in could not be started.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
  });

  if (result.type !== 'success') {
    // User dismissed the browser — not an error worth surfacing.
    return { cancelled: true as const };
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) {
    throw new Error('Google sign-in did not return a valid session.');
  }

  const { error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) throw sessionError;

  return { cancelled: false as const };
}
