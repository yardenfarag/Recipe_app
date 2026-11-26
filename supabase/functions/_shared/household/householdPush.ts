// Sending one household push to several people (ADR 034): every phone of every recipient in one Expo call, phones
// that uninstalled the app removed, and a count of the people reached. The database picks the recipients
// (household_push_target): people who turned pushes off (profiles.push_opt_out) or have no phone aren't listed.
import type { Db } from '../core/supabaseAdmin.ts';
import { pickLocale, type EmailLocale } from '../email/copy.ts';
import type { PushMessage, PushResult } from '../nudges/expoPush.ts';
import { HOUSEHOLD_COPY, type HouseholdCopy } from './householdCopy.ts';

/** Where a tap leads in the app. */
export const LIST_PATH = '/list';
export const HOUSEHOLD_PATH = '/settings/household';

export interface PushRecipient {
  user_id: string;
  /** `subject`: the person a member_removed push is about. */
  role: 'member' | 'subject';
  locale: string | null;
  push_tokens: string[];
}

export interface PushText {
  title: string;
  body: string;
  url: string;
}

export type SendPush = (messages: PushMessage[]) => Promise<PushResult>;

/** Reads the recipients a household RPC returned (jsonb), dropping anything malformed. */
export function readRecipients(value: unknown): PushRecipient[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    if (typeof row.user_id !== 'string') return [];
    const tokens = Array.isArray(row.push_tokens) ? row.push_tokens.filter((t): t is string => typeof t === 'string') : [];
    if (tokens.length === 0) return [];
    return [{
      user_id: row.user_id,
      role: row.role === 'subject' ? 'subject' : 'member',
      locale: typeof row.locale === 'string' ? row.locale : null,
      push_tokens: tokens,
    }];
  });
}

/** A member's name for a push line, or the locale's "Someone". */
export function nameOr(copy: HouseholdCopy, name: string | null | undefined, max = 30): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return clean || copy.someone;
}

export function copyFor(locale: string | null): { locale: EmailLocale; copy: HouseholdCopy } {
  const picked = pickLocale(locale);
  return { locale: picked, copy: HOUSEHOLD_COPY[picked] };
}

/**
 * Sends `text(recipient)` to every phone of every recipient. Returns how many people at least one phone reached,
 * and how many phones failed for a reason other than being gone.
 */
export async function pushToRecipients(
  admin: Db,
  sendPush: SendPush,
  recipients: PushRecipient[],
  text: (recipient: PushRecipient) => PushText | null,
): Promise<{ notified: number; failed: number }> {
  const owner = new Map<string, string>();
  const messages: PushMessage[] = [];
  for (const recipient of recipients) {
    const line = text(recipient);
    if (!line) continue;
    for (const to of recipient.push_tokens) {
      owner.set(to, recipient.user_id);
      messages.push({
        to,
        title: line.title,
        body: line.body,
        data: { url: line.url },
        sound: 'default',
        channelId: 'default',
      });
    }
  }
  if (messages.length === 0) return { notified: 0, failed: 0 };

  const result = await sendPush(messages);
  if (result.unregistered.length > 0) {
    const { error } = await admin.from('push_tokens').delete().in('token', result.unregistered);
    if (error) console.error('[household] token cleanup failed', error);
  }
  const reached = new Set(result.ok.map((token) => owner.get(token)).filter((id): id is string => Boolean(id)));
  return { notified: reached.size, failed: result.failed.length };
}
