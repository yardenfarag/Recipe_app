// Unsubscribing from non-essential email (PIN-189, migration 20261125200000_email_opt_out). Every tips or
// reminder email links to pinch-app.io/app/unsubscribe, a page that turns profiles.email_opt_out on through the
// email-preferences function and can turn it back on. Mail apps' own button POSTs to the function directly
// (List-Unsubscribe, RFC 8058). The link is signed with email_unsubscribe_token, so no sign-in is needed.
import type { Db } from '../core/supabaseAdmin.ts';
import { pickLocale, type EmailLocale } from './copy.ts';
import { APP_URL, type EmailUnsubscribe } from './render.ts';

export const UNSUBSCRIBE_PAGE = `${APP_URL}/unsubscribe`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/;

/** The footer link and the one-click address for one account's email. */
export function unsubscribeLinks(
  functionsBase: string,
  userId: string,
  token: string,
  locale: EmailLocale,
): EmailUnsubscribe {
  const page = new URLSearchParams({ u: userId, t: token, l: locale });
  const oneClick = new URLSearchParams({ u: userId, t: token });
  return {
    page: `${UNSUBSCRIBE_PAGE}?${page}`,
    oneClick: `${functionsBase.replace(/\/+$/, '')}/functions/v1/email-preferences?${oneClick}`,
  };
}

/**
 * Sends a browser that opened an unsubscribe address (`?u=&t=&l=`) to the page, which unsubscribes from the
 * browser. A link scanner that only fetches every address in an email unsubscribes no one.
 */
export function redirectToUnsubscribePage(url: URL): Response {
  const params = new URLSearchParams({
    u: url.searchParams.get('u') ?? '',
    t: url.searchParams.get('t') ?? '',
    l: pickLocale(url.searchParams.get('l')),
  });
  return new Response(null, { status: 303, headers: { Location: `${UNSUBSCRIBE_PAGE}?${params}` } });
}

/** The one-click headers (RFC 8058): Gmail and Apple Mail show their own Unsubscribe button for them. */
export function unsubscribeHeaders(unsubscribe: EmailUnsubscribe): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribe.oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

export interface PreferenceRequest {
  userId: string;
  token: string;
  /** true: stop non-essential email. false: send it again. */
  optOut: boolean;
}

/**
 * What a POST to email-preferences asks for. The page sends JSON `{ user_id, token, opt_out }`; a mail app's
 * one-click POST sends `List-Unsubscribe=One-Click` as a form, with the account in the address (`?u=&t=`), and
 * always means unsubscribe. Null when neither carries an account and token.
 */
export function readPreferenceRequest(url: URL, body: string): PreferenceRequest | null {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof json.user_id === 'string' && typeof json.token === 'string' && typeof json.opt_out === 'boolean') {
        return { userId: json.user_id, token: json.token, optOut: json.opt_out };
      }
    } catch {
      // Not JSON after all: fall back to the address.
    }
    return null;
  }
  const userId = url.searchParams.get('u');
  const token = url.searchParams.get('t');
  if (!userId || !token) return null;
  return { userId, token, optOut: true };
}

/**
 * Turns non-essential email off or on for the account when the token matches. False for a malformed or wrong
 * link (nothing changes). Throws when the database fails.
 */
export async function setEmailOptOut(admin: Db, request: PreferenceRequest): Promise<boolean> {
  if (!UUID.test(request.userId) || !TOKEN.test(request.token)) return false;
  const { data, error } = await admin.rpc('email_set_opt_out', {
    p_user_id: request.userId,
    p_token: request.token,
    p_opt_out: request.optOut,
  });
  if (error) throw error;
  return data === true;
}
