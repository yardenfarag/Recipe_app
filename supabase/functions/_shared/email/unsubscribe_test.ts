import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';
import {
  readPreferenceRequest,
  redirectToUnsubscribePage,
  setEmailOptOut,
  unsubscribeHeaders,
  unsubscribeLinks,
} from './unsubscribe.ts';

const USER = '10000000-0000-4000-8000-00000000aa01';
const TOKEN = 'a'.repeat(64);

Deno.test('unsubscribeLinks: the page carries the language, the one-click address goes to email-preferences', () => {
  const links = unsubscribeLinks('https://x.supabase.co/', USER, TOKEN, 'he');
  const page = new URL(links.page);
  assertEquals(page.origin + page.pathname, 'https://pinch-app.io/app/unsubscribe');
  assertEquals([...page.searchParams], [['u', USER], ['t', TOKEN], ['l', 'he']]);
  const oneClick = new URL(links.oneClick);
  assertEquals(oneClick.origin + oneClick.pathname, 'https://x.supabase.co/functions/v1/email-preferences');
  assertEquals([...oneClick.searchParams], [['u', USER], ['t', TOKEN]]);
});

Deno.test('unsubscribeHeaders follow RFC 8058', () => {
  assertEquals(unsubscribeHeaders({ page: 'https://p', oneClick: 'https://o?u=1' }), {
    'List-Unsubscribe': '<https://o?u=1>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  });
});

Deno.test('readPreferenceRequest: the page sends JSON, either way', () => {
  const url = new URL('https://x.supabase.co/functions/v1/email-preferences');
  assertEquals(readPreferenceRequest(url, JSON.stringify({ user_id: USER, token: TOKEN, opt_out: false })), {
    userId: USER,
    token: TOKEN,
    optOut: false,
  });
  assertEquals(readPreferenceRequest(url, JSON.stringify({ user_id: USER, token: TOKEN, opt_out: 'yes' })), null);
  assertEquals(readPreferenceRequest(url, '{not json'), null);
});

Deno.test('readPreferenceRequest: a mail app one-click POST always unsubscribes', () => {
  const url = new URL(`https://x.supabase.co/functions/v1/email-preferences?u=${USER}&t=${TOKEN}`);
  assertEquals(readPreferenceRequest(url, 'List-Unsubscribe=One-Click'), { userId: USER, token: TOKEN, optOut: true });
  assertEquals(readPreferenceRequest(url, ''), { userId: USER, token: TOKEN, optOut: true });
  assertEquals(readPreferenceRequest(new URL('https://x.supabase.co/functions/v1/email-preferences'), ''), null);
});

Deno.test('redirectToUnsubscribePage keeps the account and token and picks a known language', () => {
  const response = redirectToUnsubscribePage(new URL(`https://x/functions/v1/nudges?u=${USER}&t=${TOKEN}&l=de`));
  assertEquals(response.status, 303);
  assertEquals(response.headers.get('Location'), `https://pinch-app.io/app/unsubscribe?u=${USER}&t=${TOKEN}&l=en`);
});

function fakeAdmin(answer: { data: unknown; error: unknown }) {
  const calls: { name: string; args: unknown }[] = [];
  const admin = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(answer);
    },
  };
  return { admin: admin as unknown as Db, calls };
}

Deno.test('setEmailOptOut asks the database only for a well-formed link', async () => {
  const { admin, calls } = fakeAdmin({ data: true, error: null });
  assertEquals(await setEmailOptOut(admin, { userId: 'not-a-uuid', token: TOKEN, optOut: true }), false);
  assertEquals(await setEmailOptOut(admin, { userId: USER, token: 'short', optOut: true }), false);
  assertEquals(calls, []);

  assertEquals(await setEmailOptOut(admin, { userId: USER, token: TOKEN, optOut: false }), true);
  assertEquals(calls, [
    { name: 'email_set_opt_out', args: { p_user_id: USER, p_token: TOKEN, p_opt_out: false } },
  ]);
});

Deno.test('setEmailOptOut: a wrong token changes nothing, a database failure throws', async () => {
  assertEquals(await setEmailOptOut(fakeAdmin({ data: false, error: null }).admin, { userId: USER, token: TOKEN, optOut: true }), false);
  await assertRejects(() =>
    setEmailOptOut(fakeAdmin({ data: null, error: { message: 'down' } }).admin, { userId: USER, token: TOKEN, optOut: true }),
  );
});
