import { assert, assertEquals, assertMatch, assertStringIncludes } from 'jsr:@std/assert@1';

import { emailsForAuthHook, verifyLink, type AuthHookPayload } from './authHook.ts';
import { COPY, EMAIL_LOCALES, fill, pickLocale } from './copy.ts';
import {
  escapeHtml,
  purchaseStore,
  renderCodeEmail,
  renderEmailChangeEmail,
  renderPurchaseEmail,
  renderResetEmail,
  renderWelcomeEmail,
  type RenderedEmail,
} from './render.ts';
import { totalCredits } from './purchase.ts';
import { EMAIL_FROM, sendEmail } from './send.ts';

const SUPABASE_URL = 'https://example.supabase.co';

function allKinds(locale: (typeof EMAIL_LOCALES)[number]): RenderedEmail[] {
  return [
    renderCodeEmail({ locale, code: '123456', purpose: 'signin' }),
    renderCodeEmail({ locale, code: '654321', purpose: 'reauth' }),
    renderResetEmail({ locale, code: '111222', link: 'https://example.com/reset?a=1&b=2' }),
    renderEmailChangeEmail({ locale, link: 'https://example.com/change' }),
    renderWelcomeEmail({ locale }),
    renderPurchaseEmail({
      locale,
      credits: 30,
      balance: 42,
      store: 'app_store',
      date: new Date('2026-11-15T12:00:00Z'),
      reference: 'txn_123',
    }),
  ];
}

Deno.test('pickLocale falls back to English', () => {
  assertEquals(pickLocale('he'), 'he');
  assertEquals(pickLocale('ES'), 'es');
  assertEquals(pickLocale('ru-RU'), 'ru');
  assertEquals(pickLocale('de'), 'en');
  assertEquals(pickLocale(undefined), 'en');
  assertEquals(pickLocale(42), 'en');
});

Deno.test('every language has every string, and no placeholder is left unfilled', () => {
  const keys = Object.keys(COPY.en).sort();
  for (const locale of EMAIL_LOCALES) {
    assertEquals(Object.keys(COPY[locale]).sort(), keys, `${locale} keys`);
    assertEquals(COPY[locale].welcomeFeatures.length, COPY.en.welcomeFeatures.length, `${locale} features`);
    for (const email of allKinds(locale)) {
      assert(!/\{\w+\}/.test(email.subject), `${locale}: ${email.subject}`);
      assert(!/\{\w+\}/.test(email.text), `${locale} text: ${email.subject}`);
      assert(email.subject.length > 0 && email.subject.length < 120, `${locale} subject length`);
    }
  }
});

Deno.test('Hebrew and Arabic render right-to-left, codes stay left-to-right', () => {
  for (const locale of ['he', 'ar'] as const) {
    const email = renderCodeEmail({ locale, code: '123456', purpose: 'signin' });
    assertStringIncludes(email.html, `<html lang="${locale}" dir="rtl">`);
    assertMatch(email.html, /dir="ltr"[^>]*>123456</);
  }
  assertStringIncludes(renderWelcomeEmail({ locale: 'en' }).html, 'dir="ltr"');
});

Deno.test('Hebrew and Arabic use Arial/Tahoma on every heading and paragraph', () => {
  for (const locale of ['he', 'ar'] as const) {
    for (const email of allKinds(locale)) {
      assert(!email.html.includes('-apple-system'), `${locale}: ${email.subject}`);
      for (const tag of email.html.match(/<(h1|p) style="[^"]*"/g) ?? []) {
        assertStringIncludes(tag, 'font-family:Arial, Tahoma');
      }
    }
  }
  const en = renderWelcomeEmail({ locale: 'en' }).html;
  assertMatch(en, /<h1 style="font-family:-apple-system/);
  // The code keeps its monospace font: it comes later in the same style, so it wins.
  assertMatch(renderCodeEmail({ locale: 'he', code: '1', purpose: 'signin' }).html, /font-family:Arial[^"]*font-family:'SF Mono'/);
});

Deno.test('sign-in code email shows the code in the subject, html and text', () => {
  const email = renderCodeEmail({ locale: 'en', code: '482913', purpose: 'signin' });
  assertEquals(email.subject, 'Your Pinch code: 482913');
  assertStringIncludes(email.html, '482913');
  assertStringIncludes(email.text, '482913');
  assertStringIncludes(email.html, 'https://pinch-app.io/icon-192.png');
});

Deno.test('code emails link to the copy page with the code and language', () => {
  const signin = renderCodeEmail({ locale: 'he', code: '482913', purpose: 'signin' });
  assertStringIncludes(signin.html, 'href="https://pinch-app.io/code.html?l=he#482913"');
  assertStringIncludes(signin.html, COPY.he.codeCopy);
  const reset = renderResetEmail({ locale: 'es', code: '111222', link: 'https://e.com' });
  assertStringIncludes(reset.html, 'href="https://pinch-app.io/code.html?l=es#111222"');
});

Deno.test('links and values are escaped', () => {
  assertEquals(escapeHtml(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  const reset = renderResetEmail({ locale: 'en', code: '1', link: 'https://e.com/?a=1&b="2"' });
  assertStringIncludes(reset.html, 'href="https://e.com/?a=1&amp;b=&quot;2&quot;"');
  const purchase = renderPurchaseEmail({
    locale: 'en',
    credits: 10,
    balance: null,
    store: 'paddle',
    date: new Date('2026-01-02T00:00:00Z'),
    reference: '<script>',
  });
  assert(!purchase.html.includes('<script>'));
});

Deno.test('purchase email lists credits, balance, store and date', () => {
  const email = renderPurchaseEmail({
    locale: 'en',
    credits: 30,
    balance: 42,
    store: 'play_store',
    date: new Date('2026-11-15T12:00:00Z'),
    reference: 'GPA.1234',
  });
  assertEquals(email.subject, 'Your 30 Pinch credits are in 🎉');
  for (const piece of ['+30', '42', 'Google Play', 'November 15, 2026', 'GPA.1234']) {
    assertStringIncludes(email.html, piece);
  }
  assert(!renderPurchaseEmail({ locale: 'en', credits: 10, balance: null, store: 'paddle', date: new Date(), reference: 'x' }).html.includes('Your balance now'));
});

Deno.test('purchase email balance adds the unused free monthly credits', () => {
  assertEquals(totalCredits(191, 2), 199);
  assertEquals(totalCredits(191, 0), 201);
  assertEquals(totalCredits(191, 25), 191);
  assertEquals(totalCredits(0, 10), 0);
});

Deno.test('purchaseStore maps RevenueCat, Paddle and Polar stores', () => {
  assertEquals(purchaseStore('APP_STORE'), 'app_store');
  assertEquals(purchaseStore('MAC_APP_STORE'), 'app_store');
  assertEquals(purchaseStore('PLAY_STORE'), 'play_store');
  assertEquals(purchaseStore('paddle'), 'paddle');
  assertEquals(purchaseStore('polar'), 'polar');
  assertEquals(purchaseStore('STRIPE'), 'other');
  assertEquals(purchaseStore(null), 'other');
});

Deno.test('fill leaves unknown placeholders visible', () => {
  assertEquals(fill('{a} and {b}', { a: 1 }), '1 and {b}');
});

function payload(type: string, extra: Partial<AuthHookPayload['email_data']> = {}, user: Partial<AuthHookPayload['user']> = {}): AuthHookPayload {
  return {
    user: { id: 'u1', email: 'cook@example.com', user_metadata: { locale: 'he' }, ...user },
    email_data: { token: '123456', token_hash: 'hash1', redirect_to: 'pinch://reset-password', email_action_type: type, ...extra },
  };
}

Deno.test('auth hook: sign-in codes for magiclink and signup, in the saved language', () => {
  for (const type of ['magiclink', 'signup']) {
    const [out, ...rest] = emailsForAuthHook(payload(type), SUPABASE_URL);
    assertEquals(rest.length, 0);
    assertEquals(out.to, 'cook@example.com');
    assertEquals(out.email.subject, fill(COPY.he.codeSubject, { code: '123456' }));
  }
});

Deno.test('auth hook: recovery sends the code and a verify link back to the app', () => {
  const [out] = emailsForAuthHook(payload('recovery'), SUPABASE_URL);
  assertEquals(out.email.subject, COPY.he.resetSubject);
  assertStringIncludes(out.email.html, '123456');
  assertStringIncludes(
    out.email.text,
    'https://example.supabase.co/auth/v1/verify?token=hash1&type=recovery&redirect_to=pinch%3A%2F%2Freset-password',
  );
});

Deno.test('auth hook: email change confirms both addresses', () => {
  const out = emailsForAuthHook(
    payload('email_change', { token_hash_new: 'hash2' }, { new_email: 'new@example.com' }),
    SUPABASE_URL,
  );
  assertEquals(out.map((o) => o.to), ['new@example.com', 'cook@example.com']);
  assertStringIncludes(out[0].email.text, 'token=hash1');
  assertStringIncludes(out[1].email.text, 'token=hash2');
});

Deno.test('auth hook: nothing to send without an address or token, or for unknown types', () => {
  assertEquals(emailsForAuthHook(payload('magiclink', { token: '' }), SUPABASE_URL), []);
  assertEquals(emailsForAuthHook(payload('magiclink', {}, { email: '' }), SUPABASE_URL), []);
  assertEquals(emailsForAuthHook(payload('something_new'), SUPABASE_URL), []);
});

Deno.test('verifyLink leaves out redirect_to when there is none', () => {
  assertEquals(verifyLink(SUPABASE_URL, 'h', 'recovery'), 'https://example.supabase.co/auth/v1/verify?token=h&type=recovery');
});

Deno.test('sendEmail posts to Resend from hello@ with an idempotency key', async () => {
  Deno.env.set('RESEND_API_KEY', 're_test');
  let seen: { url: string; init: RequestInit } | null = null;
  const fakeFetch = ((url: string, init: RequestInit) => {
    seen = { url, init };
    return Promise.resolve(new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }));
  }) as unknown as typeof fetch;

  const id = await sendEmail('cook@example.com', renderWelcomeEmail({ locale: 'en' }), {
    idempotencyKey: 'welcome/u1',
    fetchImpl: fakeFetch,
  });
  assertEquals(id, 'em_1');
  const call = seen as unknown as { url: string; init: RequestInit };
  assertEquals(call.url, 'https://api.resend.com/emails');
  const headers = call.init.headers as Record<string, string>;
  assertEquals(headers['Idempotency-Key'], 'welcome/u1');
  assertEquals(headers.Authorization, 'Bearer re_test');
  const body = JSON.parse(String(call.init.body));
  assertEquals(body.from, EMAIL_FROM);
  assertEquals(body.reply_to, 'support@pinch-app.io');
  assertEquals(body.to, ['cook@example.com']);
});

Deno.test('sendEmail surfaces Resend errors', async () => {
  Deno.env.set('RESEND_API_KEY', 're_test');
  const fakeFetch = (() =>
    Promise.resolve(new Response(JSON.stringify({ message: 'domain not verified' }), { status: 403 }))) as unknown as typeof fetch;
  let message = '';
  try {
    await sendEmail('a@b.co', renderWelcomeEmail({ locale: 'en' }), { fetchImpl: fakeFetch });
  } catch (error) {
    message = (error as Error).message;
  }
  assertEquals(message, 'domain not verified');
});
