import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';

import { sendPurchaseEmail, type PurchaseEmailInput } from './purchase.ts';
import {
  PURCHASE_ALERT_FROM,
  purchaseAlertRecipient,
  renderPurchaseAlertEmail,
  sendPurchaseAlert,
  type PurchaseAlertInput,
} from './purchaseAlert.ts';

function alert(overrides: Partial<PurchaseAlertInput> = {}): PurchaseAlertInput {
  return {
    userId: '11111111-2222-4333-8444-555555555555',
    buyerEmail: 'cook@example.com',
    credits: 30,
    provider: 'revenuecat',
    transactionId: 'txn_1',
    store: 'APP_STORE',
    purchasedAt: new Date('2026-11-25T14:03:59Z'),
    ...overrides,
  };
}

/**
 * An email_sends stand-in: `alreadySent` answers the "was it sent?" read, inserts are kept.
 * `buyerEmail` is the address auth.users has for the buyer.
 */
function fakeAdmin(alreadySent = false, buyerEmail: string | null = 'cook@example.com') {
  const inserts: Record<string, unknown>[] = [];
  const admin = {
    auth: {
      admin: {
        getUserById: () =>
          Promise.resolve({ data: { user: { email: buyerEmail, user_metadata: { locale: 'en' } } }, error: null }),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: alreadySent ? { id: 1 } : null, error: null }),
          }),
        }),
      }),
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as Db;
  return { admin, inserts };
}

/** Runs `run` with fetch replaced; returns the requests Resend would have received. */
async function withResend(
  status: number,
  run: () => Promise<void>,
): Promise<{ headers: Record<string, string>; body: Record<string, unknown> }[]> {
  const calls: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const realFetch = globalThis.fetch;
  const hadKey = Deno.env.get('RESEND_API_KEY');
  Deno.env.set('RESEND_API_KEY', 're_test');
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    calls.push({ headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    return Promise.resolve(new Response(JSON.stringify({ id: 'em_1', message: 'nope' }), { status }));
  }) as unknown as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
    if (hadKey === undefined) Deno.env.delete('RESEND_API_KEY');
    else Deno.env.set('RESEND_API_KEY', hadKey);
    Deno.env.delete('PURCHASE_ALERT_EMAIL');
  }
  return calls;
}

Deno.test('sale alert lists the credits, store, buyer, account, time and transaction', () => {
  const email = renderPurchaseAlertEmail(alert());
  assertEquals(email.subject, 'Pinch sale: 30 credits, App Store');
  assertEquals(
    email.text,
    [
      'Credits: 30',
      'Store: App Store',
      'Buyer: cook@example.com',
      'Account: 11111111-2222-4333-8444-555555555555',
      'When: 2026-11-25 14:03 UTC',
      'Reference: txn_1',
    ].join('\n'),
  );
  assertStringIncludes(email.html, 'Buyer: cook@example.com');
});

Deno.test('sale alert names each store, and says when the buyer is unknown', () => {
  assertStringIncludes(renderPurchaseAlertEmail(alert({ store: 'PLAY_STORE' })).subject, 'Google Play');
  assertStringIncludes(renderPurchaseAlertEmail(alert({ store: 'polar' })).subject, 'Web (Polar)');
  assertStringIncludes(renderPurchaseAlertEmail(alert({ store: null })).subject, 'Other store');
  assertStringIncludes(renderPurchaseAlertEmail(alert({ buyerEmail: null })).text, 'Buyer: unknown');
});

Deno.test('sale alert shows the price in the subject and under the credits', () => {
  const email = renderPurchaseAlertEmail(alert({ price: { amount: 4.99, currency: 'USD', usd: null } }));
  assertEquals(email.subject, 'Pinch sale: 30 credits, App Store, 4.99 USD');
  assert(email.text.startsWith('Credits: 30\nPrice: 4.99 USD\nStore: App Store\n'));

  // Paid in another currency: the dollar amount goes beside it in the body only.
  const abroad = renderPurchaseAlertEmail(alert({ price: { amount: 17.9, currency: 'ILS', usd: 4.99 } }));
  assertEquals(abroad.subject, 'Pinch sale: 30 credits, App Store, 17.90 ILS');
  assertStringIncludes(abroad.text, 'Price: 17.90 ILS (4.99 USD)\n');

  // No price from the store: no line. A free order is still a price.
  assert(!renderPurchaseAlertEmail(alert({ price: null })).text.includes('Price'));
  assertStringIncludes(renderPurchaseAlertEmail(alert({ price: { amount: 0, currency: 'USD' } })).text, 'Price: 0.00 USD');
});

Deno.test('a sandbox purchase is marked as a test sale', () => {
  const email = renderPurchaseAlertEmail(alert({ sandbox: true }));
  assertEquals(email.subject, 'Pinch test sale: 30 credits, App Store');
  assert(email.text.startsWith('Sandbox test purchase. Nobody paid.\n\nCredits: 30'));
});

Deno.test('sale alert escapes what it prints', () => {
  const email = renderPurchaseAlertEmail(alert({ transactionId: '<script>', buyerEmail: 'a&b@example.com' }));
  assert(!email.html.includes('<script>'));
  assertStringIncludes(email.html, 'a&amp;b@example.com');
});

Deno.test('alerts go to support@ unless PURCHASE_ALERT_EMAIL names an address or says none', () => {
  assertEquals(purchaseAlertRecipient(undefined), 'support@pinch-app.io');
  assertEquals(purchaseAlertRecipient(''), 'support@pinch-app.io');
  assertEquals(purchaseAlertRecipient('not an address'), 'support@pinch-app.io');
  assertEquals(purchaseAlertRecipient(' owner@example.com '), 'owner@example.com');
  assertEquals(purchaseAlertRecipient('none'), null);
  assertEquals(purchaseAlertRecipient(' None '), null);
});

Deno.test('sendPurchaseAlert emails support@ once per transaction and records it', async () => {
  const { admin, inserts } = fakeAdmin();
  const calls = await withResend(200, () => sendPurchaseAlert(admin, alert()));

  assertEquals(calls.length, 1);
  assertEquals(calls[0].body.to, ['support@pinch-app.io']);
  assertEquals(calls[0].body.from, PURCHASE_ALERT_FROM);
  assertEquals(calls[0].body.subject, 'Pinch sale: 30 credits, App Store');
  assertEquals(calls[0].headers['Idempotency-Key'], 'purchase/alert/revenuecat/txn_1');
  assertEquals(inserts, [
    {
      kind: 'purchase',
      dedupe_key: 'alert/revenuecat/txn_1',
      user_id: '11111111-2222-4333-8444-555555555555',
      resend_id: 'em_1',
    },
  ]);
});

Deno.test('sendPurchaseAlert sends nothing for a transaction it already reported', async () => {
  const { admin, inserts } = fakeAdmin(true);
  const calls = await withResend(200, () => sendPurchaseAlert(admin, alert()));
  assertEquals(calls.length, 0);
  assertEquals(inserts.length, 0);
});

Deno.test('sendPurchaseAlert follows PURCHASE_ALERT_EMAIL', async () => {
  const other = fakeAdmin();
  const sent = await withResend(200, () => {
    Deno.env.set('PURCHASE_ALERT_EMAIL', 'owner@example.com');
    return sendPurchaseAlert(other.admin, alert());
  });
  assertEquals(sent[0].body.to, ['owner@example.com']);

  const off = fakeAdmin();
  const none = await withResend(200, () => {
    Deno.env.set('PURCHASE_ALERT_EMAIL', 'none');
    return sendPurchaseAlert(off.admin, alert());
  });
  assertEquals(none.length, 0);
  assertEquals(off.inserts.length, 0);
});

Deno.test('a failed alert never throws, and leaves no record so a retry sends it', async () => {
  const { admin, inserts } = fakeAdmin();
  const calls = await withResend(500, () => sendPurchaseAlert(admin, alert()));
  assertEquals(calls.length, 1);
  assertEquals(inserts.length, 0);
});

const PURCHASE: PurchaseEmailInput = {
  userId: '11111111-2222-4333-8444-555555555555',
  credits: 30,
  balance: 30,
  provider: 'polar',
  transactionId: 'order_1',
  store: 'polar',
  purchasedAt: new Date('2026-11-25T14:03:59Z'),
};

Deno.test('a purchase sends the buyer their receipt, then the team its alert', async () => {
  const { admin, inserts } = fakeAdmin();
  const calls = await withResend(200, () =>
    sendPurchaseEmail(admin, { ...PURCHASE, price: { amount: 4.99, currency: 'USD' } }),
  );

  assertEquals(calls.map((call) => call.body.to), [['cook@example.com'], ['support@pinch-app.io']]);
  assertEquals(calls[1].body.subject, 'Pinch sale: 30 credits, Web (Polar), 4.99 USD');
  assertStringIncludes(String(calls[1].body.text), 'Buyer: cook@example.com');
  assertStringIncludes(String(calls[1].body.text), 'Price: 4.99 USD');
  // The buyer's receipt is unchanged: the store's own receipt carries the price.
  assert(!String(calls[0].body.text).includes('4.99'));
  assertEquals(inserts.map((row) => row.dedupe_key), ['polar/order_1', 'alert/polar/order_1']);
});

Deno.test('the team still gets its alert when the buyer has no address', async () => {
  const { admin } = fakeAdmin(false, null);
  const calls = await withResend(200, () => sendPurchaseEmail(admin, PURCHASE));
  assertEquals(calls.map((call) => call.body.to), [['support@pinch-app.io']]);
  assertStringIncludes(String(calls[0].body.text), 'Buyer: unknown');
});

Deno.test('the team still gets its alert when the receipt fails to send', async () => {
  const { admin } = fakeAdmin();
  let attempt = 0;
  const calls = await withResend(200, async () => {
    const stubbed = globalThis.fetch;
    // The first send (the receipt) fails; the second (the alert) goes through.
    globalThis.fetch = ((url: string, init: RequestInit) =>
      attempt++ === 0
        ? Promise.resolve(new Response(JSON.stringify({ message: 'nope' }), { status: 500 }))
        : stubbed(url, init)) as unknown as typeof fetch;
    await sendPurchaseEmail(admin, PURCHASE);
  });
  assertEquals(calls.map((call) => call.body.to), [['support@pinch-app.io']]);
});
