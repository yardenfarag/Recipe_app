import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const PRODUCT_CREDITS: Readonly<Record<string, number>> = {
  pinch_credits_10: 10,
  pinch_credits_30: 30,
  pinch_credits_100: 100,
};

interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  store?: string;
  environment?: string;
  purchased_at_ms?: number;
}

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

  let event: RevenueCatEvent;
  try {
    const body = (await req.json()) as { event?: RevenueCatEvent };
    event = body.event ?? {};
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // RevenueCat emits NON_RENEWING_PURCHASE for consumable credit packs.
  if (event.type !== 'NON_RENEWING_PURCHASE') {
    return jsonResponse({ received: true, ignored: true });
  }

  const eventId = event.id?.trim();
  const userId = event.app_user_id?.trim();
  const productId = event.product_id?.trim();
  const transactionId = (event.transaction_id ?? event.original_transaction_id)?.trim();
  const credits = productId ? PRODUCT_CREDITS[productId] : undefined;

  if (
    !eventId ||
    !userId ||
    !isUuid(userId) ||
    !productId ||
    !transactionId ||
    !credits
  ) {
    console.error('[revenuecat-webhook] invalid purchase event', {
      eventId,
      userId,
      productId,
      transactionId,
    });
    return jsonResponse({ error: 'Invalid purchase event' }, 400);
  }

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  const { data, error } = await admin.rpc('grant_purchased_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_provider: 'revenuecat',
    p_event_id: eventId,
    p_transaction_id: transactionId,
    p_product_id: productId,
    p_metadata: {
      store: event.store ?? null,
      environment: event.environment ?? null,
      purchased_at_ms: event.purchased_at_ms ?? null,
    },
  });

  if (error) {
    console.error('[revenuecat-webhook] grant failed', error);
    return jsonResponse({ error: 'Credit grant failed' }, 500);
  }

  return jsonResponse({ received: true, balance: Number(data) });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
