// The two reminders for new accounts (migration 20261122191000_nudges): what each one says and
// opens, and one run of the cron job that sends them by push and by email.
import type { Db } from '../core/supabaseAdmin.ts';
import { fill, pickLocale, type EmailLocale } from '../email/copy.ts';
import { NUDGE_COPY, type NudgeKind } from '../email/nudgeCopy.ts';
import { APP_URL, renderNudgeEmail, type RenderedEmail } from '../email/render.ts';
import type { PushMessage, PushResult } from './expoPush.ts';

export const NUDGE_KINDS: readonly NudgeKind[] = ['day1', 'day3'];

export interface NudgeCandidate {
  user_id: string;
  email: string | null;
  locale: string | null;
  recipe_id: string | null;
  recipe_title: string | null;
  unsubscribe_token: string | null;
  push_tokens: string[] | null;
  email_sent: boolean;
  push_sent: boolean;
}

/** A recipe title short enough for a push line and a subject. */
export function shortTitle(title: string | null | undefined, max = 48): string {
  const clean = (title ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Where the nudge leads: an app path for the push, the same page on the web for the email. */
export function nudgeTarget(kind: NudgeKind, recipeId: string | null): { path: string; web: string } | null {
  if (kind === 'day1') return { path: '/add', web: `${APP_URL}/add` };
  if (!recipeId) return null;
  const path = `/recipe/${encodeURIComponent(recipeId)}`;
  return { path, web: `${APP_URL}${path}` };
}

export function unsubscribeUrl(functionsBase: string, userId: string, token: string, locale: EmailLocale): string {
  const params = new URLSearchParams({ u: userId, t: token, l: locale });
  return `${functionsBase.replace(/\/+$/, '')}/functions/v1/nudges?${params}`;
}

export function pushMessages(
  kind: NudgeKind,
  locale: EmailLocale,
  title: string,
  path: string,
  tokens: string[],
): PushMessage[] {
  const c = NUDGE_COPY[locale][kind];
  return tokens.map((to) => ({
    to,
    title: fill(c.pushTitle, { title }),
    body: fill(c.pushBody, { title }),
    data: { url: path },
    sound: 'default',
    channelId: 'default',
  }));
}

export interface NudgeDeps {
  admin: Db;
  /** Base URL of the Supabase project (SUPABASE_URL), for the unsubscribe link. */
  functionsBase: string;
  sendEmail: (
    to: string,
    email: RenderedEmail,
    options: { idempotencyKey: string; tags: Record<string, string>; headers: Record<string, string> },
  ) => Promise<string>;
  sendPush: (messages: PushMessage[]) => Promise<PushResult>;
  /** Waits between emails (Resend allows 2 requests a second). */
  pause?: () => Promise<void>;
  limit?: number;
}

export interface NudgeRunResult {
  email: number;
  push: number;
  failed: number;
}

async function recordSent(admin: Db, userId: string, kind: NudgeKind, channel: 'push' | 'email'): Promise<void> {
  const { error } = await admin.from('nudge_sends').insert({ user_id: userId, kind, channel });
  // 23505: a parallel run recorded it first.
  if (error && error.code !== '23505') throw error;
}

/** One cron run: every due nudge, each channel at most once per account. */
export async function runNudges(deps: NudgeDeps): Promise<NudgeRunResult> {
  const totals: NudgeRunResult = { email: 0, push: 0, failed: 0 };
  for (const kind of NUDGE_KINDS) {
    const { data, error } = await deps.admin.rpc('nudge_candidates', { p_kind: kind, p_limit: deps.limit ?? 50 });
    if (error) throw error;
    for (const row of (data ?? []) as NudgeCandidate[]) {
      const target = nudgeTarget(kind, row.recipe_id);
      if (!target) continue;
      const locale = pickLocale(row.locale);
      const title = shortTitle(row.recipe_title);

      const tokens = row.push_tokens ?? [];
      if (!row.push_sent && tokens.length > 0) {
        try {
          const result = await deps.sendPush(pushMessages(kind, locale, title, target.path, tokens));
          if (result.unregistered.length > 0) {
            const { error: deleteError } = await deps.admin.from('push_tokens').delete().in('token', result.unregistered);
            if (deleteError) console.error('[nudges] token cleanup failed', deleteError);
          }
          if (result.ok.length > 0) {
            await recordSent(deps.admin, row.user_id, kind, 'push');
            totals.push++;
          } else if (result.failed.length > 0) {
            totals.failed++;
          }
        } catch (err) {
          totals.failed++;
          console.error('[nudges] push failed', row.user_id, err);
        }
      }

      if (!row.email_sent && row.email && row.unsubscribe_token) {
        try {
          const unsubscribe = unsubscribeUrl(deps.functionsBase, row.user_id, row.unsubscribe_token, locale);
          const email = renderNudgeEmail({ locale, kind, title, link: target.web, unsubscribeUrl: unsubscribe });
          await deps.sendEmail(row.email, email, {
            idempotencyKey: `nudge-${kind}/${row.user_id}`,
            tags: { kind: `nudge_${kind}` },
            // One-click unsubscribe (RFC 8058): Gmail and Apple Mail show their own button for it.
            headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          });
          await recordSent(deps.admin, row.user_id, kind, 'email');
          totals.email++;
          if (deps.pause) await deps.pause();
        } catch (err) {
          // Left for the next run; one bad address mustn't block the rest.
          totals.failed++;
          console.error('[nudges] email failed', row.user_id, err);
        }
      }
    }
  }
  return totals;
}
