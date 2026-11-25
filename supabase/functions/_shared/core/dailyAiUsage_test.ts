import { assertEquals, assertRejects, assertStrictEquals } from 'jsr:@std/assert@1';

import type { Db } from './supabaseAdmin.ts';
import { ADMIN_DAILY_LIMIT, reserveDailyAiUsage, withDailyAiUsage } from './dailyAiUsage.ts';
import { HttpError } from './httpError.ts';

type RpcCall = { fn: string; args: Record<string, unknown> };

/** A stub with just the calls reserveDailyAiUsage makes: the profile lookup and the reserve RPC. */
function stubDb(opts: { isAdmin: boolean | null; profileError?: boolean; reserveResult: number }) {
  const calls: RpcCall[] = [];
  const db = {
    from(table: string) {
      if (table !== 'profiles') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve(
                opts.profileError
                  ? { data: null, error: { message: 'boom' } }
                  : { data: opts.isAdmin === null ? null : { is_admin: opts.isAdmin }, error: null },
              ),
          }),
        }),
      };
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve({ data: opts.reserveResult, error: null });
    },
  };
  return { db: db as unknown as Db, calls };
}

Deno.test('a user keeps the daily limit', async () => {
  const { db, calls } = stubDb({ isAdmin: false, reserveResult: -1 });
  assertEquals(await reserveDailyAiUsage(db, 'u1', 'content_gate', 40, '2026-11-21'), 'limited');
  assertEquals(calls[0].args.p_limit, 40);
});

Deno.test('an admin is counted but never limited', async () => {
  const { db, calls } = stubDb({ isAdmin: true, reserveResult: 41 });
  assertEquals(await reserveDailyAiUsage(db, 'admin', 'content_gate', 40, '2026-11-21'), 'ok');
  assertEquals(calls[0].fn, 'reserve_daily_ai_usage');
  assertEquals(calls[0].args.p_limit, ADMIN_DAILY_LIMIT);
});

Deno.test('a failed admin lookup falls back to the normal limit', async () => {
  const { db, calls } = stubDb({ isAdmin: null, profileError: true, reserveResult: 3 });
  assertEquals(await reserveDailyAiUsage(db, 'u1', 'remix', 10, '2026-11-21'), 'ok');
  assertEquals(calls[0].args.p_limit, 10);
});

// ---- withDailyAiUsage ----

/** A stub for the reserve and refund RPCs, with the user not an admin. */
function meteringDb(reserveResult: number | 'error') {
  const calls: RpcCall[] = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { is_admin: false }, error: null }) }) }),
    }),
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      if (fn === 'refund_daily_ai_usage') return Promise.resolve({ data: true, error: null });
      return Promise.resolve(
        reserveResult === 'error' ? { data: null, error: { message: 'down' } } : { data: reserveResult, error: null },
      );
    },
  };
  return { db: db as unknown as Db, calls, fns: () => calls.map((c) => c.fn) };
}

Deno.test('withDailyAiUsage runs the work and keeps the use', async () => {
  const { db, fns } = meteringDb(3);
  assertEquals(await withDailyAiUsage(db, 'u1', 'translation', 10, () => Promise.resolve('done')), 'done');
  assertEquals(fns(), ['reserve_daily_ai_usage']);
});

Deno.test('withDailyAiUsage refunds the same day when the work throws, then rethrows', async () => {
  const { db, calls, fns } = meteringDb(3);
  const failure = new HttpError(200, 'translation_empty', "Couldn't translate this recipe. Try again.");
  const err = await assertRejects(() =>
    withDailyAiUsage(db, 'u1', 'translation', 10, () => Promise.reject(failure), { usageDate: '2026-11-24' }),
  );
  assertStrictEquals(err, failure);
  assertEquals(fns(), ['reserve_daily_ai_usage', 'refund_daily_ai_usage']);
  assertEquals(calls[1].args, { p_user_id: 'u1', p_action: 'translation', p_usage_date: '2026-11-24' });
});

Deno.test('withDailyAiUsage at the cap: no work, the daily_limit 429, onLimited first', async () => {
  const { db, fns } = meteringDb(-1);
  let worked = false;
  let logged = false;
  const err = await assertRejects(() =>
    withDailyAiUsage(db, 'u1', 'fridge_match', 5, () => Promise.resolve((worked = true)), {
      onLimited: () => Promise.resolve((logged = true)),
    }),
  );
  assertEquals([worked, logged], [false, true]);
  assertEquals(err instanceof HttpError && [err.status, JSON.stringify(err.body)], [
    429,
    '{"status":"failed","code":"daily_limit","message":"daily_limit"}',
  ]);
  assertEquals(fns(), ['reserve_daily_ai_usage']);
});

Deno.test("withDailyAiUsage at the cap uses the function's own body (transform-recipe's)", async () => {
  const { db } = meteringDb(-1);
  const limited = new HttpError(429, 'daily_limit', 'daily_limit', { remix_daily_limit: 5 });
  const err = await assertRejects(() => withDailyAiUsage(db, 'u1', 'remix', 5, () => Promise.resolve(1), { limited }));
  assertStrictEquals(err, limited);
});

Deno.test('withDailyAiUsage: a failed reserve is the metering_error 500, with no work and no refund', async () => {
  const { db, fns } = meteringDb('error');
  const err = await assertRejects(() => withDailyAiUsage(db, 'u1', 'translation', 10, () => Promise.resolve(1)));
  assertEquals(err instanceof HttpError && [err.status, JSON.stringify(err.body)], [
    500,
    '{"status":"failed","code":"metering_error","message":"metering_error"}',
  ]);
  assertEquals(fns(), ['reserve_daily_ai_usage']);
});
