// Support messages (the app's "Help & support" tickets, "Send feedback", and the website's
// "Contact support" form), emailed to support@pinch-app.io.
//
// Replying quotes the whole email, so the body is ONLY what the person wrote. The details we
// need (platform, language, app version, account id) ride in X-Pinch-* headers instead: Gmail
// shows them under ⋮ → Show original, replies never include them, and the admin page has them too.
import { escapeHtml, type RenderedEmail } from './render.ts';

export const SUPPORT_INBOX = 'support@pinch-app.io';

interface Context {
  app_version: string | null;
  build_number: string | null;
  platform: string | null;
  os_version: string | null;
  device_model: string | null;
  locale: string | null;
}

export interface FeedbackRow extends Context {
  id: string;
  user_id: string | null;
  message: string;
  source: 'app' | 'website' | string;
  contact_email: string | null;
  created_at: string;
}

export interface TicketRow extends Partial<Context> {
  id: string;
  user_id: string | null;
  /** What the app sent with the ticket. Not used for the reply: the account's own address is. */
  email: string | null;
  category: string;
  message: string;
  created_at: string;
}

/** One support message, whichever table it came from. */
export interface SupportMessage {
  kind: 'ticket' | 'feedback';
  id: string;
  userId: string | null;
  message: string;
  /** Where to send the answer, or null when they left no email. */
  replyTo: string | null;
  /** Shown in the subject: "Bug", "Feedback", "Website". */
  label: string;
  headers: Record<string, string>;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function validEmail(value: string | null | undefined): string | null {
  const address = (value ?? '').trim();
  return EMAIL_RE.test(address) ? address : null;
}

const CATEGORY_LABELS: Record<string, string> = { bug: 'Bug', billing: 'Billing', account: 'Account', other: 'Other' };

/** X-Pinch-* headers; header values must be one plain line. */
function detailHeaders(entries: [string, string | null | undefined][]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of entries) {
    const clean = (value ?? '').replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '?').trim().slice(0, 200);
    if (clean) headers[`X-Pinch-${name}`] = clean;
  }
  return headers;
}

function contextHeaders(row: Partial<Context>): [string, string | null][] {
  return [
    ['App-Version', [row.app_version, row.build_number && `(${row.build_number})`].filter(Boolean).join(' ') || null],
    ['Platform', [row.platform, row.os_version].filter(Boolean).join(' / ') || null],
    ['Device', row.device_model ?? null],
    ['Language', row.locale ?? null],
  ];
}

/**
 * `accountEmail` is the sender's address from auth.users (null for a visitor, who has no account).
 * Replies go there, never to an address stored in a row the sender can write: profiles.email and
 * support_tickets.email come from the app, so anyone could point our reply at someone else.
 * A website visitor has no account, so the address they typed into the form is all there is.
 */
export function fromFeedback(row: FeedbackRow, accountEmail: string | null = null): SupportMessage {
  const website = row.source === 'website';
  return {
    kind: 'feedback',
    id: row.id,
    userId: row.user_id,
    message: row.message,
    replyTo: row.user_id ? validEmail(accountEmail) : validEmail(row.contact_email),
    label: website ? 'Website' : 'Feedback',
    headers: detailHeaders([
      ['Source', website ? 'website support form' : 'app feedback'],
      ...contextHeaders(row),
      ['Account-Id', row.user_id],
      ['Feedback-Id', row.id],
    ]),
  };
}

export function fromTicket(row: TicketRow, accountEmail: string | null = null): SupportMessage {
  return {
    kind: 'ticket',
    id: row.id,
    userId: row.user_id,
    message: row.message,
    replyTo: validEmail(accountEmail),
    label: CATEGORY_LABELS[row.category] ?? 'Support',
    headers: detailHeaders([
      ['Source', `app support (${row.category})`],
      ...contextHeaders(row),
      ['Account-Id', row.user_id],
      ['Ticket-Id', row.id],
    ]),
  };
}

export function supportSubject(msg: SupportMessage): string {
  const oneLine = msg.message.trim().split(/\s+/).join(' ');
  const preview = oneLine.length > 60 ? `${oneLine.slice(0, 57).trimEnd()}…` : oneLine;
  return `Pinch ${msg.label}: ${preview}`;
}

/** "cook@example.com via Pinch" <hello@pinch-app.io>, so the inbox shows who wrote. */
export function supportFrom(msg: SupportMessage): string {
  const who = (msg.replyTo ?? 'Someone').replace(/["<>\\]/g, '');
  return `"${who} via Pinch" <hello@pinch-app.io>`;
}

/** Just their words: this is what a reply quotes. */
export function renderSupportEmail(msg: SupportMessage): RenderedEmail {
  const subject = supportSubject(msg);
  const message = msg.message.trim();
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body><div dir="auto" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${escapeHtml(message)}</div></body></html>`;
  return { subject, html, text: message };
}
