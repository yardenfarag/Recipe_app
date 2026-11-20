/**
 * Sign-in, sign-up and password calls both apps make the same way. What needs a platform stays in each app:
 * the redirect address, Google's browser hand-off, Apple, and logging (mobile: src/lib/supabase/auth.ts).
 */
import { normalizeEmail } from '../authValidation';
import { parseAuthCallbackParams } from './authCallbackParams';
import { supabase } from './client';

export type AuthAction = 'signin' | 'signup' | 'social' | 'reset' | 'update' | 'code';

/** An auth failure the screen can translate: `code` is Supabase's error code. */
export type AuthError = Error & { code?: string };

type FailureReporter = (action: AuthAction, reason: string) => void;
let reportFailure: FailureReporter = () => {};

/**
 * Lets an app log failed attempts. `reason` is Supabase's error code (e.g. `invalid_credentials`) or `unknown`,
 * never the email or the message.
 */
export function setAuthFailureReporter(reporter: FailureReporter): void {
  reportFailure = reporter;
}

/**
 * Returns `needsConfirmation: true` only when the project still requires a
 * confirmation link. Leave "Confirm email" off so sign-up returns a session
 * in the same step, the same way Google and Apple do.
 * Supabase → Authentication → Providers → Email.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  locale?: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    // Emails (welcome, codes, receipts) go out in this language.
    options: locale ? { data: { locale } } : undefined,
  });
  if (error) throw friendlyAuthError(error, 'signup');
  return { needsConfirmation: !data.session };
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) throw friendlyAuthError(error, 'signin');
}

/**
 * Emails a 6-digit sign-in code (the auth-email function sends it from hello@pinch-app.io).
 * An address without an account gets one, the same as signing up.
 */
export async function sendSignInCode(email: string, locale?: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizeEmail(email),
    options: { shouldCreateUser: true, data: locale ? { locale } : undefined },
  });
  if (error) throw friendlyAuthError(error, 'code');
}

export async function verifySignInCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw friendlyAuthError(error, 'code');
}

/** Signs in with the code from the reset email, so the next step can set a new password. */
export async function verifyResetCode(email: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    email: normalizeEmail(email),
    token: code.trim(),
    type: 'recovery',
  });
  if (error) throw friendlyAuthError(error, 'code');
}

/** Emails a reset code and link. The link returns to `redirectTo`, which must be on Supabase's allow list. */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo });
  if (error) throw friendlyAuthError(error, 'reset');
}

/** Saves the app language on the account, so server emails use it. No-op when it's already saved. */
export async function saveAccountLocale(
  user: { user_metadata?: Record<string, unknown> | null } | null,
  locale: string,
): Promise<void> {
  if (!user || user.user_metadata?.locale === locale) return;
  const { error } = await supabase.auth.updateUser({ data: { locale } });
  if (error) console.warn('[auth] could not save language', error.message);
}

/** Finish OAuth from a callback URL (PKCE code or legacy tokens in the hash). */
export async function completeOAuthFromCallbackUrl(url: string): Promise<void> {
  const parsed = parseAuthCallbackParams(url);
  if (/[?#&]error(_code)?=/.test(url) && !parsed.code) {
    throw new Error('Google sign-in could not be completed. Please try again.');
  }
  if (parsed.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) throw friendlyAuthError(error, 'social');
    return;
  }
  if (!parsed.accessToken || !parsed.refreshToken) {
    throw new Error('Google sign-in did not return a valid session.');
  }
  const { error } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  if (error) throw friendlyAuthError(error, 'social');
}

/** Signs in from the link in a password reset email, so the next step can set a new password. */
export async function consumePasswordRecoveryUrl(url: string): Promise<void> {
  const params = parseAuthCallbackParams(url);

  if (params.tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: 'recovery' });
    if (error) throw friendlyAuthError(error, 'reset');
    return;
  }
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw friendlyAuthError(error, 'reset');
    return;
  }
  if (params.accessToken && params.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) throw friendlyAuthError(error, 'reset');
    return;
  }
  throw new Error('This password reset link is invalid or has expired.');
}

export async function hasSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

export async function updatePassword(password: string): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw friendlyAuthError(sessionError, 'update');

  const email = sessionData.session?.user?.email;
  if (!email) {
    throw new Error('Your reset session expired. Ask for a new reset code and try again.');
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) throw friendlyAuthError(updateError, 'update');

  // Recovery sessions can keep you logged in even when the password did not persist.
  // Re-authenticate with the new password so the next manual sign-in works too.
  await supabase.auth.signOut({ scope: 'local' });
  await signInWithEmail(email, password);
}

export function friendlyAuthError(error: unknown, action: AuthAction): AuthError {
  const code =
    error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code ?? '') : '';
  reportFailure(action, /^[a-z0-9_]{1,60}$/.test(code) ? code : 'unknown');
  const err = friendlyAuthMessage(code, action) as AuthError;
  if (code) err.code = code;
  return err;
}

function friendlyAuthMessage(code: string, action: AuthAction): Error {
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
  if (code === 'otp_expired' || code === 'otp_disabled') {
    return new Error('That code is wrong or has expired. Check the email or ask for a new code.');
  }

  const fallback: Record<AuthAction, string> = {
    signin: 'Sign-in failed. Check your details and try again.',
    signup: "We couldn't create the account. Try signing in or reset your password.",
    social: 'Sign-in could not be completed. Please try again.',
    reset: 'The reset request could not be completed. Please try again.',
    update: 'Your password could not be updated. Request a new reset code and try again.',
    code: 'The code could not be checked. Please try again.',
  };
  return new Error(fallback[action]);
}
