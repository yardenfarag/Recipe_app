import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';
import type { PushMessage, PushResult } from '../nudges/expoPush.ts';
import { activityText, runHouseholdActivity, type ActivityRow } from './activity.ts';

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: 1,
    kind: 'list_added',
    household_name: 'Flat 3',
    actor_name: 'Omer',
    subject_name: '',
    item_count: 4,
    recipients: [],
    ...overrides,
  };
}

const member = { role: 'member' as const, locale: 'en' };

/** Just enough of the Supabase client for runHouseholdActivity. */
function fakeAdmin(rows: ActivityRow[]) {
  const deletedTokens: string[] = [];
  const calls: string[] = [];
  const admin = {
    rpc: (name: string) => {
      calls.push(name);
      return Promise.resolve({ data: rows, error: null });
    },
    from: (table: string) => ({
      delete: () => ({
        in: (column: string, values: string[]) => {
          assertEquals([table, column], ['push_tokens', 'token']);
          deletedTokens.push(...values);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  };
  return { admin: admin as unknown as Db, deletedTokens, calls };
}

Deno.test('a burst of list items is one line with the count, and opens the list', () => {
  assertEquals(activityText(row(), member), {
    title: 'Flat 3',
    body: 'Omer added 4 items to the list.',
    url: '/list',
  });
  assertEquals(activityText(row({ item_count: 1 }), member)?.body, 'Omer added an item to the list.');
});

Deno.test('member events open the household page; the person removed gets their own line', () => {
  assertEquals(activityText(row({ kind: 'member_joined', actor_name: 'Dana' }), member)?.url, '/settings/household');
  assertStringIncludes(activityText(row({ kind: 'member_left', actor_name: 'Dana' }), member)!.body, 'Dana left');
  const removed = row({ kind: 'member_removed', actor_name: 'Omer', subject_name: 'Dana' });
  assertEquals(activityText(removed, member)?.body, 'Dana is no longer in the household.');
  assertEquals(
    activityText(removed, { role: 'subject', locale: 'en' })?.body,
    "You're no longer in Flat 3. You kept a copy of the list and pantry.",
  );
});

Deno.test('the recipient\'s language, a missing name and an unknown kind', () => {
  assertEquals(activityText(row({ actor_name: '  ' }), member)?.body, 'Someone added 4 items to the list.');
  assertStringIncludes(activityText(row(), { role: 'member', locale: 'he-IL' })!.body, 'Omer');
  assertStringIncludes(activityText(row(), { role: 'member', locale: 'he-IL' })!.body, 'פריטים');
  assertEquals(activityText(row({ household_name: '' }), member)?.title, 'Pinch');
  assertEquals(activityText(row({ kind: 'something_new' }), member), null);
});

Deno.test('one run sends each claimed row to every phone, counts people, and drops uninstalled phones', async () => {
  const rows = [
    row({
      recipients: [
        { user_id: 'u1', role: 'member', locale: 'en', push_tokens: ['ExponentPushToken[a]', 'ExponentPushToken[b]'] },
        { user_id: 'u2', role: 'member', locale: 'es', push_tokens: ['ExponentPushToken[c]'] },
        { user_id: 'u3', role: 'member', locale: 'en', push_tokens: [] },
      ],
    }),
    row({ id: 2, kind: 'member_joined', recipients: [] }),
  ];
  const { admin, deletedTokens, calls } = fakeAdmin(rows);
  const sent: PushMessage[][] = [];
  const result = await runHouseholdActivity({
    admin,
    sendPush: (messages): Promise<PushResult> => {
      sent.push(messages);
      return Promise.resolve({ ok: ['ExponentPushToken[a]'], unregistered: ['ExponentPushToken[c]'], failed: ['ExponentPushToken[b]'] });
    },
  });
  assertEquals(calls, ['household_activity_claim']);
  assertEquals(sent.length, 1, 'nothing is sent for a row nobody can receive');
  assertEquals(sent[0].map((m) => m.to), ['ExponentPushToken[a]', 'ExponentPushToken[b]', 'ExponentPushToken[c]']);
  assertEquals(sent[0][2].body, 'Omer añadió 4 artículos a la lista.');
  assertEquals(sent[0][0].data, { url: '/list' });
  assertEquals(deletedTokens, ['ExponentPushToken[c]']);
  assertEquals(result, { events: 2, notified: 1, failed: 1 });
});
