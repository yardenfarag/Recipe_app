import { serve } from '../_shared/core/observe.ts';
// Welcome emails. A cron job (migration 20261115210000_branded_emails) calls this every 5 minutes;
// it welcomes each account created in the last two days that hasn't been welcomed, once, in the
// language the app saved for them. Works for email, Google and Apple signups alike.
// Secrets: RESEND_API_KEY. The cron secret lives in Vault (email_cron_secret).
import { jsonResponse } from '../_shared/core/cors.ts';
import { pickLocale } from '../_shared/email/copy.ts';
import { renderWelcomeEmail } from '../_shared/email/render.ts';
import { sendOnce } from '../_shared/email/send.ts';
import { createServiceSupabase } from '../_shared/core/supabaseAdmin.ts';

serve('welcome-emails', async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  const given = req.headers.get('x-email-cron-secret') ?? '';
  const { data: ok, error: secretError } = await admin.rpc('email_cron_secret_matches', { p_secret: given });
  if (secretError) {
    console.error('[welcome-emails] secret check failed', secretError);
    return jsonResponse({ error: 'Secret check failed' }, 500);
  }
  if (!given || ok !== true) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { data: candidates, error } = await admin.rpc('welcome_email_candidates', { p_limit: 50 });
  if (error) {
    console.error('[welcome-emails] candidates failed', error);
    return jsonResponse({ error: 'Could not list accounts' }, 500);
  }

  let sent = 0;
  let failed = 0;
  for (const row of (candidates ?? []) as { user_id: string; email: string; locale: string | null }[]) {
    try {
      const didSend = await sendOnce(admin, {
        kind: 'welcome',
        dedupeKey: row.user_id,
        userId: row.user_id,
        to: row.email,
        email: renderWelcomeEmail({ locale: pickLocale(row.locale) }),
      });
      if (didSend) {
        sent++;
        // Resend allows 2 requests a second by default.
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    } catch (err) {
      // Leave it for the next run; one bad address mustn't block the rest.
      failed++;
      console.error('[welcome-emails] send failed', row.user_id, err);
    }
  }

  return jsonResponse({ sent, failed });
});
