// Welcome emails. A cron job (migration 20261115210000_branded_emails) calls this every 5 minutes;
// it welcomes each account created in the last two days that hasn't been welcomed, once, in the
// language the app saved for them. Works for email, Google and Apple signups alike. It is optional email
// (EMAIL_CATEGORY): it carries an unsubscribe link, and accounts that opted out are skipped (PIN-189).
// Secrets: RESEND_API_KEY. The cron secret lives in Vault (email_cron_secret).
import { handler, HttpError } from '../_shared/core/handler.ts';
import { pickLocale } from '../_shared/email/copy.ts';
import { renderWelcomeEmail } from '../_shared/email/render.ts';
import { sendOnce, teamCopy } from '../_shared/email/send.ts';
import { unsubscribeLinks } from '../_shared/email/unsubscribe.ts';

interface WelcomeCandidate {
  user_id: string;
  email: string;
  locale: string | null;
  unsubscribe_token: string;
}

handler(
  {
    name: 'welcome-emails',
    auth: 'secret',
    secret: { header: 'x-email-cron-secret', rpc: 'email_cron_secret_matches' },
    // Called by pg_net only; it never answered OPTIONS.
    cors: false,
    body: 'none',
    legacyErrorShape: true,
    errors: { misconfigured: HttpError.legacy(500, 'Server is not configured') },
  },
  async ({ admin }) => {
    const { data: candidates, error } = await admin.rpc('welcome_email_candidates', { p_limit: 50 });
    if (error) {
      console.error('[welcome-emails] candidates failed', error);
      throw HttpError.legacy(500, 'Could not list accounts');
    }

    const functionsBase = Deno.env.get('SUPABASE_URL') ?? '';
    let sent = 0;
    let failed = 0;
    for (const row of (candidates ?? []) as WelcomeCandidate[]) {
      try {
        const locale = pickLocale(row.locale);
        const didSend = await sendOnce(admin, {
          kind: 'welcome',
          dedupeKey: row.user_id,
          userId: row.user_id,
          to: row.email,
          email: renderWelcomeEmail({
            locale,
            unsubscribe: unsubscribeLinks(functionsBase, row.user_id, row.unsubscribe_token, locale),
          }),
          bcc: teamCopy(),
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

    return { sent, failed };
  },
);
