import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { Db } from '../core/supabaseAdmin.ts';
import { RECIPE_EDIT_DAILY_LIMIT } from '../llm/pricing.ts';
import type { RecipeEditPlan } from './recipeEditPlan.ts';
import type { RecipeEditContent } from './recipeEditTypes.ts';
import {
  insertRecipe,
  loadOwnRecipe,
  logRecipeEditCheck,
  photoColumn,
  reserveRecipeEdit,
  updateRecipe,
} from './recipeEditStore.ts';

type Result = { data: unknown; error: unknown };
type Call = { table: string; op: string; args: unknown[] };

/**
 * A stub query builder: every chained call is recorded, and awaiting the chain (or its last call) gives the result
 * `answer` returns for that table and operation.
 */
function stubDb(answer: (table: string, op: string) => Result, rpc: (fn: string) => Result = () => ok(null)) {
  const calls: Call[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      let op = 'select';
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'maybeSingle', 'single']) {
        chain[method] = (...args: unknown[]) => {
          if (method === 'insert' || method === 'update' || method === 'delete') op = method;
          calls.push({ table, op: method, args });
          return chain;
        };
      }
      chain.then = (resolve: (value: Result) => unknown, reject: (err: unknown) => unknown) =>
        Promise.resolve(answer(table, op)).then(resolve, reject);
      return chain;
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      return Promise.resolve(rpc(fn));
    },
  };
  return { db: db as unknown as Db, calls, rpcs };
}

const ok = (data: unknown): Result => ({ data, error: null });
const err = (message: string): Result => ({ data: null, error: { message } });

function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => (console.error = original));
}

// ---- loadOwnRecipe ----

Deno.test('loadOwnRecipe returns only the caller\'s own row', async () => {
  const { db } = stubDb(() => ok({ id: 'r1', user_id: 'u1' }));
  assertEquals(await loadOwnRecipe(db, 'u1', 'r1'), { id: 'r1', user_id: 'u1' });
  assertEquals(await loadOwnRecipe(db, 'u2', 'r1'), null);
  assertEquals(await loadOwnRecipe(stubDb(() => ok(null)).db, 'u1', 'r1'), null);
});

Deno.test('loadOwnRecipe throws a lookup error', async () => {
  const { db } = stubDb(() => err('down'));
  await assertRejects(() => loadOwnRecipe(db, 'u1', 'r1'));
});

// ---- updateRecipe / insertRecipe ----

Deno.test('updateRecipe writes the caller\'s row and clears its translations when asked', async () => {
  const { db, calls } = stubDb((table) => ok(table === 'recipes' ? { id: 'r1' } : null));
  assertEquals(await updateRecipe(db, 'u1', 'r1', { title: 'Soup' }, { clearTranslations: true }), { id: 'r1' });
  assertEquals(
    calls.map((call) => `${call.table}.${call.op}(${call.args.map((arg) => JSON.stringify(arg)).join(',')})`),
    [
      'recipes.update({"title":"Soup"})',
      'recipes.eq("id","r1")',
      'recipes.eq("user_id","u1")',
      'recipes.select("*")',
      'recipes.maybeSingle()',
      'recipe_translations.delete()',
      'recipe_translations.eq("recipe_id","r1")',
    ],
  );
});

Deno.test('updateRecipe keeps translations by default and returns null when nothing was updated', async () => {
  const kept = stubDb(() => ok({ id: 'r1' }));
  await updateRecipe(kept.db, 'u1', 'r1', {});
  assertEquals(kept.calls.some((call) => call.table === 'recipe_translations'), false);

  const missing = stubDb(() => ok(null));
  assertEquals(await updateRecipe(missing.db, 'u1', 'r1', {}, { clearTranslations: true }), null);
  assertEquals(missing.calls.some((call) => call.table === 'recipe_translations'), false);

  assertEquals(await quietly(() => updateRecipe(stubDb(() => err('down')).db, 'u1', 'r1', {})), null);
});

Deno.test('a failed translations clear still returns the saved row', async () => {
  const { db } = stubDb((table) => (table === 'recipes' ? ok({ id: 'r1' }) : err('down')));
  assertEquals(await quietly(() => updateRecipe(db, 'u1', 'r1', {}, { clearTranslations: true })), { id: 'r1' });
});

Deno.test('insertRecipe adds the owner and a full status', async () => {
  const { db, calls } = stubDb(() => ok({ id: 'new' }));
  assertEquals(await insertRecipe(db, 'u1', { title: 'Soup', extraction_status: 'partial' }), { id: 'new' });
  assertEquals(calls[0].args[0], { title: 'Soup', extraction_status: 'full', user_id: 'u1' });
  assertEquals(await quietly(() => insertRecipe(stubDb(() => err('dup')).db, 'u1', {})), null);
});

// ---- photoColumn ----

const withPhoto = (photo: RecipeEditContent['photo']) => ({ photo }) as RecipeEditContent;

Deno.test('photoColumn keeps, clears or uploads the photo', async () => {
  const uploads: unknown[] = [];
  const persist = (opts: unknown) => {
    uploads.push(opts);
    return Promise.resolve('https://cdn/p.jpg');
  };
  assertEquals(await photoColumn(withPhoto({ action: 'keep' }), 'u1', persist), {});
  assertEquals(await photoColumn(withPhoto({ action: 'remove' }), 'u1', persist), {
    image_url: null,
    image_generated: false,
  });
  assertEquals(await photoColumn(withPhoto({ action: 'generate' }), 'u1', persist), {
    image_url: null,
    image_generated: false,
  });
  assertEquals(uploads, []);
  const replace = withPhoto({ action: 'replace', base64: 'abc', mime_type: 'image/png' });
  assertEquals(await photoColumn(replace, 'u1', persist), { image_url: 'https://cdn/p.jpg', image_generated: false });
  assertEquals(uploads, [{ imageBase64: 'abc', mimeType: 'image/png', userId: 'u1' }]);
});

Deno.test('photoColumn is false when the upload fails', async () => {
  const replace = withPhoto({ action: 'replace', base64: 'abc', mime_type: 'image/png' });
  assertEquals(await photoColumn(replace, 'u1', () => Promise.resolve(undefined)), false);
});

// ---- reserveRecipeEdit ----

Deno.test('reserveRecipeEdit is ok only when the reserve RPC says so', async () => {
  const profile = () => ok({ is_admin: false });
  const reserved = stubDb(profile, () => ok(3));
  const result = await reserveRecipeEdit(reserved.db, 'u1');
  assertEquals(result.ok, true);
  assertEquals(result.date, new Date().toISOString().slice(0, 10));
  assertEquals(reserved.rpcs[0].fn, 'reserve_daily_ai_usage');
  assertEquals(reserved.rpcs[0].args.p_action, 'recipe_edit');
  assertEquals(reserved.rpcs[0].args.p_limit, RECIPE_EDIT_DAILY_LIMIT);

  assertEquals((await reserveRecipeEdit(stubDb(profile, () => ok(-1)).db, 'u1')).ok, false);
  assertEquals((await quietly(() => reserveRecipeEdit(stubDb(profile, () => err('down')).db, 'u1'))).ok, false);
});

// ---- logRecipeEditCheck ----

const jev = { model: 'jev', costUsd: 0.0001, inputTokens: 900, ms: 420 };
const savePlan = (overrides: Partial<Extract<RecipeEditPlan, { outcome: 'save' }>> = {}): RecipeEditPlan => ({
  outcome: 'save',
  recalculate: ['calories'],
  amountRows: [],
  jevFailed: false,
  jev,
  scores: { calories: 0.9 },
  ...overrides,
});

function usageRows(calls: Call[]) {
  return calls.filter((call) => call.table === 'ai_usage_events' && call.op === 'insert').map((call) => call.args[0]);
}

Deno.test('logRecipeEditCheck logs a Jev call with its plan', async () => {
  const { db, calls } = stubDb(() => ok({ id: 'log1' }));
  await logRecipeEditCheck(db, 'u1', 'edit', savePlan(), { id: 'r1', platform: 'tiktok' }, Date.now());
  const [row] = usageRows(calls) as Record<string, unknown>[];
  assertEquals(row.user_id, 'u1');
  assertEquals(row.action, 'recipe_edit_check');
  assertEquals(row.platform, 'tiktok');
  assertEquals(row.status, 'ok');
  assertEquals(row.tokens_charged, 0);
  assertEquals(row.error_message, null);
  const metadata = row.metadata as Record<string, unknown>;
  assertEquals(Object.keys(metadata), ['mode', 'recipe_id', 'recalculate', 'scores', 'jev_ms', 'llm_calls']);
  assertEquals([metadata.mode, metadata.recipe_id, metadata.jev_ms], ['edit', 'r1', 420]);
});

Deno.test('logRecipeEditCheck logs blocked saves and Jev failures, and skips saves with no Jev call', async () => {
  const blocked = stubDb(() => ok({ id: 'log1' }));
  const reasons = [{ field: 'title' }] as never;
  await logRecipeEditCheck(blocked.db, 'u1', 'write', { outcome: 'blocked', reasons, jev }, null, Date.now());
  const [blockedRow] = usageRows(blocked.calls) as Record<string, unknown>[];
  assertEquals([blockedRow.status, blockedRow.platform], ['blocked', 'unknown']);
  assertEquals((blockedRow.metadata as Record<string, unknown>).reasons, reasons);

  const failed = stubDb(() => ok({ id: 'log2' }));
  const failedPlan = savePlan({ jev: null, jevFailed: true, jevError: 'timeout' });
  await logRecipeEditCheck(failed.db, 'u1', 'import', failedPlan, null, Date.now());
  const [failedRow] = usageRows(failed.calls) as Record<string, unknown>[];
  assertEquals([failedRow.status, failedRow.error_message], ['jev_failed', 'timeout']);

  const none = stubDb(() => ok(null));
  await logRecipeEditCheck(none.db, 'u1', 'write', savePlan({ jev: null }), null, Date.now());
  await logRecipeEditCheck(none.db, 'u1', 'write', { outcome: 'invalid', errors: [] }, null, Date.now());
  assertEquals(none.calls, []);
});
