// A support message (website "Contact support" or the app's "Send feedback"), emailed to
// support@pinch-app.io with Reply-To set to the sender, so answering is one click. English only:
// it's for the team.
import { escapeHtml, type RenderedEmail } from './render.ts';

export const SUPPORT_INBOX = 'support@pinch-app.io';

export interface FeedbackRow {
  id: string;
  user_id: string | null;
  message: string;
  source: 'app' | 'website' | string;
  contact_email: string | null;
  app_version: string | null;
  build_number: string | null;
  platform: string | null;
  os_version: string | null;
  device_model: string | null;
  locale: string | null;
  created_at: string;
  profile?: { email: string | null } | null;
}

/** Who to answer: the address typed into the website form, else the account's email. */
export function replyAddress(row: FeedbackRow): string | null {
  const address = (row.contact_email || row.profile?.email || '').trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) ? address : null;
}

export function supportSubject(row: FeedbackRow): string {
  const firstLine = row.message.trim().split(/\s+/).join(' ');
  const preview = firstLine.length > 60 ? `${firstLine.slice(0, 57).trimEnd()}…` : firstLine;
  return `Pinch support: ${preview}`;
}

export function renderSupportEmail(row: FeedbackRow): RenderedEmail {
  const reply = replyAddress(row);
  const where = row.source === 'website' ? 'Website support form' : 'App · Send feedback';
  const details: [string, string | null][] = [
    ['From', reply ?? 'No email (can’t reply)'],
    ['Sent from', where],
    ['App version', [row.app_version, row.build_number && `(${row.build_number})`].filter(Boolean).join(' ') || null],
    ['Platform', [row.platform, row.os_version].filter(Boolean).join(' · ') || null],
    ['Device', row.device_model],
    ['Language', row.locale],
    ['Account id', row.user_id],
    ['Received', new Date(row.created_at).toUTCString()],
    ['Feedback id', row.id],
  ];
  const rows = details.filter(([, value]) => value);
  const subject = supportSubject(row);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px 16px;background:#f7f2f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2a1620;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #efe4e8;border-radius:20px;">
<tr><td style="padding:24px 24px 8px;">
  <div style="font-size:13px;font-weight:700;color:#b24f6d;margin-bottom:6px;">💬 ${escapeHtml(where)}</div>
  <div dir="auto" style="font-size:16px;line-height:1.6;white-space:pre-wrap;word-break:break-word;background:#fbe9ef;border-radius:14px;padding:16px;">${escapeHtml(row.message.trim())}</div>
</td></tr>
<tr><td style="padding:12px 24px 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:13px;">
  ${rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#7a6670;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:4px 0;color:#2a1620;word-break:break-all;">${escapeHtml(String(value))}</td></tr>`,
    )
    .join('\n  ')}
  </table>
  <div style="margin-top:14px;font-size:13px;color:#7a6670;">${reply ? 'Hit Reply to answer them.' : 'They didn’t leave an email, so this one can’t be answered.'}</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = [
    where,
    '',
    row.message.trim(),
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');
  return { subject, html, text };
}
