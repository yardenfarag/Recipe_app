// Emails each new support message to support@pinch-app.io. A trigger on public.feedback
// (migration 20261115230000_support_emails) calls this with the row id and a Vault secret; the
// message itself is read here, so a forged call can't make up one. Reply-To is the sender.
// Secrets: RESEND_API_KEY. The trigger's secret lives in Vault (support_email_secret).
import { jsonResponse } from '../_shared/cors.ts';
import { sendOnce } from '../_shared/email/send.ts';
import { renderSupportEmail, replyAddress, SUPPORT_INBOX, type FeedbackRow } from '../_shared/email/support.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
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
  const id = typeof body?.feedback_id === 'string' ? body.feedback_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonResponse({ error: 'Invalid feedback_id' }, 400);

  const { data: row, error } = await admin
    .from('feedback')
    .select(
      'id, user_id, message, source, contact_email, app_version, build_number, platform, os_version, device_model, locale, created_at, profile:profiles(email)',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[support-email] could not read feedback', id, error);
    return jsonResponse({ error: 'Could not read feedback' }, 500);
  }
  if (!row) return jsonResponse({ error: 'Not found' }, 404);

  const feedback = row as unknown as FeedbackRow;
  try {
    const sent = await sendOnce(admin, {
      kind: 'support',
      dedupeKey: feedback.id,
      userId: feedback.user_id,
      to: SUPPORT_INBOX,
      email: renderSupportEmail(feedback),
      replyTo: replyAddress(feedback) ?? undefined,
    });
    return jsonResponse({ sent });
  } catch (err) {
    console.error('[support-email] send failed', id, err);
    return jsonResponse({ error: 'Send failed' }, 500);
  }
});
