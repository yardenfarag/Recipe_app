import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './client';

/**
 * Which messages an account gets besides the essential ones (PIN-189). `emailOptOut`: no tips or reminders by email
 * (sign-in codes, password resets and receipts always arrive). `pushOptOut`: no reminder notifications on phones.
 * Both live on the profile (migration 20261125200000_email_opt_out). Settings writes them directly, under RLS.
 */
export interface MessagePreferences {
  emailOptOut: boolean;
  pushOptOut: boolean;
}

export async function fetchMessagePreferences(userId: string): Promise<MessagePreferences> {
  const { data, error } = await supabase
    .from('profiles')
    .select('email_opt_out, push_opt_out')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return { emailOptOut: data?.email_opt_out === true, pushOptOut: data?.push_opt_out === true };
}

export async function saveMessagePreference(
  userId: string,
  key: keyof MessagePreferences,
  value: boolean,
): Promise<void> {
  const change = key === 'emailOptOut' ? { email_opt_out: value } : { push_opt_out: value };
  const { error } = await supabase.from('profiles').update(change).eq('id', userId);
  if (error) throw error;
}

/** The account and signed token from an unsubscribe link (`?u=&t=`), as the email sent them. */
export interface UnsubscribeLink {
  userId: string;
  token: string;
}

/** Reads an unsubscribe link's address, or null when it has no account or token. */
export function readUnsubscribeLink(params: { get(name: string): string | null }): UnsubscribeLink | null {
  const userId = params.get('u')?.trim() ?? '';
  const token = params.get('t')?.trim() ?? '';
  return userId && token ? { userId, token } : null;
}

/** `invalid_link`: the link is wrong or for an account that's gone, so retrying won't help. */
export type UnsubscribeResult = 'ok' | 'invalid_link' | 'failed';

/**
 * Turns non-essential email off (`optOut` true) or back on from an unsubscribe link, without signing in, through
 * the email-preferences function.
 */
export async function setEmailOptOutFromLink(link: UnsubscribeLink, optOut: boolean): Promise<UnsubscribeResult> {
  const { data, error } = await supabase.functions.invoke<{ status?: string }>('email-preferences', {
    body: { user_id: link.userId, token: link.token, opt_out: optOut },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { code?: string };
        if (body?.code === 'invalid_link') return 'invalid_link';
      } catch {
        // No JSON answer: a plain failure.
      }
    }
    return 'failed';
  }
  return data?.status === 'ok' ? 'ok' : 'failed';
}
