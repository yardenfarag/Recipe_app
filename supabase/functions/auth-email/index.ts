import { serve } from '../_shared/core/observe.ts';
// Supabase Auth "Send Email Hook": every auth email (sign-in code, password reset, email change)
// comes here instead of Supabase's own mailer, and goes out branded from hello@pinch-app.io.
//
// Set up: Dashboard → Authentication → Emails (or Hooks) → Send Email hook → HTTPS → this function's
// URL. Supabase shows the hook secret ("v1,whsec_…"); store it as SEND_EMAIL_HOOK_SECRET.
// Secrets: SEND_EMAIL_HOOK_SECRET, RESEND_API_KEY. Deploy with --no-verify-jwt: Supabase signs the
// request with the hook secret, it doesn't send a user JWT.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

import { emailsForAuthHook, isAuthHookPayload } from '../_shared/email/authHook.ts';
import { sendEmail } from '../_shared/email/send.ts';

function hookError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve('auth-email', async (req) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed');

  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!secret || !supabaseUrl) {
    console.error('[auth-email] SEND_EMAIL_HOOK_SECRET or SUPABASE_URL is not set');
    return hookError(500, 'Email is not configured');
  }

  const raw = await req.text();
  const headers = Object.fromEntries(req.headers);
  let payload: unknown;
  try {
    payload = new Webhook(secret.replace(/^v1,whsec_/, '')).verify(raw, headers);
  } catch {
    return hookError(401, 'Invalid signature');
  }
  if (!isAuthHookPayload(payload)) return hookError(400, 'Invalid payload');

  const type = payload.email_data.email_action_type;
  const outgoing = emailsForAuthHook(payload, supabaseUrl);
  if (outgoing.length === 0) {
    console.error('[auth-email] nothing to send for', type);
    return hookError(400, `Unsupported email type: ${type}`);
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
    return hookError(500, 'Could not send the email. Please try again.');
  }

  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
});
