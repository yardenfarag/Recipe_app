import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  creditsFor,
  paddleApiBase,
  paddleDecision,
  paddleEventSummary,
  paddleSignatureValid,
} from '../../supabase/functions/_shared/paddlePurchase';

const USER = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b';
const SECRET = 'pdl_ntfset_test_secret';
const NOW = 1_763_200_000;

function sign(body: string, ts = NOW, secret = SECRET) {
  const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

function completed(overrides: Record<string, unknown> = {}) {
  return {
    event_id: 'evt_01',
    event_type: 'transaction.completed',
    occurred_at: '2026-11-15T18:00:00Z',
    data: {
      id: 'txn_01',
      status: 'completed',
      custom_data: { user_id: USER },
      items: [{ quantity: 1, price: { id: 'pri_30', product_id: 'pro_30' } }],
      details: {
        line_items: [{ product: { id: 'pro_30', custom_data: { pack_id: 'pinch_credits_30' } } }],
      },
      ...overrides,
    },
  };
}

function adjustment(data: Record<string, unknown>, type = 'adjustment.updated') {
  return {
    event_id: 'evt_02',
    event_type: type,
    data: { id: 'adj_01', transaction_id: 'txn_01', action: 'refund', status: 'approved', ...data },
  };
}

describe('Paddle signature', () => {
  const body = JSON.stringify(completed());

  it('accepts a correctly signed, fresh delivery', async () => {
    expect(await paddleSignatureValid(sign(body), body, SECRET, NOW)).toBe(true);
  });

  it('accepts any of several h1 values during a secret rotation', async () => {
    const valid = sign(body).split(';')[1];
    const header = `ts=${NOW};h1=${'0'.repeat(64)};${valid}`;
    expect(await paddleSignatureValid(header, body, SECRET, NOW)).toBe(true);
  });

  it('rejects a changed body, a wrong secret, a missing header and a stale timestamp', async () => {
    expect(await paddleSignatureValid(sign(body), body.replace('txn_01', 'txn_02'), SECRET, NOW)).toBe(false);
    expect(await paddleSignatureValid(sign(body, NOW, 'other'), body, SECRET, NOW)).toBe(false);
    expect(await paddleSignatureValid(null, body, SECRET, NOW)).toBe(false);
    expect(await paddleSignatureValid('ts=abc;h1=00', body, SECRET, NOW)).toBe(false);
    expect(await paddleSignatureValid(sign(body, NOW - 600), body, SECRET, NOW)).toBe(false);
  });
});

describe('Paddle notifications', () => {
  it('grants a completed checkout to the user in custom_data', () => {
    expect(paddleDecision(completed())).toEqual({
      action: 'grant',
      eventId: 'evt_01',
      transactionId: 'txn_01',
      userId: USER,
      occurredAt: '2026-11-15T18:00:00Z',
      lines: [{ productId: 'pro_30', quantity: 1, packId: 'pinch_credits_30' }],
    });
  });

  it('leaves the pack id to be looked up when the payload has no product', () => {
    const decision = paddleDecision(completed({ details: {} }));
    expect(decision.action === 'grant' && decision.lines).toEqual([
      { productId: 'pro_30', quantity: 1, packId: null },
    ]);
  });

  it('retries a checkout without a valid user id instead of dropping the payment', () => {
    expect(paddleDecision(completed({ custom_data: null }))).toMatchObject({ action: 'retry' });
    expect(paddleDecision(completed({ custom_data: { user_id: 'nope' } }))).toMatchObject({ action: 'retry' });
    expect(paddleDecision({ event_type: 'transaction.completed' })).toMatchObject({ action: 'retry' });
  });

  it('revokes approved refunds and chargebacks only', () => {
    expect(paddleDecision(adjustment({}))).toEqual({
      action: 'revoke',
      eventId: 'evt_02',
      transactionId: 'txn_01',
      adjustmentId: 'adj_01',
      kind: 'refund',
    });
    expect(paddleDecision(adjustment({ action: 'chargeback' }, 'adjustment.created'))).toMatchObject({
      action: 'revoke',
      kind: 'chargeback',
    });
    expect(paddleDecision(adjustment({ status: 'pending_approval' }))).toMatchObject({ action: 'ignore' });
    expect(paddleDecision(adjustment({ status: 'rejected' }))).toMatchObject({ action: 'ignore' });
    expect(paddleDecision(adjustment({ action: 'chargeback_warning' }))).toMatchObject({ action: 'ignore' });
    expect(paddleDecision(adjustment({ action: 'credit' }))).toMatchObject({ action: 'ignore' });
  });

  it('ignores other events', () => {
    expect(paddleDecision({ event_id: 'evt_03', event_type: 'transaction.paid', data: { id: 'txn_01' } })).toMatchObject({
      action: 'ignore',
    });
  });

  it('summarizes a delivery for the failure log', () => {
    expect(paddleEventSummary(completed())).toMatchObject({
      event_id: 'evt_01',
      transaction_id: 'txn_01',
      product_id: 'pinch_credits_30',
      app_user_id: USER,
      store: 'paddle',
    });
    expect(paddleEventSummary(adjustment({}))).toMatchObject({ transaction_id: 'txn_01' });
  });
});

describe('credit totals', () => {
  it('adds up packs and quantities, and refuses unknown packs', () => {
    expect(creditsFor([{ productId: 'a', quantity: 1, packId: 'pinch_credits_100' }])).toBe(100);
    expect(
      creditsFor([
        { productId: 'a', quantity: 2, packId: 'pinch_credits_10' },
        { productId: 'b', quantity: 1, packId: 'pinch_credits_30' },
      ]),
    ).toBe(50);
    expect(creditsFor([{ productId: 'a', quantity: 1, packId: 'something_else' }])).toBeNull();
    expect(creditsFor([{ productId: 'a', quantity: 1, packId: null }])).toBeNull();
  });

  it('talks to the sandbox API with sandbox keys', () => {
    expect(paddleApiBase('pdl_sdbx_apikey_x')).toBe('https://sandbox-api.paddle.com');
    expect(paddleApiBase('pdl_live_apikey_x')).toBe('https://api.paddle.com');
  });
});
