// npx deno test -A --no-lock supabase/functions/_shared/recipes/enrich/nutritionBackfill_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { FetchError } from '../../core/errors.ts';
import type { RecipeNutrition } from '../nutrition.ts';
import {
  clampNutritionBatchSize,
  type NutritionBackfillDb,
  type PendingNutritionRow,
  runNutritionBackfillBatch,
} from './nutritionBackfill.ts';

const row = (id: string, calories = 1200): PendingNutritionRow => ({
  id,
  title: `Recipe ${id}`,
  servings: 2,
  calories,
  ingredients: [{ name: 'rice', quantity: 200, unit: 'g' }],
  instructions: [{ step: 1, text: 'Cook' }],
});

const split: RecipeNutrition = { protein_g: 40, carbs_g: 180, fat_g: 30 };

function fakeDb(rows: PendingNutritionRow[], options: { changed?: string[] } = {}) {
  const saved: { id: string; calories: number; nutrition: RecipeNutrition }[] = [];
  const db: NutritionBackfillDb = {
    fetchPending: (after, limit) =>
      Promise.resolve(rows.filter((r) => after === null || r.id > after).slice(0, limit)),
    countPending: () => Promise.resolve(rows.length),
    saveNutrition: (id, calories, nutrition) => {
      if (options.changed?.includes(id)) return Promise.resolve(false);
      saved.push({ id, calories, nutrition });
      return Promise.resolve(true);
    },
  };
  return { db, saved };
}

Deno.test('a batch saves each split with the calories it was made for and returns a cursor', async () => {
  const { db, saved } = fakeDb([row('a'), row('b'), row('c')]);
  const result = await runNutritionBackfillBatch(db, () => Promise.resolve({ nutrition: split, usage: null }), {
    after: null,
    limit: 2,
  });
  assertEquals(result.updated, 2);
  assertEquals(result.nextCursor, 'b');
  assertEquals(saved, [
    { id: 'a', calories: 1200, nutrition: split },
    { id: 'b', calories: 1200, nutrition: split },
  ]);
});

Deno.test('rows the model could not split stay null, and changed rows are skipped', async () => {
  const { db, saved } = fakeDb([row('a'), row('b'), row('c')], { changed: ['c'] });
  const result = await runNutritionBackfillBatch(
    db,
    (r) =>
      r.id === 'a'
        ? Promise.reject(new Error('timeout'))
        : Promise.resolve({ nutrition: r.id === 'b' ? null : split, usage: null }),
    { after: null, limit: 20 },
  );
  assertEquals([result.updated, result.stillNull, result.skipped], [0, 2, 1]);
  assertEquals(result.nextCursor, null);
  assertEquals(saved, []);
  assertEquals(result.errors.length, 1);
});

Deno.test('an out-of-credit answer stops the batch at once', async () => {
  const { db } = fakeDb([row('a'), row('b'), row('c')]);
  let calls = 0;
  const result = await runNutritionBackfillBatch(
    db,
    () => {
      calls += 1;
      return Promise.reject(new FetchError('test', 'OpenRouter API returned an error', { status: 402 }));
    },
    { after: null, limit: 3 },
  );
  assertEquals(calls, 1);
  assertEquals(result.nextCursor, null);
  assertEquals(result.errors.at(-1), 'stopped: the model provider reported 402 (out of credit)');
});

Deno.test('batch size is 1 to 20', () => {
  assertEquals(clampNutritionBatchSize(undefined), 20);
  assertEquals(clampNutritionBatchSize(0), 1);
  assertEquals(clampNutritionBatchSize(500), 20);
  assertEquals(clampNutritionBatchSize(5), 5);
});
