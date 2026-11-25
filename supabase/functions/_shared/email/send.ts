// Sends Pinch emails through Resend's API, from hello@pinch-app.io with replies going to support@.
// Secret: RESEND_API_KEY (a Resend key with sending access to pinch-app.io). A caller may pass
// another key (support-email does), so one kind of email can't use up another's quota.
// Optional secret EMAIL_BCC: where team copies go (see teamCopy), or `none` to stop them.
import type { Db } from '../core/supabaseAdmin.ts';

import type { RenderedEmail } from './render.ts';
import { SUPPORT_INBOX } from './support.ts';

export const EMAIL_FROM = 'Pinch <hello@pinch-app.io>';
export const EMAIL_REPLY_TO = 'support@pinch-app.io';

/**
 * The BCC for a copy of a customer email to the team: EMAIL_BCC when it's an address, none when
 * it's `none`, else support@. Only for welcome, receipt and reminder emails. Never pass it to
 * sign-in codes, password resets or email changes: whoever reads those can open the account.
 */
export function teamCopy(raw: string | null | undefined = Deno.env.get('EMAIL_BCC')): string[] {
  const value = (raw ?? '').trim();
  if (value.toLowerCase() === 'none') return [];
  return [/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : SUPPORT_INBOX];
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Sends one email. `idempotencyKey` makes Resend drop a repeat of the same send for 24 hours,
 * so a retried webhook or hook delivery doesn't email twice. Returns Resend's email id.
 */
export async function sendEmail(
  to: string,
  email: RenderedEmail,
  options: {
    idempotencyKey?: string;
    tags?: Record<string, string>;
    /** Defaults to support@pinch-app.io. */
    replyTo?: string;
    /** Defaults to EMAIL_FROM; must stay an @pinch-app.io address. */
    from?: string;
    /** Extra email headers, e.g. X-Pinch-* details that replies don't quote. */
    headers?: Record<string, string>;
    /** Hidden copies, usually teamCopy(). */
    bcc?: string[];
    /** Defaults to RESEND_API_KEY. */
    apiKey?: string;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<string> {
  const apiKey = options.apiKey || Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new EmailSendError('RESEND_API_KEY is not set', 500);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  // Resend caps the key at 256 characters.
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey.slice(0, 256);

  const response = await (options.fetchImpl ?? fetch)('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: options.from ?? EMAIL_FROM,
      to: [to],
      ...(options.bcc?.length ? { bcc: options.bcc } : {}),
      reply_to: options.replyTo ?? EMAIL_REPLY_TO,
      ...(options.headers && Object.keys(options.headers).length ? { headers: options.headers } : {}),
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: Object.entries(options.tags ?? {}).map(([name, value]) => ({ name, value })),
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : `Resend returned ${response.status}`;
    throw new EmailSendError(message, response.status);
  }
  return typeof body?.id === 'string' ? body.id : '';
}

export type OnceKind = 'welcome' | 'purchase' | 'support';

/**
 * Sends an email at most once per (kind, dedupeKey), using public.email_sends as the record.
 * Returns false when it was already sent. A failed send leaves no row, so the next attempt
 * tries again.
 */
export async function sendOnce(
  admin: Db,
  input: {
    kind: OnceKind;
    dedupeKey: string;
    userId: string | null;
    to: string;
    email: RenderedEmail;
    replyTo?: string;
    from?: string;
    headers?: Record<string, string>;
    bcc?: string[];
    apiKey?: string;
  },
): Promise<boolean> {
  const { data: existing, error: readError } = await admin
    .from('email_sends')
    .select('id')
    .eq('kind', input.kind)
    .eq('dedupe_key', input.dedupeKey)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return false;

  const resendId = await sendEmail(input.to, input.email, {
    idempotencyKey: `${input.kind}/${input.dedupeKey}`,
    tags: { kind: input.kind },
    replyTo: input.replyTo,
    from: input.from,
    headers: input.headers,
    bcc: input.bcc,
    apiKey: input.apiKey,
  });

  const { error: insertError } = await admin.from('email_sends').insert({
    kind: input.kind,
    dedupe_key: input.dedupeKey,
    user_id: input.userId,
    resend_id: resendId || null,
  });
  // 23505: a parallel delivery recorded it first. Resend's idempotency key already dropped ours.
  if (insertError && insertError.code !== '23505') throw insertError;
  return true;
}
