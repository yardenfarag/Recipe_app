import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import type { Db } from '../core/supabaseAdmin.ts';
import { claimShare, createShare } from './recipeShareActions.ts';

interface Result {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface Query {
  table: string;
  /** Each builder call, as `method(args JSON)`. */
  calls: string[];
}

/**
 * A client that answers each awaited query with the next scripted result and records what was asked. A query
 * beyond the script fails the test.
 */
function scriptedDb(results: Result[]): { db: Db; queries: Query[] } {
  const queries: Query[] = [];
  const db = {
    from(table: string) {
      const query: Query = { table, calls: [] };
      queries.push(query);
      const builder: unknown = new Proxy({}, {
        get(_target, prop) {
          if (prop === 'then') {
            const next = results[queries.indexOf(query)];
            if (!next) throw new Error(`unexpected query #${queries.length} on ${table}`);
            return (resolve: (v: unknown) => void) => resolve({ data: null, error: null, ...next });
          }
          return (...args: unknown[]) => {
            query.calls.push(`${String(prop)}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { db: db as unknown as Db, queries };
}

/** The exact status and body a failure answers. */
async function rejection(run: () => Promise<unknown>): Promise<[number, string]> {
  try {
    await run();
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

const body = (status: number, error: string, code: string): [number, string] => [
  status,
  JSON.stringify({ error, code }),
];

const quiet = <T>(run: () => Promise<T>) => {
  const original = console.error;
  console.error = () => {};
  return run().finally(() => (console.error = original));
};

const recipe = { id: 'r1', title: 'Soup', instructions: [{ step: 1, text: 'Boil.' }] };

Deno.test('create: guest and missing recipes are refused before any query', async () => {
  const { db, queries } = scriptedDb([]);
  const notSaved = body(400, 'A saved recipe is required to share', 'recipe_not_saved');
  assertEquals(await rejection(() => createShare(db, db, 'u1', 'guest-1')), notSaved);
  assertEquals(await rejection(() => createShare(db, db, 'u1', '')), notSaved);
  assertEquals(queries.length, 0);
});

Deno.test('create: lookup failures keep their old bodies', async () => {
  const lookupFailed = scriptedDb([{ error: { message: 'boom' } }]);
  assertEquals(
    await quiet(() => rejection(() => createShare(lookupFailed.db, lookupFailed.db, 'u1', 'r1'))),
    body(500, 'Could not load recipe', 'share_failed'),
  );
  const missing = scriptedDb([{ data: null }]);
  assertEquals(
    await rejection(() => createShare(missing.db, missing.db, 'u1', 'r1')),
    body(404, 'Recipe not found', 'recipe_not_found'),
  );
  // The existing-link lookup still runs before the title check, as before.
  const untitled = scriptedDb([{ data: { id: 'r1', title: ' ' } }, { data: null }]);
  assertEquals(
    await rejection(() => createShare(untitled.db, untitled.db, 'u1', 'r1')),
    body(400, 'Recipe is missing a title', 'recipe_invalid'),
  );
  assertEquals(untitled.queries.length, 2);
});

Deno.test('create: sharing again reuses the link and refreshes its copy', async () => {
  const { db, queries } = scriptedDb([{ data: recipe }, { data: { token: 'tok' } }, { error: { message: 'x' } }]);
  assertEquals(await quiet(() => createShare(db, db, 'u1', 'r1')), { status: 'ok', token: 'tok', reused: true });
  assertEquals(queries[2].table, 'recipe_shares');
  assertMatch(queries[2].calls[0], /^update\(\{"snapshot":\{"title":"Soup"/);
  assertEquals(queries[2].calls[1], 'eq("token", "tok")');
});

Deno.test('create: a new link retries a taken token, and stops after five', async () => {
  const taken = { error: { code: '23505' } };
  const fresh = scriptedDb([{ data: recipe }, { data: null }, taken, {}]);
  const created = await createShare(fresh.db, fresh.db, 'u1', 'r1');
  assertEquals([created.status, created.reused], ['ok', false]);
  assertMatch(String(created.token), /^[A-Za-z0-9_-]{24}$/);
  assertEquals(fresh.queries.length, 4);

  const full = scriptedDb([{ data: recipe }, { data: null }, taken, taken, taken, taken, taken]);
  assertEquals(
    await rejection(() => createShare(full.db, full.db, 'u1', 'r1')),
    body(500, 'Could not create share', 'share_failed'),
  );
  const broken = scriptedDb([{ data: recipe }, { data: null }, { error: { code: '42P01' } }]);
  assertEquals(
    await quiet(() => rejection(() => createShare(broken.db, broken.db, 'u1', 'r1'))),
    body(500, 'Could not create share', 'share_failed'),
  );
  assertEquals(broken.queries.length, 3);
});

const share = (snapshot: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  data: { token: 'tok', snapshot: { ...recipe, extraction_status: 'full', ...snapshot }, claim_count: 2, ...extra },
});

Deno.test('claim: a missing, revoked or unreadable link keeps its old body', async () => {
  const failed = scriptedDb([{ error: { message: 'boom' } }]);
  assertEquals(
    await quiet(() => rejection(() => claimShare(failed.db, 'u1', 'tok'))),
    body(500, 'Could not load share', 'share_unavailable'),
  );
  const notFound = body(404, 'Share not found', 'share_not_found');
  assertEquals(await rejection(() => claimShare(scriptedDb([{ data: null }]).db, 'u1', 'tok')), notFound);
  const revoked = scriptedDb([share({}, { revoked_at: '2026-11-01' })]);
  assertEquals(await rejection(() => claimShare(revoked.db, 'u1', 'tok')), notFound);
});

Deno.test('claim: a second claim answers the copy already saved', async () => {
  const { db, queries } = scriptedDb([share({}), { data: { recipe_id: 'mine' } }]);
  assertEquals(await claimShare(db, 'u1', 'tok'), { status: 'ok', recipe_id: 'mine', already_claimed: true });
  assertEquals(queries.length, 2);
});

Deno.test('claim: a recipe already saved from the same link and origin is reused', async () => {
  const rows = {
    data: [{ id: 'invented', extraction_source: 'invented' }, { id: 'mine', extraction_source: 'video' }],
  };
  const { db, queries } = scriptedDb([share({ original_url: ' https://x.test/v ' }), { data: null }, rows, {}]);
  assertEquals(await claimShare(db, 'u1', 'tok'), { status: 'ok', recipe_id: 'mine', already_claimed: true });
  assertEquals(queries[2].calls.slice(1), ['eq("user_id", "u1")', 'eq("original_url", "https://x.test/v")']);
  assertEquals(queries[3].calls, ['upsert({"token":"tok","claimed_by":"u1","recipe_id":"mine"})']);
});

Deno.test('claim: a new copy is saved, the claim recorded and the count raised', async () => {
  const { db, queries } = scriptedDb([share({}), { data: null }, { data: { id: 'new' } }, {}, {}]);
  assertEquals(await claimShare(db, 'u1', 'tok'), { status: 'ok', recipe_id: 'new', already_claimed: false });
  assertEquals(queries.map((q) => `${q.table}.${q.calls[0].split('(')[0]}`), [
    'recipe_shares.select',
    'recipe_share_claims.select',
    'recipes.insert',
    'recipe_share_claims.insert',
    'recipe_shares.update',
  ]);
  assertMatch(queries[2].calls[0], /"user_id":"u1","title":"Soup"/);
  assertEquals(queries[4].calls, ['update({"claim_count":3})', 'eq("token", "tok")']);
});

Deno.test('claim: a copy saved by a parallel claim is answered; other insert failures are claim_failed', async () => {
  const url = share({ original_url: 'https://x.test/v' });
  const raced = scriptedDb([url, { data: null }, { data: [] }, { error: { code: '23505' } }, {
    data: [{ id: 'raced', extraction_source: null }],
  }, {}]);
  assertEquals(await claimShare(raced.db, 'u1', 'tok'), { status: 'ok', recipe_id: 'raced', already_claimed: true });
  assertEquals(raced.queries[5].calls, ['upsert({"token":"tok","claimed_by":"u1","recipe_id":"raced"})']);

  const broken = scriptedDb([share({}), { data: null }, { error: { code: '23502' } }]);
  assertEquals(
    await quiet(() => rejection(() => claimShare(broken.db, 'u1', 'tok'))),
    body(500, 'Could not save shared recipe', 'claim_failed'),
  );
});
