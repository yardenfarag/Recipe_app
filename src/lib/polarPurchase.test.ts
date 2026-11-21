import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  checkoutReturnUrl,
  polarDecision,
  polarEventSummary,
  polarSignatureValid,
} from '../../supabase/functions/_shared/billing/polarPurchase';

const USER = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const NOW = 1_763_200_000;
const RAW_KEY = Buffer.from('a-32-byte-standard-webhooks-key!');
const SECRET = `whsec_${RAW_KEY.toString('base64')}`;

function sign(body: string, { id = 'msg_01', ts = NOW, key = RAW_KEY as Buffer | string } = {}) {
  const signature = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { id, timestamp: String(ts), signature: `v1,${signature}` };
}

function paid(order: Record<string, unknown> = {}) {
  return {
    type: 'order.paid',
    timestamp: '2026-11-16T12:00:00Z',
    data: {
      id: 'ord_01',
      status: 'paid',
      billing_reason: 'purchase',
      created_at: '2026-11-16T11:59:00Z',
      customer: { id: 'cus_01', external_id: USER },
      product: { id: 'prod_10', metadata: { pack_id: 'pinch_credits_10' } },
      metadata: { user_id: USER, pack_id: 'pinch_credits_10' },
      ...order,
    },
  };
}

describe('polarSignatureValid', () => {
  const body = JSON.stringify(paid());

  it('accepts a Standard Webhooks signature made with the decoded whsec_ key', async () => {
    expect(await polarSignatureValid(sign(body), body, SECRET, NOW)).toBe(true);
  });

  it('accepts an older Polar secret that signs with the whole string', async () => {
    const legacy = 'polar_whs_legacysecret';
    expect(await polarSignatureValid(sign(body, { key: legacy }), body, legacy, NOW)).toBe(true);
  });

  it('accepts any of several space-separated signatures', async () => {
    const headers = sign(body);
    headers.signature = `v1,bm90LXRoaXMtb25l ${headers.signature}`;
    expect(await polarSignatureValid(headers, body, SECRET, NOW)).toBe(true);
  });

  it('rejects a changed body, a wrong secret, a stale timestamp or missing headers', async () => {
    expect(await polarSignatureValid(sign(body), `${body} `, SECRET, NOW)).toBe(false);
    expect(await polarSignatureValid(sign(body), body, 'whsec_b3RoZXI=', NOW)).toBe(false);
    expect(await polarSignatureValid(sign(body, { ts: NOW - 600 }), body, SECRET, NOW)).toBe(false);
    expect(await polarSignatureValid({ ...sign(body), id: null }, body, SECRET, NOW)).toBe(false);
  });
});

describe('polarDecision', () => {
  it('grants the pack for a paid one-time order', () => {
    expect(polarDecision(paid())).toEqual({
      action: 'grant',
      orderId: 'ord_01',
      userId: USER,
      packId: 'pinch_credits_10',
      credits: 10,
      occurredAt: '2026-11-16T11:59:00Z',
    });
  });

  it('falls back to the checkout metadata for the user and pack', () => {
    const decision = polarDecision(
      paid({ customer: { id: 'cus_01', external_id: null }, product: null, metadata: { user_id: USER, pack_id: 'pinch_credits_100' } }),
    );
    expect(decision).toMatchObject({ action: 'grant', userId: USER, credits: 100 });
  });

  it('flags orders it cannot credit instead of guessing', () => {
    expect(polarDecision(paid({ customer: {}, metadata: {} }))).toEqual({ action: 'unhandled', reason: 'missing_user_id' });
    expect(polarDecision(paid({ product: { metadata: {} }, metadata: { user_id: USER } }))).toEqual({
      action: 'unhandled',
      reason: 'unknown_pack',
    });
    expect(polarDecision({ type: 'order.paid' })).toEqual({ action: 'unhandled', reason: 'invalid_payload' });
  });

  it('ignores subscription renewals and other events', () => {
    expect(polarDecision(paid({ billing_reason: 'subscription_cycle' }))).toEqual({
      action: 'ignore',
      reason: 'billing_subscription_cycle',
    });
    expect(polarDecision({ ...paid(), type: 'order.created' })).toEqual({ action: 'ignore', reason: 'event_order.created' });
  });

  it('takes the pack back only on a full refund', () => {
    expect(polarDecision({ ...paid({ status: 'refunded' }), type: 'order.refunded' })).toEqual({
      action: 'revoke',
      orderId: 'ord_01',
    });
    expect(polarDecision({ ...paid({ status: 'partially_refunded' }), type: 'order.refunded' })).toEqual({
      action: 'ignore',
      reason: 'refund_partially_refunded',
    });
  });
});

describe('polarEventSummary', () => {
  it('keeps the fields needed to find the order later', () => {
    expect(polarEventSummary(paid(), 'msg_01')).toEqual({
      event_id: 'msg_01',
      transaction_id: 'ord_01',
      product_id: 'pinch_credits_10',
      app_user_id: USER,
      store: 'polar',
      environment: 'production',
    });
  });
});

describe('checkoutReturnUrl', () => {
  const fallback = 'https://pinch-app.io/app/settings/credits';

  it('returns to the page the buyer started from, with the checkout id placeholder', () => {
    expect(checkoutReturnUrl('https://pinch-app.io/app/add?x=1#top', fallback)).toBe(
      'https://pinch-app.io/app/add?checkout_id={CHECKOUT_ID}',
    );
    expect(checkoutReturnUrl('https://next.pinch-app.io/app/settings/credits', fallback)).toBe(
      'https://next.pinch-app.io/app/settings/credits?checkout_id={CHECKOUT_ID}',
    );
    expect(checkoutReturnUrl('http://localhost:8081/settings/credits', fallback)).toBe(
      'http://localhost:8081/settings/credits?checkout_id={CHECKOUT_ID}',
    );
  });

  it('never sends the buyer to another site', () => {
    expect(checkoutReturnUrl('https://evil.example/app', fallback)).toBe(`${fallback}?checkout_id={CHECKOUT_ID}`);
    expect(checkoutReturnUrl('https://next.pinch-app.io.evil.example/app', fallback)).toBe(`${fallback}?checkout_id={CHECKOUT_ID}`);
    expect(checkoutReturnUrl('not a url', fallback)).toBe(`${fallback}?checkout_id={CHECKOUT_ID}`);
    expect(checkoutReturnUrl(undefined, fallback)).toBe(`${fallback}?checkout_id={CHECKOUT_ID}`);
  });
});
