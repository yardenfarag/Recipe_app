import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import type { Db } from '../core/supabaseAdmin.ts';
import type { PushMessage } from '../nudges/expoPush.ts';
import { goingShoppingAvailableAt, goingShoppingText, sendGoingShopping } from './goingShopping.ts';

function fakeAdmin(answer: unknown) {
  const args: Record<string, unknown>[] = [];
  const givenBack: Record<string, unknown>[] = [];
  const admin = {
    rpc: (name: string, a: Record<string, unknown>) => {
      if (name === 'household_going_shopping_failed') {
        givenBack.push(a);
        return Promise.resolve({ data: true, error: null });
      }
      assertEquals(name, 'household_going_shopping');
      args.push(a);
      return Promise.resolve({ data: answer, error: null });
    },
    from: () => ({ delete: () => ({ in: () => Promise.resolve({ error: null }) }) }),
  };
  return { admin: admin as unknown as Db, args, givenBack };
}

const OK_ROW = {
  status: 'ok',
  sent_at: '2026-11-26T08:00:00.123456+00:00',
  actor_name: 'Dana',
  household_name: 'Flat 3',
  recipients: [{ user_id: 'u1', role: 'member', locale: 'en', push_tokens: ['ExponentPushToken[a]'] }],
};

Deno.test('the wait is 20 hours', () => {
  assertEquals(goingShoppingAvailableAt('2026-11-26T08:00:00.000Z'), '2026-11-27T04:00:00.000Z');
});

Deno.test('the push names who is going, in each recipient\'s language, and opens the list', () => {
  assertEquals(goingShoppingText('en', 'Dana'), {
    title: 'Dana is going shopping',
    body: 'Anything to add? Put it on the list now.',
    url: '/list',
  });
  assertEquals(goingShoppingText('ru', 'Dana').title, 'Dana идёт за покупками');
  assertEquals(goingShoppingText(null, '').title, 'Someone is going shopping');
});

Deno.test('sends to the others and counts the people reached', async () => {
  const { admin, args } = fakeAdmin({
    status: 'ok',
    sent_at: '2026-11-26T08:00:00+00:00',
    actor_name: 'Dana',
    household_name: 'Flat 3',
    recipients: [
      { user_id: 'u1', role: 'member', locale: 'he', push_tokens: ['ExponentPushToken[a]'] },
      { user_id: 'u2', role: 'member', locale: 'en', push_tokens: ['ExponentPushToken[b]'] },
    ],
  });
  const sent: PushMessage[] = [];
  const result = await sendGoingShopping({
    admin,
    userId: 'me',
    sendPush: (messages) => {
      sent.push(...messages);
      return Promise.resolve({ ok: ['ExponentPushToken[a]', 'ExponentPushToken[b]'], unregistered: [], failed: [] });
    },
  });
  assertEquals(args, [{ p_user_id: 'me', p_cooldown_hours: 20 }]);
  assertEquals(result, { status: 'ok', notified: 2, sent_at: '2026-11-26T08:00:00.000Z' });
  assertEquals(sent[0].title, 'Dana בדרך לסופר');
});

Deno.test('a second send within the wait is a 429 with when it opens again', async () => {
  const { admin } = fakeAdmin({ status: 'already_sent_today', sent_at: '2026-11-26T08:00:00+00:00' });
  const error = await assertRejects(
    () => sendGoingShopping({ admin, userId: 'me', sendPush: () => Promise.reject(new Error('no push')) }),
    HttpError,
  );
  assertEquals([error.status, error.code], [429, 'already_sent_today']);
  assertEquals(error.body.available_at, '2026-11-27T04:00:00.000Z');
});

Deno.test('when no phone could be reached, the send is given back and it is a 502 push_failed', async () => {
  const { admin, givenBack } = fakeAdmin(OK_ROW);
  const error = await assertRejects(
    () =>
      sendGoingShopping({
        admin,
        userId: 'me',
        sendPush: () => Promise.resolve({ ok: [], unregistered: [], failed: ['ExponentPushToken[a]'] }),
      }),
    HttpError,
  );
  assertEquals([error.status, error.code], [502, 'push_failed']);
  assertEquals(givenBack, [{ p_user_id: 'me', p_sent_at: OK_ROW.sent_at }]);
});

Deno.test('a push call that throws gives the send back too', async () => {
  const { admin, givenBack } = fakeAdmin(OK_ROW);
  const error = await assertRejects(
    () => sendGoingShopping({ admin, userId: 'me', sendPush: () => Promise.reject(new Error('network')) }),
    HttpError,
  );
  assertEquals(error.code, 'push_failed');
  assertEquals(givenBack.length, 1);
});

Deno.test('nobody with a phone is still a send (nothing failed, nothing given back)', async () => {
  const { admin, givenBack } = fakeAdmin({ ...OK_ROW, recipients: [] });
  const result = await sendGoingShopping({ admin, userId: 'me', sendPush: () => Promise.reject(new Error('unused')) });
  assertEquals(result.notified, 0);
  assertEquals(givenBack, []);
});

Deno.test('one phone reached is enough, even if another failed', async () => {
  const { admin, givenBack } = fakeAdmin({
    ...OK_ROW,
    recipients: [
      { user_id: 'u1', role: 'member', locale: 'en', push_tokens: ['ExponentPushToken[a]'] },
      { user_id: 'u2', role: 'member', locale: 'en', push_tokens: ['ExponentPushToken[b]'] },
    ],
  });
  const result = await sendGoingShopping({
    admin,
    userId: 'me',
    sendPush: () => Promise.resolve({ ok: ['ExponentPushToken[a]'], unregistered: [], failed: ['ExponentPushToken[b]'] }),
  });
  assertEquals(result.notified, 1);
  assertEquals(givenBack, []);
});

Deno.test('alone in the household is a 409', async () => {
  const { admin } = fakeAdmin({ status: 'alone' });
  const error = await assertRejects(
    () => sendGoingShopping({ admin, userId: 'me', sendPush: () => Promise.reject(new Error('no push')) }),
    HttpError,
  );
  assertEquals([error.status, error.code], [409, 'alone']);
});
