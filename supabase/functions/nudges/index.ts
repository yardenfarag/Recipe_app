import { serve } from '../_shared/core/observe.ts';
// Reminders for new accounts (migration 20261122191000_nudges): a day after sign-up when nothing is
// saved yet, three days after when nothing saved has been cooked. Push and email, each once.
//   POST from the cron job (every 15 minutes, x-email-cron-secret): sends what's due.
//   GET or POST with ?u=&t= : the unsubscribe link in the email, and the one-click
//   List-Unsubscribe POST mail apps send. Turns reminders off for that account.
// Secrets: RESEND_API_KEY; EXPO_ACCESS_TOKEN only if Expo's enhanced push security is on.
import { jsonResponse } from '../_shared/core/cors.ts';
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';
import { pickLocale } from '../_shared/email/copy.ts';
import { NUDGE_COPY } from '../_shared/email/nudgeCopy.ts';
import { sendEmail } from '../_shared/email/send.ts';
import { sendPush } from '../_shared/nudges/expoPush.ts';
import { runNudges } from '../_shared/nudges/nudges.ts';

function textPage(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

serve('nudges', async (req) => {
  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  const url = new URL(req.url);
  const unsubscribeUser = url.searchParams.get('u');
  if (unsubscribeUser !== null) {
    if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
    const copy = NUDGE_COPY[pickLocale(url.searchParams.get('l'))];
    const { data: ok, error } = await admin.rpc('nudge_unsubscribe', {
      p_user_id: unsubscribeUser,
      p_token: url.searchParams.get('t') ?? '',
    });
    if (error) {
      // A malformed user id is a bad link, not a server fault.
      if (error.code === '22P02') return textPage(copy.unsubscribeFailedPage, 400);
      console.error('[nudges] unsubscribe failed', error);
      return textPage(copy.unsubscribeFailedPage, 500);
    }
    return ok === true ? textPage(copy.unsubscribedPage) : textPage(copy.unsubscribeFailedPage, 400);
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const given = req.headers.get('x-email-cron-secret') ?? '';
  const { data: ok, error: secretError } = await admin.rpc('email_cron_secret_matches', { p_secret: given });
  if (secretError) {
    console.error('[nudges] secret check failed', secretError);
    return jsonResponse({ error: 'Secret check failed' }, 500);
  }
  if (!given || ok !== true) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const result = await runNudges({
      admin,
      functionsBase: Deno.env.get('SUPABASE_URL') ?? '',
      sendEmail: (to, email, options) => sendEmail(to, email, options),
      sendPush: (messages) => sendPush(messages),
      pause: () => new Promise((resolve) => setTimeout(resolve, 600)),
    });
    return jsonResponse(result);
  } catch (err) {
    console.error('[nudges] run failed', err);
    return jsonResponse({ error: 'Could not send nudges' }, 500);
  }
});
