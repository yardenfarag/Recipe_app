import { assertEquals } from 'jsr:@std/assert@1';

import type { Db } from './supabaseAdmin.ts';
import { ADMIN_DAILY_LIMIT, reserveDailyAiUsage } from './dailyAiUsage.ts';

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
