// Emails each new support message to support@pinch-app.io. Triggers on public.support_tickets
// ("Help & support" in the app) and public.feedback ("Send feedback", and the website's "Contact
// support" form) call this with the row id and a Vault secret; the message itself is read here,
// so a forged call can't make one up. Reply-To is the sender's account address (auth.users), or
// for a website visitor the address they typed. The body is only their words.
// Secrets: RESEND_SUPPORT_API_KEY, falling back to RESEND_API_KEY. A key of its own means a flood
// of support messages can't use up the key that sends sign-in codes. The triggers' secret lives
// in Vault (support_email_secret).
import { handler, HttpError } from '../_shared/core/handler.ts';
import { sendOnce } from '../_shared/email/send.ts';
import {
  fromFeedback,
  fromTicket,
  renderSupportEmail,
  supportFrom,
  SUPPORT_INBOX,
  type FeedbackRow,
  type SupportMessage,
  type TicketRow,
} from '../_shared/email/support.ts';
import type { Db } from '../_shared/core/supabaseAdmin.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTEXT = 'app_version, build_number, platform, os_version, device_model, locale';
const invalidId = HttpError.legacy(400, 'Invalid id');

/** `{ ticket_id }` or `{ feedback_id }`, a uuid. Anything else, unreadable JSON included, is 'Invalid id'. */
function parseIds(body: unknown): { ticketId: string | null; feedbackId: string | null } {
  const b = body as { ticket_id?: unknown; feedback_id?: unknown } | null;
  const ticketId = typeof b?.ticket_id === 'string' && UUID.test(b.ticket_id) ? b.ticket_id : null;
  const feedbackId = typeof b?.feedback_id === 'string' && UUID.test(b.feedback_id) ? b.feedback_id : null;
  if (!ticketId && !feedbackId) throw invalidId;
  return { ticketId, feedbackId };
}

handler(
  {
    name: 'support-email',
    auth: 'secret',
    secret: { header: 'x-support-email-secret', rpc: 'support_email_secret_matches' },
    // Called by database triggers only; it never answered OPTIONS.
    cors: false,
    legacyErrorShape: true,
    // It used req.json().catch(() => null), so an empty or broken body was just a missing id.
    errors: { misconfigured: HttpError.legacy(500, 'Server is not configured'), invalidJson: invalidId },
    input: parseIds,
  },
  async ({ input: { ticketId, feedbackId }, admin }) => {
    let msg: SupportMessage;
    if (ticketId) {
      const { data, error } = await admin
        .from('support_tickets')
        .select(`id, user_id, email, category, message, created_at, ${CONTEXT}`)
        .eq('id', ticketId)
        .maybeSingle();
      if (error) {
        console.error('[support-email] could not read ticket', ticketId, error);
        throw HttpError.legacy(500, 'Could not read ticket');
      }
      if (!data) throw HttpError.legacy(404, 'Not found');
      const row = data as unknown as TicketRow;
      msg = fromTicket(row, await accountEmail(admin, row.user_id));
    } else {
      const { data, error } = await admin
        .from('feedback')
        .select(`id, user_id, message, source, contact_email, created_at, ${CONTEXT}`)
        .eq('id', feedbackId!)
        .maybeSingle();
      if (error) {
        console.error('[support-email] could not read feedback', feedbackId, error);
        throw HttpError.legacy(500, 'Could not read feedback');
      }
      if (!data) throw HttpError.legacy(404, 'Not found');
      const row = data as unknown as FeedbackRow;
      msg = fromFeedback(row, await accountEmail(admin, row.user_id));
    }

    try {
      const sent = await sendOnce(admin, {
        kind: 'support',
        // Feedback keys stay the bare id, as the first version of this function wrote them.
        dedupeKey: msg.kind === 'ticket' ? `ticket:${msg.id}` : msg.id,
        userId: msg.userId,
        to: SUPPORT_INBOX,
        email: renderSupportEmail(msg),
        replyTo: msg.replyTo ?? undefined,
        from: supportFrom(msg),
        headers: msg.headers,
        apiKey: Deno.env.get('RESEND_SUPPORT_API_KEY') || undefined,
      });
      return { sent };
    } catch (err) {
      console.error('[support-email] send failed', msg.kind, msg.id, err);
      throw HttpError.legacy(500, 'Send failed');
    }
  },
);

/** The address the account signed up with, from auth.users. Null for a visitor or a failed lookup. */
async function accountEmail(admin: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.error('[support-email] could not read the account email', userId, error);
    return null;
  }
  return data.user?.email ?? null;
}
