import { assertEquals } from 'jsr:@std/assert@1';

import { FetchError } from '../../core/errors.ts';
import { isTranslateLanguageCode, type TranslatedRecipe } from '../translateRecipe.ts';
import {
  clampMissingTranslationBatchSize,
  clampTranslationBatchSize,
  countMissingTranslations,
  type MissingTranslationDb,
  type MissingTranslationItem,
  parseTranslationCursor,
  runMissingTranslationBatch,
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

// ── Missing languages (PIN-77) ───────────────────────────────────────────────

function item(id: string, have: string[] = [], title = 'Soup'): MissingTranslationItem {
  return {
    id,
    have,
    text: {
      title,
      source_language: 'en',
      ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp' }],
      instructions: [{ step: 1, text: 'Stir the soup.' }],
    },
  };
}

function missingDb(rows: MissingTranslationItem[], options: { copied?: Record<string, string[]>; keep?: string[] } = {}) {
  const saved: string[] = [];
  const copyCalls: string[][] = [];
  const db: MissingTranslationDb = {
    fetchItems: (after, limit) => {
      const start = after ? rows.findIndex((r) => r.id === after) + 1 : 0;
      return Promise.resolve(rows.slice(start, start + limit).map((r) => ({ ...r, have: [...r.have] })));
    },
    save: (id, language, content, version) => {
      saved.push(`${id}/${language}:${content.title}:${version}`);
      return Promise.resolve(!(options.keep ?? []).includes(`${id}/${language}`));
    },
  };
  if (options.copied) {
    db.copyFromCards = (ids) => {
      copyCalls.push(ids);
      return Promise.resolve(options.copied!);
    };
  }
  return { db, saved, copyCalls };
}

const missingOptions = { after: null, limit: 3, version: 2 };
const echo = (input: { title: string; targetLanguage: string }) =>
  Promise.resolve(translated(`${input.title}-${input.targetLanguage}`));

Deno.test('missing: each item gets the app languages it lacks, except its own', async () => {
  const { db, saved } = missingDb([item('a'), item('b', ['he', 'ru', 'ar', 'es']), item('c', ['he'])]);
  const result = await runMissingTranslationBatch(db, echo, missingOptions);
  assertEquals(saved.sort(), [
    'a/ar:Soup-ar:2', 'a/es:Soup-es:2', 'a/he:Soup-he:2', 'a/ru:Soup-ru:2',
    'c/ar:Soup-ar:2', 'c/es:Soup-es:2', 'c/ru:Soup-ru:2',
  ]);
  assertEquals(result.items, 2);
  assertEquals(result.translated, 7);
  assertEquals(result.nextCursor, null);
});

Deno.test('missing: stops at the batch size and hands back the last item done', async () => {
  const { db } = missingDb([item('a'), item('b', ['he', 'ru', 'ar', 'es']), item('c'), item('d')]);
  const result = await runMissingTranslationBatch(db, echo, { ...missingOptions, limit: 2 });
  assertEquals(result.items, 2);
  assertEquals(result.nextCursor, 'c');
  const next = await runMissingTranslationBatch(db, echo, { ...missingOptions, after: 'c', limit: 2 });
  assertEquals(next.items, 1);
  assertEquals(next.nextCursor, null);
});

Deno.test('missing: a full scan window with nothing to do moves the cursor on', async () => {
  const done = ['he', 'ru', 'ar', 'es'];
  const { db } = missingDb([item('a', done), item('b', done), item('c')]);
  const result = await runMissingTranslationBatch(db, echo, { ...missingOptions, scan: 2 });
  assertEquals(result.items, 0);
  assertEquals(result.nextCursor, 'b');
});

Deno.test('missing: no new item after the time budget', async () => {
  const { db } = missingDb([item('a'), item('b')]);
  let clock = 0;
  const result = await runMissingTranslationBatch(db, (input) => {
    clock += 60_000;
    return echo(input);
  }, { ...missingOptions, budgetMs: 90_000, now: () => clock });
  assertEquals(result.items, 1);
  assertEquals(result.nextCursor, 'a');
});

Deno.test('missing: Library recipes take a matching card\'s translations first, for free', async () => {
  const { db, saved, copyCalls } = missingDb([item('a'), item('b', ['he', 'ru', 'ar', 'es'])], {
    copied: { a: ['he', 'ru', 'ar'] },
  });
  const result = await runMissingTranslationBatch(db, echo, missingOptions);
  assertEquals(copyCalls, [['a']]);
  assertEquals(result.copied, 3);
  assertEquals(saved, ['a/es:Soup-es:2']);
});

Deno.test('missing: a translation that appeared meanwhile is kept, and counted as skipped', async () => {
  const { db } = missingDb([item('a', ['ru', 'ar', 'es'])], { keep: ['a/he'] });
  const result = await runMissingTranslationBatch(db, echo, missingOptions);
  assertEquals(result.skipped, 1);
  assertEquals(result.translated, 0);
});

Deno.test('missing: stops at the first 402, after the item in flight', async () => {
  const { db, saved } = missingDb([item('a'), item('b')]);
  const result = await runMissingTranslationBatch(db, (input) =>
    input.targetLanguage === 'ru'
      ? Promise.reject(new FetchError('t', 'OpenRouter API returned an error', { status: 402 }))
      : echo(input), missingOptions);
  assertEquals(saved.length, 3);
  assertEquals(result.failed, 1);
  assertEquals(result.nextCursor, null);
  assertEquals(result.errors.at(-1), 'stopped: the model provider reported 402 (out of credit)');
});

Deno.test('missing: the dry run counts by language across pages', async () => {
  const { db } = missingDb([item('a'), item('b', ['he']), item('c', ['he', 'ru', 'ar', 'es']), item('d', [], 'מרק עוף')]);
  const counts = await countMissingTranslations(db, 2);
  assertEquals(counts.items, 3);
  // "d" has a Hebrew title, so it is Hebrew: English goes in its place.
  assertEquals(counts.byLanguage, { he: 1, ar: 3, ru: 3, es: 3, en: 1 });
  assertEquals(counts.missing, 11);
});

Deno.test('missing: batch size 1-5, default 3', () => {
  assertEquals(clampMissingTranslationBatchSize(undefined), 3);
  assertEquals(clampMissingTranslationBatchSize(9), 5);
  assertEquals(clampMissingTranslationBatchSize(0), 1);
});
