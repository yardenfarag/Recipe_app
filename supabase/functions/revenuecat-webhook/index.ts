import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { creditPurchaseDecision } from '../_shared/revenuecatPurchase.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const expectedAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  if (!expectedAuth || req.headers.get('Authorization') !== expectedAuth) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (Deno.env.get('CREDIT_PURCHASES_ENABLED') !== 'true') {
    // Non-2xx asks RevenueCat to retry instead of silently losing a purchase
    // that arrived during a staged deployment.
    return jsonResponse({ received: false, grants_enabled: false }, 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const decision = creditPurchaseDecision(body);
  if (decision.action === 'ignore') {
    return jsonResponse({ received: true, ignored: true });
  }
  if (decision.action === 'retry') {
    console.error('[revenuecat-webhook] credit purchase cannot be granted yet');
    return jsonResponse({ error: 'Invalid purchase event' }, 500);
  }

  const { grant } = decision;
  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  const { data, error } = await admin.rpc('grant_purchased_credits', {
    p_user_id: grant.userId,
    p_amount: grant.credits,
    p_provider: 'revenuecat',
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
    return jsonResponse({ error: 'Credit grant failed' }, 500);
  }

  return jsonResponse({ received: true, balance: Number(data) });
});
