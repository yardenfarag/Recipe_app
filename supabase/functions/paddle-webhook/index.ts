// Paddle notifications for web credit packs (pinch-app.io checkout, src/lib/purchases.ts).
//   transaction.completed           → grant the pack's credits (grant_purchased_credits)
//   adjustment.created / .updated   → an approved refund or chargeback takes them back
//                                     (revoke_purchased_credits)
// Secrets: PADDLE_WEBHOOK_SECRET (the notification destination's key) and PADDLE_API_KEY
// (read-only; looks up a product's pack_id when the payload leaves it out).
//
// Paddle retries any non-2xx for days, so a delivery we can't handle yet (grants switched off,
// a database error) answers 500 and is recorded in purchase_webhook_failures.
import { jsonResponse } from '../_shared/cors.ts';
import {
  creditsFor,
  paddleApiBase,
  paddleDecision,
  paddleEnvironment,
  paddleEventSummary,
  paddleSignatureValid,
  type PaddleLine,
} from '../_shared/paddlePurchase.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';

const PROVIDER = 'paddle';

async function recordFailure(body: unknown, reason: string, error?: unknown): Promise<void> {
  const admin = createServiceSupabase();
  if (!admin) return;
  const apiKey = Deno.env.get('PADDLE_API_KEY') ?? '';
  const { error: insertError } = await admin.from('purchase_webhook_failures').insert({
    ...paddleEventSummary(body),
    environment: apiKey ? paddleEnvironment(apiKey) : null,
    reason,
    error: error ? String((error as { message?: unknown }).message ?? error).slice(0, 500) : null,
  });
  if (insertError) console.error('[paddle-webhook] could not record failure', insertError);
}

// Product ids don't change their pack, so a warm function asks Paddle once per product.
const packIdCache = new Map<string, string | null>();

async function fillPackIds(lines: PaddleLine[]): Promise<PaddleLine[]> {
  const apiKey = Deno.env.get('PADDLE_API_KEY');
  return await Promise.all(
    lines.map(async (line) => {
      if (line.packId) return line;
      if (packIdCache.has(line.productId)) return { ...line, packId: packIdCache.get(line.productId)! };
      if (!apiKey) throw new Error('PADDLE_API_KEY is not set');
      const response = await fetch(`${paddleApiBase(apiKey)}/products/${encodeURIComponent(line.productId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) throw new Error(`Paddle product lookup failed: ${response.status}`);
      const product = (await response.json())?.data;
      const packId = typeof product?.custom_data?.pack_id === 'string' ? product.custom_data.pack_id : null;
      packIdCache.set(line.productId, packId);
      return { ...line, packId };
    }),
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('PADDLE_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[paddle-webhook] PADDLE_WEBHOOK_SECRET is not set');
    return jsonResponse({ error: 'Server is not configured' }, 500);
  }

  const rawBody = await req.text();
  if (!(await paddleSignatureValid(req.headers.get('Paddle-Signature'), rawBody, secret))) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    await recordFailure(null, 'invalid_json');
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const decision = paddleDecision(body);
  if (decision.action === 'ignore') return jsonResponse({ received: true, ignored: decision.reason });
  if (decision.action === 'retry') {
    console.error('[paddle-webhook] cannot handle event', decision.reason);
    await recordFailure(body, decision.reason);
    return jsonResponse({ error: decision.reason }, 500);
  }

  if (Deno.env.get('CREDIT_PURCHASES_ENABLED') !== 'true') {
    await recordFailure(body, 'grants_disabled');
    return jsonResponse({ received: false, grants_enabled: false }, 503);
  }

  const admin = createServiceSupabase();
  if (!admin) return jsonResponse({ error: 'Server is not configured' }, 500);
  const environment = paddleEnvironment(Deno.env.get('PADDLE_API_KEY') ?? '');

  if (decision.action === 'revoke') {
    const { data, error } = await admin.rpc('revoke_purchased_credits', {
      p_provider: PROVIDER,
      p_transaction_id: decision.transactionId,
      p_event_id: decision.eventId,
      p_metadata: { adjustment_id: decision.adjustmentId, kind: decision.kind, environment },
    });
    if (error) {
      console.error('[paddle-webhook] revoke failed', error);
      await recordFailure(body, 'revoke_failed', error);
      return jsonResponse({ error: 'Credit revoke failed' }, 500);
    }
    // null: no grant for this transaction (nothing was credited, so nothing to take back).
    if (data === null) await recordFailure(body, 'revoke_without_grant');
    return jsonResponse({ received: true, balance: data });
  }

  let lines: PaddleLine[];
  try {
    lines = await fillPackIds(decision.lines);
  } catch (error) {
    console.error('[paddle-webhook] product lookup failed', error);
    await recordFailure(body, 'product_lookup_failed', error);
    return jsonResponse({ error: 'Product lookup failed' }, 500);
  }
  const credits = creditsFor(lines);
  if (!credits) {
    await recordFailure(body, 'unknown_pack');
    return jsonResponse({ error: 'Unknown credit pack' }, 500);
  }

  const { data, error } = await admin.rpc('grant_purchased_credits', {
    p_user_id: decision.userId,
    p_amount: credits,
    p_provider: PROVIDER,
    p_event_id: decision.eventId,
    p_transaction_id: decision.transactionId,
    p_product_id: lines.map((line) => line.packId).join(','),
    p_metadata: { store: 'paddle', environment, occurred_at: decision.occurredAt },
  });
  if (error) {
    console.error('[paddle-webhook] grant failed', error);
    await recordFailure(body, 'grant_failed', error);
    return jsonResponse({ error: 'Credit grant failed' }, 500);
  }
  return jsonResponse({ received: true, balance: Number(data) });
});
