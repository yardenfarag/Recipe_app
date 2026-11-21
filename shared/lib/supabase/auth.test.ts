import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  verifyOtp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getSession: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
const functions = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('./client', () => ({ supabase: { auth, functions } }));

import {
  completeOAuthFromCallbackUrl,
  consumePasswordRecoveryUrl,
  deleteAccount,
  friendlyAuthError,
  requestPasswordReset,
  saveAccountLocale,
  setAuthFailureReporter,
  signInWithEmail,
  signUpWithEmail,
  updatePassword,
} from './auth';

describe('shared auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAuthFailureReporter(() => {});
  });

  it('signs in with a trimmed, lower-case email', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await signInWithEmail('  Cook@Example.COM ', 'pass1234');
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'cook@example.com', password: 'pass1234' });
  });

  it('turns Supabase error codes into readable messages and keeps the code', async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: 'invalid_credentials', message: 'x' } });
    await expect(signInWithEmail('a@b.co', 'nope')).rejects.toMatchObject({
      message: 'The email or password is incorrect.',
      code: 'invalid_credentials',
    });
  });

  it('reports failures with the code only, never the email or message', () => {
    const reporter = vi.fn();
    setAuthFailureReporter(reporter);
    friendlyAuthError({ code: 'over_email_send_rate_limit', message: 'cook@example.com' }, 'code');
    friendlyAuthError({ message: 'no code here' }, 'signin');
    friendlyAuthError({ code: 'Weird Code With Spaces' }, 'signup');
    expect(reporter.mock.calls).toEqual([
      ['code', 'over_email_send_rate_limit'],
      ['signin', 'unknown'],
      ['signup', 'unknown'],
    ]);
  });

  it('falls back to a message per action for unknown errors', () => {
    expect(friendlyAuthError(new Error('boom'), 'signup').message).toMatch(/couldn't create the account/);
  });

  it('says a confirmation link is needed only when sign-up returns no session', async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    await expect(signUpWithEmail('a@b.co', 'pass1234', 'he')).resolves.toEqual({ needsConfirmation: true });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'pass1234',
      options: { data: { locale: 'he' } },
    });

    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signUpWithEmail('a@b.co', 'pass1234')).resolves.toEqual({ needsConfirmation: false });
  });

  it('sends reset emails back to the address the app gives', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    await requestPasswordReset('A@B.co', 'https://next.pinch-app.io/app/reset-password');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: 'https://next.pinch-app.io/app/reset-password',
    });
  });

  describe('completeOAuthFromCallbackUrl', () => {
    it('exchanges a PKCE code', async () => {
      auth.exchangeCodeForSession.mockResolvedValue({ error: null });
      await completeOAuthFromCallbackUrl('https://next.pinch-app.io/app/auth-callback?code=abc');
      expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    });

    it('accepts tokens in the hash', async () => {
      auth.setSession.mockResolvedValue({ error: null });
      await completeOAuthFromCallbackUrl('https://x.io/app/auth-callback#access_token=a&refresh_token=r');
      expect(auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    });

    it('fails clearly when Google sent an error or nothing usable', async () => {
      await expect(
        completeOAuthFromCallbackUrl('https://x.io/app/auth-callback?error=access_denied'),
      ).rejects.toThrow(/could not be completed/);
      await expect(completeOAuthFromCallbackUrl('https://x.io/app/auth-callback')).rejects.toThrow(
        /did not return a valid session/,
      );
      expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    });
  });

  it('reads a reset link with a token hash', async () => {
    auth.verifyOtp.mockResolvedValue({ error: null });
    await consumePasswordRecoveryUrl('https://x.io/app/reset-password?token_hash=h&type=recovery');
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'recovery' });
    await expect(consumePasswordRecoveryUrl('https://x.io/app/reset-password')).rejects.toThrow(/invalid or has expired/);
  });

  it('signs in again with the new password after changing it', async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { email: 'a@b.co' } } }, error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    auth.signInWithPassword.mockResolvedValue({ error: null });

    await updatePassword('newpass123');

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newpass123' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'newpass123' });
  });

  it('saves the account language only when it changed', async () => {
    auth.updateUser.mockResolvedValue({ error: null });
    await saveAccountLocale({ user_metadata: { locale: 'he' } }, 'he');
    await saveAccountLocale(null, 'he');
    expect(auth.updateUser).not.toHaveBeenCalled();
    await saveAccountLocale({ user_metadata: {} }, 'es');
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { locale: 'es' } });
  });
});

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the delete-account function, then forgets the session on this device', async () => {
    functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    await deleteAccount();
    expect(functions.invoke).toHaveBeenCalledWith('delete-account', { body: { apple_authorization_code: undefined } });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('passes on the error the function returns, and keeps the session', async () => {
    functions.invoke.mockResolvedValue({ data: { error: 'Nope' }, error: null });
    await expect(deleteAccount()).rejects.toThrow('Nope');
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
