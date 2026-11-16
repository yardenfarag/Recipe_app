// Polar notifications for web credit packs (pinch-app.io checkout, polar-checkout).
//   order.paid       → grant the pack's credits (grant_purchased_credits)
//   order.refunded   → a full refund takes them back (revoke_purchased_credits)
// Secret: POLAR_WEBHOOK_SECRET (the webhook endpoint's signing secret).
//
// Polar retries any non-2xx up to 10 times and disables the endpoint after 10 failures in a
// row, so only deliveries we expect to succeed on a retry answer 500; they're also recorded
// in purchase_webhook_failures.
import { jsonResponse } from '../_shared/cors.ts';
import { sendPurchaseEmail } from '../_shared/email/purchase.ts';
import { polarDecision, polarEventSummary, polarSignatureValid } from '../_shared/polarPurchase.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const PROVIDER = 'polar';

async function recordFailure(body: unknown, eventId: string | null, reason: string, error?: unknown): Promise<void> {
  const admin = createServiceSupabase();
  if (!admin) return;
  const { error: insertError } = await admin.from('purchase_webhook_failures').insert({
    ...polarEventSummary(body, eventId),
    reason,
    error: error ? String((error as { message?: unknown }).message ?? error).slice(0, 500) : null,
  });
  if (insertError) console.error('[polar-webhook] could not record failure', insertError);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('POLAR_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[polar-webhook] POLAR_WEBHOOK_SECRET is not set');
    return jsonResponse({ error: 'Server is not configured' }, 500);
  }

  const rawBody = await req.text();
  const eventId = req.headers.get('webhook-id');
  const signed = await polarSignatureValid(
    { id: eventId, timestamp: req.headers.get('webhook-timestamp'), signature: req.headers.get('webhook-signature') },
    rawBody,
    secret,
  );
  if (!signed) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    await recordFailure(null, eventId, 'invalid_json');
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const decision = polarDecision(body);
  if (decision.action === 'ignore') return jsonResponse({ received: true, ignored: decision.reason });
  if (decision.action === 'unhandled') {
    // A retry won't fix these; record them for a person to look at and accept the delivery.
    console.error('[polar-webhook] cannot handle event', decision.reason);
    await recordFailure(body, eventId, decision.reason);
    return jsonResponse({ received: true, unhandled: decision.reason });
  }

  if (Deno.env.get('CREDIT_PURCHASES_ENABLED') !== 'true') {
    await recordFailure(body, eventId, 'grants_disabled');
    return jsonResponse({ received: false, grants_enabled: false }, 503);
  }

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);

  if (decision.action === 'revoke') {
    const { data, error } = await admin.rpc('revoke_purchased_credits', {
      p_provider: PROVIDER,
      p_transaction_id: decision.orderId,
      p_event_id: eventId,
      p_metadata: { store: 'polar' },
    });
    if (error) {
      console.error('[polar-webhook] revoke failed', error);
      await recordFailure(body, eventId, 'revoke_failed', error);
      return jsonResponse({ error: 'Credit revoke failed' }, 500);
    }
    // null: no grant for this order (nothing was credited, so nothing to take back).
    if (data === null) await recordFailure(body, eventId, 'revoke_without_grant');
    return jsonResponse({ received: true, balance: data });
  }

  const { data, error } = await admin.rpc('grant_purchased_credits', {
    p_user_id: decision.userId,
    p_amount: decision.credits,
    p_provider: PROVIDER,
    p_event_id: eventId,
    p_transaction_id: decision.orderId,
    p_product_id: decision.packId,
    p_metadata: { store: 'polar', occurred_at: decision.occurredAt },
  });
  if (error) {
    console.error('[polar-webhook] grant failed', error);
    await recordFailure(body, eventId, 'grant_failed', error);
    return jsonResponse({ error: 'Credit grant failed' }, 500);
  }

  const occurredAt = decision.occurredAt ? new Date(decision.occurredAt) : null;
  await sendPurchaseEmail(admin, {
    userId: decision.userId,
    credits: decision.credits,
    balance: Number.isFinite(Number(data)) ? Number(data) : null,
    provider: PROVIDER,
    transactionId: decision.orderId,
    store: 'polar',
    purchasedAt: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
  });
  return jsonResponse({ received: true, balance: Number(data) });
});
