import { assertEquals } from 'jsr:@std/assert@1';

import { FetchError } from '../../core/errors.ts';
import { isTranslateLanguageCode, type TranslatedRecipe } from '../translateRecipe.ts';
import {
  clampTranslationBatchSize,
  parseTranslationCursor,
  runTranslationBackfillBatch,
  type StaleTranslationRow,
  type TranslationBackfillDb,
} from './translationBackfill.ts';

function row(recipeId: string, languageCode: string): StaleTranslationRow {
  return {
    recipeId,
    languageCode,
    translationVersion: null,
    source: { title: 'Soup', ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp' }], instructions: [{ step: 1, text: 'Stir.' }] },
  };
}

function fakeDb(rows: StaleTranslationRow[], saveResult = true) {
  const saved: { recipeId: string; languageCode: string; title: string; version: number }[] = [];
  const db: TranslationBackfillDb = {
    fetchStale: (_after, limit) => Promise.resolve(rows.slice(0, limit)),
    countStale: () => Promise.resolve({ he: rows.length }),
    saveTranslation: (target, content, version) => {
      saved.push({ ...target, title: content.title, version });
      return Promise.resolve(saveResult);
    },
  };
  return { db, saved };
}

const translated = (title: string): TranslatedRecipe => ({ title, ingredients: [], instructions: [], usage: null });
const options = { after: null, limit: 10, version: 2, isLanguage: isTranslateLanguageCode };

Deno.test('translates each stale row and saves it with the new version', async () => {
  const { db, saved } = fakeDb([row('a', 'he'), row('b', 'en')]);
  const seen: string[] = [];
  const result = await runTranslationBackfillBatch(db, (input) => {
    seen.push(input.targetLanguage);
    return Promise.resolve(translated(`t-${input.targetLanguage}`));
  }, options);
  assertEquals(seen, ['he', 'en']);
  assertEquals(result.updated, 2);
  assertEquals(result.nextCursor, null);
  assertEquals(saved.map((s) => [s.recipeId, s.languageCode, s.title, s.version]), [
    ['a', 'he', 't-he', 2],
    ['b', 'en', 't-en', 2],
  ]);
});

Deno.test('skips languages it does not translate and rows that changed meanwhile', async () => {
  const { db } = fakeDb([row('a', 'xx'), row('b', 'he')], false);
  const result = await runTranslationBackfillBatch(db, () => Promise.resolve(translated('t')), options);
  assertEquals(result.skipped, 2);
  assertEquals(result.updated, 0);
});

Deno.test('a failed row is reported and the batch goes on', async () => {
  const { db } = fakeDb([row('a', 'he'), row('b', 'he')]);
  let calls = 0;
  const result = await runTranslationBackfillBatch(db, () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('timeout')) : Promise.resolve(translated('t'));
  }, options);
  assertEquals(result.failed, 1);
  assertEquals(result.updated, 1);
});

Deno.test('stops at the first 402', async () => {
  const { db } = fakeDb([row('a', 'he'), row('b', 'he')]);
  let calls = 0;
  const result = await runTranslationBackfillBatch(db, () => {
    calls += 1;
    return Promise.reject(new FetchError('t', 'OpenRouter API returned an error', { status: 402 }));
  }, options);
  assertEquals(calls, 1);
  assertEquals(result.nextCursor, null);
  assertEquals(result.errors.at(-1), 'stopped: the model provider reported 402 (out of credit)');
});

Deno.test('hands back a cursor when the batch was full', async () => {
  const { db } = fakeDb([row('a', 'he'), row('b', 'ru')]);
  const result = await runTranslationBackfillBatch(db, () => Promise.resolve(translated('t')), { ...options, limit: 2 });
  assertEquals(result.nextCursor, { recipeId: 'b', languageCode: 'ru' });
});

Deno.test('parses the cursor and the batch size', () => {
  assertEquals(parseTranslationCursor(undefined), null);
  assertEquals(
    parseTranslationCursor({ recipe_id: '20000000-0000-4000-8000-000000000801', language_code: 'he' }),
    { recipeId: '20000000-0000-4000-8000-000000000801', languageCode: 'he' },
  );
  assertEquals(parseTranslationCursor({ recipe_id: 'x', language_code: 'he' }), undefined);
  assertEquals(parseTranslationCursor({ recipe_id: '20000000-0000-4000-8000-000000000801', language_code: "he'),x" }), undefined);
  assertEquals(clampTranslationBatchSize(50), 10);
  assertEquals(clampTranslationBatchSize(0), 1);
  assertEquals(clampTranslationBatchSize('5'), 10);
});
