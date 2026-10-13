import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { buildWelcomeEmail, safeMailHeader } from '../_shared/welcomeEmail.ts';

const DEFAULT_APP_URL = 'https://pinch-app.io';

interface ClaimResult {
  claimed?: boolean;
  reason?: string;
  email?: string;
}

function publicStatus(reason: string | undefined): 'already_sent' | 'skipped' | 'retry' {
  if (reason === 'already_sent') return 'already_sent';
  if (reason === 'in_progress' || reason === 'missing_profile') return 'retry';
  return 'skipped';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const authed = createAuthedSupabase(authHeader);
  const admin = createServiceSupabase();
  if (!authed || !admin) {
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  const {
    data: { user },
    error: userError,
  } = await authed.auth.getUser();
  if (userError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { error: ensureError } = await admin.rpc('ensure_user_profile', { p_user_id: user.id });
  if (ensureError) {
    console.error('[welcome-email] profile ensure failed', ensureError);
    return jsonResponse({ status: 'retry' }, 503);
  }

  const { data: claimData, error: claimError } = await admin.rpc('claim_welcome_email', {
    p_user_id: user.id,
    p_email: user.email ?? null,
  });
  if (claimError) {
    console.error('[welcome-email] claim failed', claimError);
    return jsonResponse({ status: 'retry' }, 503);
  }

  const claim = (claimData ?? {}) as ClaimResult;
  if (claim.claimed !== true) {
    return jsonResponse({ status: publicStatus(claim.reason) });
  }

  const email = typeof claim.email === 'string' ? claim.email : '';
  const apiKey = safeMailHeader(Deno.env.get('RESEND_API_KEY'));
  const from = safeMailHeader(Deno.env.get('WELCOME_EMAIL_FROM'));
  if (!apiKey || !from) {
    await admin.rpc('release_welcome_email', { p_user_id: user.id });
    console.error('[welcome-email] Resend is not configured');
    return jsonResponse({ status: 'retry' }, 503);
  }

  const appUrl = safeMailHeader(Deno.env.get('WELCOME_APP_URL')) ?? DEFAULT_APP_URL;
  const supportEmail = safeMailHeader(Deno.env.get('WELCOME_SUPPORT_EMAIL'));
  const message = buildWelcomeEmail({ appUrl, supportEmail });

  let sent = false;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });
    sent = response.ok;
    if (!response.ok) {
      const detail = await response.text();
      console.error('[welcome-email] provider rejected the message', response.status, detail);
    }
  } catch (error) {
    console.error('[welcome-email] provider request failed', error);
  }

  if (!sent) {
    await admin.rpc('release_welcome_email', { p_user_id: user.id });
    return jsonResponse({ status: 'retry' }, 503);
  }

  const { error: completeError } = await admin.rpc('complete_welcome_email', {
    p_user_id: user.id,
  });
  if (completeError) {
    console.error('[welcome-email] could not record the send', completeError);
    return jsonResponse({ status: 'retry' }, 503);
  }

  return jsonResponse({ status: 'sent' });
});
