import { serve } from '../_shared/core/observe.ts';
// Emails each new support message to support@pinch-app.io. Triggers on public.support_tickets
// ("Help & support" in the app) and public.feedback ("Send feedback", and the website's "Contact
// support" form) call this with the row id and a Vault secret; the message itself is read here,
// so a forged call can't make one up. Reply-To is the sender, and the body is only their words.
// Secrets: RESEND_API_KEY. The triggers' secret lives in Vault (support_email_secret).
import { jsonResponse } from '../_shared/core/cors.ts';
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
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTEXT = 'app_version, build_number, platform, os_version, device_model, locale';

serve('support-email', async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  const given = req.headers.get('x-support-email-secret') ?? '';
  const { data: ok, error: secretError } = await admin.rpc('support_email_secret_matches', { p_secret: given });
  if (secretError) {
    console.error('[support-email] secret check failed', secretError);
    return jsonResponse({ error: 'Secret check failed' }, 500);
  }
  if (!given || ok !== true) return jsonResponse({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => null);
  const ticketId = typeof body?.ticket_id === 'string' && UUID.test(body.ticket_id) ? body.ticket_id : null;
  const feedbackId = typeof body?.feedback_id === 'string' && UUID.test(body.feedback_id) ? body.feedback_id : null;
  if (!ticketId && !feedbackId) return jsonResponse({ error: 'Invalid id' }, 400);

  let msg: SupportMessage;
  if (ticketId) {
    const { data, error } = await admin
      .from('support_tickets')
      .select(`id, user_id, email, category, message, created_at, ${CONTEXT}`)
      .eq('id', ticketId)
      .maybeSingle();
    if (error) {
      console.error('[support-email] could not read ticket', ticketId, error);
      return jsonResponse({ error: 'Could not read ticket' }, 500);
    }
    if (!data) return jsonResponse({ error: 'Not found' }, 404);
    msg = fromTicket(data as unknown as TicketRow);
  } else {
    const { data, error } = await admin
      .from('feedback')
      .select(`id, user_id, message, source, contact_email, created_at, ${CONTEXT}, profile:profiles(email)`)
      .eq('id', feedbackId)
      .maybeSingle();
    if (error) {
      console.error('[support-email] could not read feedback', feedbackId, error);
      return jsonResponse({ error: 'Could not read feedback' }, 500);
    }
    if (!data) return jsonResponse({ error: 'Not found' }, 404);
    msg = fromFeedback(data as unknown as FeedbackRow);
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
    });
    return jsonResponse({ sent });
  } catch (err) {
    console.error('[support-email] send failed', msg.kind, msg.id, err);
    return jsonResponse({ error: 'Send failed' }, 500);
  }
});
