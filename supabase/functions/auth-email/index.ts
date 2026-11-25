// Supabase Auth "Send Email Hook": every auth email (sign-in code, password reset, email change)
// comes here instead of Supabase's own mailer, and goes out branded from hello@pinch-app.io.
//
// Set up: Dashboard → Authentication → Emails (or Hooks) → Send Email hook → HTTPS → this function's
// URL. Supabase shows the hook secret ("v1,whsec_…"); store it as SEND_EMAIL_HOOK_SECRET.
// Secrets: SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY. Deploy with --no-verify-jwt: Supabase signs the
// request with the hook secret, it doesn't send a user JWT.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

import { handler, HttpError } from '../_shared/core/handler.ts';
import { emailsForAuthHook, isAuthHookPayload } from '../_shared/email/authHook.ts';
import { sendEmail } from '../_shared/email/send.ts';

/** The error shape Supabase Auth reads from a hook, with no CORS headers. */
function hookError(status: number, message: string): HttpError {
  return HttpError.withBody(status, { error: { http_code: status, message } });
}

const notConfigured = hookError(500, 'Email is not configured');

handler(
  {
    name: 'auth-email',
    auth: 'webhook',
    cors: false,
    // The body is read in the handler, after the config check, as it always was.
    body: 'none',
    errors: { methodNotAllowed: hookError(405, 'Method not allowed'), misconfigured: notConfigured },
  },
  async ({ req }) => {
    const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!secret || !supabaseUrl) {
      console.error('[auth-email] SEND_EMAIL_HOOK_SECRET or SUPABASE_URL is not set');
      throw notConfigured;
    }

    const raw = await req.text();
    const headers = Object.fromEntries(req.headers);
    let payload: unknown;
    try {
      payload = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(raw, headers);
    } catch {
      throw hookError(401, 'Invalid signature');
    }
    if (!isAuthHookPayload(payload)) throw hookError(400, 'Invalid payload');

    const type = payload.email_data.email_action_type;
    const outgoing = emailsForAuthHook(payload, supabaseUrl);
    if (outgoing.length === 0) {
      console.error('[auth-email] nothing to send for', type);
      throw hookError(400, `Unsupported email type: ${type}`);
    }

    // The same webhook-id comes back on a retry; Resend drops the repeat.
    const webhookId = req.headers.get('webhook-id') ?? crypto.randomUUID();
    try {
      await Promise.all(
        outgoing.map(({ to, email }, i) =>
          sendEmail(to, email, { idempotencyKey: `auth/${webhookId}/${i}`, tags: { kind: `auth_${type}` } }),
        ),
      );
    } catch (error) {
      console.error('[auth-email] send failed', type, error);
      throw hookError(500, 'Could not send the email. Please try again.');
    }

    // Supabase Auth wants an empty object.
    return {};
  },
);
