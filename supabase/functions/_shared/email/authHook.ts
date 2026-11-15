// Supabase Auth's Send Email Hook hands us each auth email to send instead of sending its own.
// This turns one hook payload into the branded emails to send, so it can be tested without a network.
// Payload: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
import { pickLocale } from './copy.ts';
import { renderCodeEmail, renderEmailChangeEmail, renderResetEmail, type RenderedEmail } from './render.ts';

export interface AuthHookPayload {
  user: {
    id: string;
    email?: string | null;
    new_email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  };
  email_data: {
    token?: string;
    token_hash?: string;
    redirect_to?: string;
    email_action_type: string;
    site_url?: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

export interface OutgoingEmail {
  to: string;
  email: RenderedEmail;
}

export function isAuthHookPayload(value: unknown): value is AuthHookPayload {
  const v = value as AuthHookPayload | null;
  return Boolean(
    v &&
      typeof v === 'object' &&
      v.user &&
      typeof v.user.id === 'string' &&
      v.email_data &&
      typeof v.email_data.email_action_type === 'string',
  );
}

/** Supabase's own verify endpoint, which then redirects to redirect_to with a session. */
export function verifyLink(supabaseUrl: string, tokenHash: string, type: string, redirectTo?: string): string {
  const url = new URL('/auth/v1/verify', supabaseUrl);
  url.searchParams.set('token', tokenHash);
  url.searchParams.set('type', type);
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo);
  return url.toString();
}

export function emailsForAuthHook(payload: AuthHookPayload, supabaseUrl: string): OutgoingEmail[] {
  const { user, email_data: data } = payload;
  const locale = pickLocale(user.user_metadata?.locale);
  const type = data.email_action_type;
  const email = (user.email ?? '').trim();
  const token = (data.token ?? '').trim();

  switch (type) {
    // signInWithOtp: "magiclink" for an existing account, "signup" when it creates one.
    case 'magiclink':
    case 'signup':
    case 'invite':
    case 'email':
      if (!email || !token) return [];
      return [{ to: email, email: renderCodeEmail({ locale, code: token, purpose: 'signin' }) }];

    case 'reauthentication':
      if (!email || !token) return [];
      return [{ to: email, email: renderCodeEmail({ locale, code: token, purpose: 'reauth' }) }];

    case 'recovery': {
      if (!email || !token || !data.token_hash) return [];
      const link = verifyLink(supabaseUrl, data.token_hash, 'recovery', data.redirect_to);
      return [{ to: email, email: renderResetEmail({ locale, code: token, link }) }];
    }

    case 'email_change': {
      // With "Secure email change" on, both addresses confirm. Supabase pairs token_hash with
      // the new address and token_hash_new with the current one.
      const out: OutgoingEmail[] = [];
      const newEmail = (user.new_email ?? '').trim();
      if (newEmail && data.token_hash) {
        const link = verifyLink(supabaseUrl, data.token_hash, 'email_change', data.redirect_to);
        out.push({ to: newEmail, email: renderEmailChangeEmail({ locale, link }) });
      }
      if (email && data.token_hash_new) {
        const link = verifyLink(supabaseUrl, data.token_hash_new, 'email_change', data.redirect_to);
        out.push({ to: email, email: renderEmailChangeEmail({ locale, link }) });
      }
      return out;
    }

    default:
      return [];
  }
}
