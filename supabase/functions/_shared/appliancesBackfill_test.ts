// npx deno test -A --no-lock supabase/functions/_shared/appliancesBackfill_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import type { RecipeAppliance } from './appliances.ts';
import {
  type BackfillDb,
  type BackfillTable,
  clampBatchSize,
  type DeriveFn,
  isBackfillTable,
  type PendingRow,
  runAppliancesBackfillBatch,
} from './appliancesBackfill.ts';

type Row = PendingRow & { appliances: RecipeAppliance[] | null };

const OVEN: RecipeAppliance[] = [{ key: 'oven', required: true, steps: [1], origin: 'source' }];
const USAGE = { model: 'openai/gpt-6-luna', kind: 'appliances', promptTokenCount: 900, candidatesTokenCount: 100, thoughtsTokenCount: 0, totalTokenCount: 1000 };

function row(id: string, steps = 1, appliances: RecipeAppliance[] | null = null): Row {
  return {
    id,
    title: `Recipe ${id}`,
    ingredients: [{ name: 'flour' }],
    instructions: Array.from({ length: steps }, (_, i) => ({ step: i + 1, text: `Step ${i + 1}` })),
    appliances,
  };
}

/** In-memory tables with the same NULL-only semantics as the real adapter. */
function fakeDb(tables: Record<BackfillTable, Row[]>, onSave?: (table: BackfillTable, id: string) => void): BackfillDb & { tables: typeof tables } {
  return {
    tables,
    fetchPending: (table, after, limit) =>
      Promise.resolve(
        tables[table]
          .filter((r) => r.appliances === null && (after === null || r.id > after))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit),
      ),
    countPending: (table) => Promise.resolve(tables[table].filter((r) => r.appliances === null).length),
    saveAppliances: (table, id, appliances) => {
      onSave?.(table, id);
      const target = tables[table].find((r) => r.id === id);
      if (!target || target.appliances !== null) return Promise.resolve(false);
      target.appliances = appliances;
      return Promise.resolve(true);
    },
  };
}

const deriveOven: DeriveFn = (recipe) => {
  const hasSteps = Array.isArray(recipe.instructions) && recipe.instructions.length > 0;
  return Promise.resolve(
    hasSteps
      ? { appliances: OVEN, unmatched: [], usages: [USAGE], tipsProposed: 0, tipsKept: 0 }
      : { appliances: null, unmatched: [], usages: [], tipsProposed: 0, tipsKept: 0 },
  );
};

Deno.test('fills only rows that are still NULL and leaves analysed rows alone', async () => {
  const db = fakeDb({ recipes: [row('a'), row('b', 1, []), row('c', 1, OVEN)], recipe_cards: [] });
  const result = await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipes', after: null, limit: 20 });
  assertEquals([result.scanned, result.updated, result.stillNull, result.skipped], [1, 1, 0, 0]);
  assertEquals(db.tables.recipes.map((r) => r.appliances), [OVEN, [], OVEN]);
  assertEquals(result.usages.length, 1);
  assertEquals(result.nextCursor, null);
});

Deno.test('pages by cursor and finishes even when some rows cannot be analysed', async () => {
  const rows = [row('a'), row('b', 0), row('c'), row('d', 0), row('e')];
  const db = fakeDb({ recipes: rows, recipe_cards: [] });
  const first = await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipes', after: null, limit: 2 });
  assertEquals([first.updated, first.stillNull, first.nextCursor], [1, 1, 'b']);
  const second = await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipes', after: first.nextCursor, limit: 2 });
  assertEquals([second.updated, second.stillNull, second.nextCursor], [1, 1, 'd']);
  const third = await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipes', after: second.nextCursor, limit: 2 });
  assertEquals([third.updated, third.nextCursor], [1, null]);
  // Rows with no steps stay not analysed; they are not re-fetched forever thanks to the cursor.
  assertEquals(db.tables.recipes.filter((r) => r.appliances === null).map((r) => r.id), ['b', 'd']);
});

Deno.test('a second full pass changes nothing and calls the model only for rows still NULL', async () => {
  const db = fakeDb({ recipes: [row('a'), row('b')], recipe_cards: [] });
  await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipes', after: null, limit: 20 });
  let calls = 0;
  const counting: DeriveFn = (r) => {
    calls += 1;
    return deriveOven(r);
  };
  const again = await runAppliancesBackfillBatch(db, counting, { table: 'recipes', after: null, limit: 20 });
  assertEquals([again.scanned, again.updated, calls], [0, 0, 0]);
});

Deno.test('never overwrites a row another writer filled in the meantime', async () => {
  const db = fakeDb({ recipes: [row('a')], recipe_cards: [] }, (_table, id) => {
    // Simulates a user remixing the recipe between our read and our write.
    db.tables.recipes.find((r) => r.id === id)!.appliances = [];
  });
  const result = await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipes', after: null, limit: 20 });
  assertEquals([result.updated, result.skipped], [0, 1]);
  assertEquals(db.tables.recipes[0].appliances, []);
});

Deno.test('a model error or a failed save is reported and the row stays NULL', async () => {
  const failing: DeriveFn = () =>
    Promise.resolve({ appliances: null, unmatched: [], usages: [], tipsProposed: 0, tipsKept: 0, error: 'timeout' });
  const db = fakeDb({ recipes: [row('a')], recipe_cards: [] });
  const result = await runAppliancesBackfillBatch(db, failing, { table: 'recipes', after: null, limit: 20 });
  assertEquals([result.stillNull, result.errors], [1, ['a: timeout']]);

  const brokenSave: BackfillDb = { ...fakeDb({ recipes: [row('b')], recipe_cards: [] }), saveAppliances: () => Promise.reject(new Error('db down')) };
  const saved = await runAppliancesBackfillBatch(brokenSave, deriveOven, { table: 'recipes', after: null, limit: 20 });
  assertEquals([saved.updated, saved.stillNull, saved.errors], [0, 1, ['b: save failed: db down']]);
});

Deno.test('works on Hub cards the same way', async () => {
  const db = fakeDb({ recipes: [], recipe_cards: [row('card-1'), row('card-2', 1, OVEN)] });
  const result = await runAppliancesBackfillBatch(db, deriveOven, { table: 'recipe_cards', after: null, limit: 20 });
  assertEquals([result.table, result.updated], ['recipe_cards', 1]);
});

Deno.test('batch size is clamped to 1..20 and tables are validated', () => {
  assertEquals([clampBatchSize(undefined), clampBatchSize(5), clampBatchSize(500), clampBatchSize(0), clampBatchSize(2.5)], [20, 5, 20, 1, 20]);
  assertEquals([isBackfillTable('recipes'), isBackfillTable('recipe_cards'), isBackfillTable('profiles')], [true, true, false]);
});
