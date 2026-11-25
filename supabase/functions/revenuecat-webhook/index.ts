import { serve } from '../_shared/core/observe.ts';
import { corsHeaders, jsonResponse } from '../_shared/core/cors.ts';
import { sendPurchaseEmail } from '../_shared/email/purchase.ts';
import { permanentCreditError } from '../_shared/billing/creditErrors.ts';
import {
  creditPurchaseDecision,
  isSandboxEnvironment,
  purchaseEventSummary,
} from '../_shared/billing/revenuecatPurchase.ts';
import { createServiceSupabase, type Db } from '../_shared/core/supabaseAdmin.ts';

const PROVIDER = 'revenuecat';

/** Best effort: the admin credit health report counts these. */
async function recordFailure(body: unknown, reason: string, error?: unknown): Promise<void> {
  const admin = createServiceSupabase();
  if (!admin) return;
  const { error: insertError } = await admin.from('purchase_webhook_failures').insert({
    ...purchaseEventSummary(body),
    reason,
    error: error ? String((error as { message?: unknown }).message ?? error).slice(0, 500) : null,
  });
  if (insertError) console.error('[revenuecat-webhook] could not record failure', insertError);
}

/** Admins may test purchases in the sandbox (TestFlight, Play testers) and get the credits. */
async function isAdmin(admin: Db, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data?.is_admin === true;
}

serve('revenuecat-webhook', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expectedAuth || !(await secretMatches(req.headers.get('Authorization'), expectedAuth))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    await recordFailure(null, 'invalid_json');
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const decision = creditPurchaseDecision(body);
  if (Deno.env.get('CREDIT_PURCHASES_ENABLED') !== 'true') {
    // Non-2xx asks RevenueCat to retry instead of silently losing a purchase
    // that arrived during a staged deployment.
    if (decision.action !== 'ignore') await recordFailure(body, 'grants_disabled');
    return jsonResponse({ received: false, grants_enabled: false }, 503);
  }

  if (decision.action === 'ignore') {
    return jsonResponse({ received: true, ignored: true });
  }
  if (decision.action === 'retry') {
    console.error('[revenuecat-webhook] credit purchase cannot be granted yet');
    await recordFailure(body, 'invalid_purchase_event');
    return jsonResponse({ error: 'Invalid purchase event' }, 500);
  }

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  // Sandbox purchases cost nothing, so they give real credits to admins only.
  const subject = decision.action === 'grant' ? decision.grant : decision.revoke;
  if (isSandboxEnvironment(subject.environment)) {
    let sandboxAllowed: boolean;
    try {
      sandboxAllowed = await isAdmin(admin, subject.userId);
    } catch (error) {
      console.error('[revenuecat-webhook] admin lookup failed', error);
      return jsonResponse({ error: 'Admin lookup failed' }, 500);
    }
    if (!sandboxAllowed) return jsonResponse({ received: true, ignored: 'sandbox' });
  }

  if (decision.action === 'revoke') {
    const { revoke } = decision;
    let balance: number | null = null;
    // The grant is stored under the purchase's transaction id; a refund event may carry it in
    // either field, so try each until one matches.
    for (const transactionId of revoke.transactionIds) {
      const { data, error } = await admin.rpc('revoke_purchased_credits', {
        p_provider: PROVIDER,
        p_transaction_id: transactionId,
        p_event_id: revoke.eventId,
        p_metadata: { store: revoke.store, environment: revoke.environment },
      });
      if (error) {
        console.error('[revenuecat-webhook] revoke failed', error);
        const permanent = permanentCreditError(error);
        await recordFailure(body, permanent ?? 'revoke_failed', error);
        if (permanent) return jsonResponse({ received: true, unhandled: permanent });
        return jsonResponse({ error: 'Credit revoke failed' }, 500);
      }
      if (data !== null) {
        balance = Number(data);
        break;
      }
    }
    // null: no grant for this purchase yet. revoke_purchased_credits left a marker, so a grant
    // that arrives later is refused.
    if (balance === null) await recordFailure(body, 'revoke_without_grant');
    return jsonResponse({ received: true, balance });
  }

  const { grant } = decision;
  const { data, error } = await admin.rpc('grant_purchased_credits', {
    p_user_id: grant.userId,
    p_amount: grant.credits,
    p_provider: PROVIDER,
    p_event_id: grant.eventId,
    p_transaction_id: grant.transactionId,
    p_product_id: grant.productId,
    p_metadata: {
      store: grant.store,
      environment: grant.environment,
      purchased_at_ms: grant.purchasedAtMs,
    },
  });

  if (error) {
    console.error('[revenuecat-webhook] grant failed', error);
    // A retry can't fix these (the account was deleted, or the purchase was already refunded).
    const permanent = permanentCreditError(error);
    await recordFailure(body, permanent ?? 'grant_failed', error);
    if (permanent) return jsonResponse({ received: true, unhandled: permanent });
    return jsonResponse({ error: 'Credit grant failed' }, 500);
  }

  await sendPurchaseEmail(admin, {
    userId: grant.userId,
    credits: grant.credits,
    balance: Number.isFinite(Number(data)) ? Number(data) : null,
    provider: PROVIDER,
    transactionId: grant.transactionId,
    store: grant.store,
    purchasedAt: grant.purchasedAtMs ? new Date(grant.purchasedAtMs) : null,
    sandbox: isSandboxEnvironment(grant.environment),
    price: grant.price,
  });

  return jsonResponse({ received: true, balance: Number(data) });
});

/**
 * Compares the shared secret in constant time. Hashing both sides first makes
 * the lengths equal, so neither the length nor a matching prefix leaks.
 */
async function secretMatches(given: string | null, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [given ?? '', expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))),
  );
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
