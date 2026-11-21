import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

import type { Db } from './supabaseAdmin.ts';
import {
  CREDIT_REPLAY_WINDOW_MS,
  markSignedInExtractCompensationPending,
  reserveSignedInExtract,
  scopedIdempotencyKey,
} from './quotas.ts';

interface FakeReservation {
  id: string;
  key: string;
  status: 'reserved' | 'finalized' | 'refunded';
  finalized_at: string | null;
}

/** Just enough of the admin client for quotas.ts: the reserve RPC and the snapshot reads. */
function fakeDb() {
  const reservations: FakeReservation[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  let charged = 0;

  const db = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === 'reserve_recipe_credit') {
        const key = String(args.p_idempotency_key);
        const existing = reservations.find((r) => r.key === key);
        if (existing) {
          return Promise.resolve({
            data: { reservation_id: existing.id, source: 'monthly_free', status: existing.status, fresh: false },
            error: null,
          });
        }
        const row: FakeReservation = {
          id: crypto.randomUUID(),
          key,
          status: 'reserved',
          finalized_at: null,
        };
        reservations.push(row);
        charged += 1;
        return Promise.resolve({
          data: { reservation_id: row.id, source: 'monthly_free', status: 'reserved', fresh: true },
          error: null,
        });
      }
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: () => {
          if (table === 'profiles') return Promise.resolve({ data: { token_balance: 0 }, error: null });
          if (table === 'extract_usage_monthly') {
            return Promise.resolve({ data: { extract_count: 1 }, error: null });
          }
          if (table === 'credit_reservations') {
            const row = reservations.find((r) => r.id === filters.id);
            return Promise.resolve({ data: row ? { finalized_at: row.finalized_at } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  };

  return {
    admin: db as unknown as Db,
    reservations,
    rpcCalls,
    charged: () => charged,
    finalize(id: string, msAgo: number) {
      const row = reservations.find((r) => r.id === id)!;
      row.status = 'finalized';
      row.finalized_at = new Date(Date.now() - msAgo).toISOString();
    },
  };
}

const USER = '00000000-0000-4000-8000-000000000001';
const opts = (scope: string) => ({ scope, replayWindowMs: CREDIT_REPLAY_WINDOW_MS });

Deno.test('the reservation key binds the request id to what is being bought', async () => {
  const a = await scopedIdempotencyKey('request-123', 'youtube|abc');
  const b = await scopedIdempotencyKey('request-123', 'youtube|xyz');
  assert(a.startsWith('request-123:'));
  assertNotEquals(a, b);
  assertEquals(a, await scopedIdempotencyKey(' request-123 ', 'youtube|abc'));
});

Deno.test('one request id cannot pay for a different link', async () => {
  const db = fakeDb();
  const first = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(first.ok);
  db.finalize(first.reservation.reservationId, 1_000);

  const other = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|xyz'));
  assert(other.ok);
  assertNotEquals(other.reservation.reservationId, first.reservation.reservationId);
  assertEquals(other.reservation.replayed, undefined);
  assertEquals(db.charged(), 2);
});

Deno.test('a retry of the same link right after it was spent replays for free', async () => {
  const db = fakeDb();
  const first = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(first.ok);
  db.finalize(first.reservation.reservationId, 60_000);

  const retry = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(retry.ok);
  assertEquals(retry.reservation.reservationId, first.reservation.reservationId);
  assertEquals(retry.reservation.replayed, true);
  assertEquals(db.charged(), 1);
});

Deno.test('the same link long after it was spent is a new, idempotent purchase', async () => {
  const db = fakeDb();
  const first = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(first.ok);
  db.finalize(first.reservation.reservationId, CREDIT_REPLAY_WINDOW_MS + 60_000);

  const later = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(later.ok);
  assertNotEquals(later.reservation.reservationId, first.reservation.reservationId);
  assertEquals(later.reservation.replayed, undefined);
  assertEquals(db.charged(), 2);

  // A retry of that second purchase finds it again instead of charging a third time.
  const again = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(again.ok);
  assertEquals(again.reservation.reservationId, later.reservation.reservationId);
  assertEquals(db.charged(), 2);
});

Deno.test('a replay window of 0 never gives spent work away again', async () => {
  const db = fakeDb();
  const first = await reserveSignedInExtract(db.admin, USER, 'request-123', {
    scope: 'repair|recipe',
    replayWindowMs: 0,
  });
  assert(first.ok);
  db.finalize(first.reservation.reservationId, 0);

  const again = await reserveSignedInExtract(db.admin, USER, 'request-123', {
    scope: 'repair|recipe',
    replayWindowMs: 0,
  });
  assert(again.ok);
  assertNotEquals(again.reservation.reservationId, first.reservation.reservationId);
  assertEquals(db.charged(), 2);
});

Deno.test('a duplicate of a request still in flight shares its credit', async () => {
  const db = fakeDb();
  const first = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  const duplicate = await reserveSignedInExtract(db.admin, USER, 'request-123', opts('youtube|abc'));
  assert(first.ok && duplicate.ok);
  assertEquals(duplicate.reservation.reservationId, first.reservation.reservationId);
  assertEquals(db.charged(), 1);
});

Deno.test('compensation for a spent credit goes only through the after-finalize-failure RPC', async () => {
  const db = fakeDb();
  await markSignedInExtractCompensationPending(db.admin, USER, 'res-1', 'user_cancelled', null);
  await markSignedInExtractCompensationPending(db.admin, USER, 'res-2', 'finalize_failed', 'boom', {
    afterFinalizeFailure: true,
  });
  assertEquals(db.rpcCalls.map((c) => c.fn), [
    'mark_recipe_credit_compensation_pending',
    'mark_recipe_credit_compensation_after_finalize_failure',
  ]);
});
