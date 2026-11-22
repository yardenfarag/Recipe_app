import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';
import { EMAIL_LOCALES } from '../email/copy.ts';
import { NUDGE_COPY } from '../email/nudgeCopy.ts';
import { renderNudgeEmail, type RenderedEmail } from '../email/render.ts';
import { sendPush, type PushMessage, type PushResult } from './expoPush.ts';
import {
  nudgeTarget,
  pushMessages,
  runNudges,
  shortTitle,
  unsubscribeUrl,
  type NudgeCandidate,
} from './nudges.ts';

const USER = '10000000-0000-4000-8000-00000000aa01';

function candidate(overrides: Partial<NudgeCandidate> = {}): NudgeCandidate {
  return {
    user_id: USER,
    email: 'cook@pinch.invalid',
    locale: 'en',
    recipe_id: null,
    recipe_title: null,
    unsubscribe_token: 'abc123',
    push_tokens: ['ExponentPushToken[aaa]'],
    email_sent: false,
    push_sent: false,
    ...overrides,
  };
}

/** Just enough of the Supabase client for runNudges. */
function fakeAdmin(rows: Record<string, NudgeCandidate[]>) {
  const inserted: Record<string, unknown>[] = [];
  const deletedTokens: string[] = [];
  const admin = {
    rpc: (name: string, args: { p_kind: string }) => {
      assertEquals(name, 'nudge_candidates');
      return Promise.resolve({ data: rows[args.p_kind] ?? [], error: null });
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        assertEquals(table, 'nudge_sends');
        inserted.push(row);
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        in: (column: string, values: string[]) => {
          assertEquals([table, column], ['push_tokens', 'token']);
          deletedTokens.push(...values);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { admin: admin as unknown as Db, inserted, deletedTokens };
}

Deno.test('every locale has both nudges, and day3 names the recipe', () => {
  for (const locale of EMAIL_LOCALES) {
    const copy = NUDGE_COPY[locale];
    for (const kind of ['day1', 'day3'] as const) {
      for (const [key, value] of Object.entries(copy[kind])) {
        assert(value.trim().length > 0, `${locale}.${kind}.${key} is empty`);
      }
    }
    assertStringIncludes(copy.day3.pushTitle, '{title}', `${locale} day3 push title`);
    assertStringIncludes(copy.day3.subject, '{title}', `${locale} day3 subject`);
    assert(!copy.day1.pushTitle.includes('{'), `${locale} day1 has no placeholder`);
  }
});

Deno.test('shortTitle keeps short titles and trims long ones', () => {
  assertEquals(shortTitle('  Crispy   tofu  '), 'Crispy tofu');
  const long = shortTitle('a'.repeat(100), 20);
  assertEquals(long.length, 20);
  assert(long.endsWith('…'));
  assertEquals(shortTitle(null), '');
});

Deno.test('nudgeTarget: day1 opens Snap, day3 the recipe, day3 without a recipe nothing', () => {
  assertEquals(nudgeTarget('day1', null), { path: '/add', web: 'https://pinch-app.io/app/add' });
  assertEquals(nudgeTarget('day3', 'r1'), { path: '/recipe/r1', web: 'https://pinch-app.io/app/recipe/r1' });
  assertEquals(nudgeTarget('day3', null), null);
});

Deno.test('unsubscribeUrl carries the user, token and language', () => {
  const url = new URL(unsubscribeUrl('https://x.supabase.co/', USER, 'tok', 'he'));
  assertEquals(url.origin + url.pathname, 'https://x.supabase.co/functions/v1/nudges');
  assertEquals(url.searchParams.get('u'), USER);
  assertEquals(url.searchParams.get('t'), 'tok');
  assertEquals(url.searchParams.get('l'), 'he');
});

Deno.test('nudge emails escape the recipe title and carry the unsubscribe link', () => {
  for (const locale of EMAIL_LOCALES) {
    const email = renderNudgeEmail({
      locale,
      kind: 'day3',
      title: 'Mac & <cheese>',
      link: 'https://pinch-app.io/app/recipe/r1',
      unsubscribeUrl: 'https://x.supabase.co/functions/v1/nudges?u=1&t=2',
    });
    assertStringIncludes(email.subject, 'Mac & <cheese>');
    assertStringIncludes(email.html, 'Mac &amp; &lt;cheese&gt;');
    assert(!email.html.includes('<cheese>'));
    assertStringIncludes(email.html, 'nudges?u=1&amp;t=2');
    assertStringIncludes(email.text, 'https://x.supabase.co/functions/v1/nudges?u=1&t=2');
    assertStringIncludes(email.html, NUDGE_COPY[locale].unsubscribeLink);
  }
});

Deno.test('pushMessages: one per phone, opening the app path', () => {
  const messages = pushMessages('day3', 'en', 'Shakshuka', '/recipe/r1', ['ExponentPushToken[a]', 'ExponentPushToken[b]']);
  assertEquals(messages.length, 2);
  assertEquals(messages[0].title, 'Dinner tonight: Shakshuka?');
  assertEquals(messages[1].data, { url: '/recipe/r1' });
});

Deno.test('runNudges sends push and email once, records both, and drops dead tokens', async () => {
  const { admin, inserted, deletedTokens } = fakeAdmin({
    day1: [candidate({ push_tokens: ['ExponentPushToken[live]', 'ExponentPushToken[dead]'] })],
    day3: [candidate({ user_id: 'u3', recipe_id: 'r9', recipe_title: 'Lemon pasta', push_tokens: [] })],
  });
  const pushed: PushMessage[][] = [];
  const emailed: { to: string; email: RenderedEmail; headers: Record<string, string> }[] = [];
  const result = await runNudges({
    admin,
    functionsBase: 'https://x.supabase.co',
    sendPush: (messages): Promise<PushResult> => {
      pushed.push(messages);
      return Promise.resolve({ ok: ['ExponentPushToken[live]'], unregistered: ['ExponentPushToken[dead]'], failed: [] });
    },
    sendEmail: (to, email, options) => {
      emailed.push({ to, email, headers: options.headers });
      return Promise.resolve('resend-id');
    },
  });

  assertEquals(result, { email: 2, push: 1, failed: 0 });
  assertEquals(pushed.length, 1);
  assertEquals(pushed[0][0].data.url, '/add');
  assertEquals(deletedTokens, ['ExponentPushToken[dead]']);
  assertEquals(inserted, [
    { user_id: USER, kind: 'day1', channel: 'push' },
    { user_id: USER, kind: 'day1', channel: 'email' },
    { user_id: 'u3', kind: 'day3', channel: 'email' },
  ]);
  assertStringIncludes(emailed[1].email.subject, 'Lemon pasta');
  assertStringIncludes(emailed[1].email.html, 'https://pinch-app.io/app/recipe/r9');
  assertStringIncludes(emailed[0].headers['List-Unsubscribe'], 'functions/v1/nudges?u=');
});

Deno.test('runNudges skips channels already sent, and keeps going after a failed email', async () => {
  const { admin, inserted } = fakeAdmin({
    day1: [
      candidate({ user_id: 'a', push_sent: true }),
      candidate({ user_id: 'b', email: null, push_tokens: [] }),
      candidate({ user_id: 'c', push_tokens: [] }),
    ],
  });
  let pushes = 0;
  let emails = 0;
  const result = await runNudges({
    admin,
    functionsBase: 'https://x.supabase.co',
    sendPush: () => {
      pushes++;
      return Promise.resolve({ ok: [], unregistered: [], failed: [] });
    },
    // The first email ('a') fails; 'b' has no address; 'c' goes out.
    sendEmail: () => (emails++ === 0 ? Promise.reject(new Error('boom')) : Promise.resolve('id')),
  });
  assertEquals(pushes, 0);
  assertEquals(result, { email: 1, push: 0, failed: 1 });
  assertEquals(inserted, [{ user_id: 'c', kind: 'day1', channel: 'email' }]);
});

Deno.test('sendPush reads Expo tickets in order', async () => {
  const fetchImpl = (_url: string | URL | Request, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as PushMessage[];
    assertEquals(sent.length, 3);
    return Promise.resolve(
      new Response(
        JSON.stringify({
          data: [
            { status: 'ok', id: '1' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'error', details: { error: 'MessageRateExceeded' } },
          ],
        }),
        { status: 200 },
      ),
    );
  };
  const messages = ['a', 'b', 'c'].map((t) => ({ to: t, title: 'T', body: 'B', data: { url: '/add' } }));
  const result = await sendPush(messages, { accessToken: '', fetchImpl: fetchImpl as typeof fetch });
  assertEquals(result, { ok: ['a'], unregistered: ['b'], failed: ['c'] });
});

Deno.test('sendPush counts every message as failed when Expo is down', async () => {
  const fetchImpl = () => Promise.resolve(new Response('nope', { status: 503 }));
  const result = await sendPush([{ to: 'a', title: 'T', body: 'B', data: { url: '/add' } }], {
    accessToken: '',
    fetchImpl: fetchImpl as typeof fetch,
  });
  assertEquals(result, { ok: [], unregistered: [], failed: ['a'] });
});
