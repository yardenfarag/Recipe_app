import { assertEquals } from 'jsr:@std/assert@1';

import {
  beforeOf,
  contentColumns,
  importColumns,
  pendingAfterSave,
  pendingForRetry,
  runIsFresh,
  WRITTEN_COLUMNS,
} from './recipeEditRows.ts';
import type { RecipeEditContent } from './recipeEditTypes.ts';

const amount = (quantity: number, unit: string) => ({ quantity, unit });

function content(overrides: Partial<RecipeEditContent> = {}): RecipeEditContent {
  return {
    title: ' Tomato soup ',
    photo: { action: 'keep' },
    servings: 2,
    ingredients: [
      { name: ' tomato ', quantity: 3, unit: 'pcs', metric: amount(300, 'g'), spoons: amount(0, '') },
      { name: 'salt', quantity: 1, unit: 'tsp', metric: amount(6, 'g'), spoons: amount(1, 'tsp') },
    ],
    instructions: [{ step: 4, text: ' Chop. ' }, { step: 9, text: 'Simmer.' }],
    estimated_time_minutes: 30,
    calories: 250,
    effort_level: 'Easy',
    cost_estimate: '$',
    tags: ['Soup', '#soup', ' '],
    appliances: null,
    cook_note: '  ',
    ...overrides,
  };
}

Deno.test('pendingAfterSave adds earlier pending, reset and missing-amount fields, in order, minus locked ones', () => {
  // calories: locked before, unlocked now. tags: locked, so never pending. servings: not a pending field.
  const existing = { locked_fields: ['calories', 'tags'], recalc_pending: ['effort_level', 'tags', 'servings'] };
  const withoutAmounts = content({ ingredients: [{ name: 'egg', quantity: 2, unit: '' }] });
  assertEquals(pendingAfterSave(withoutAmounts, ['tags'], ['estimated_time_minutes'], existing), [
    'calories',
    'estimated_time_minutes',
    'effort_level',
    'ingredient_amounts',
  ]);
});

Deno.test('pendingAfterSave: nothing when nothing changed and every row has amounts', () => {
  assertEquals(pendingAfterSave(content(), [], [], null), []);
});

Deno.test('pendingAfterSave: a drawn picture is pending; a photo put in cancels an earlier one', () => {
  assertEquals(pendingAfterSave(content({ photo: { action: 'generate' } }), [], [], null), ['image']);
  const replaced = content({ photo: { action: 'replace', base64: 'x', mime_type: 'image/png' } });
  assertEquals(pendingAfterSave(replaced, [], [], { recalc_pending: ['image'] }), []);
  assertEquals(pendingAfterSave(content({ photo: { action: 'remove' } }), [], [], { recalc_pending: ['image'] }), []);
  assertEquals(pendingAfterSave(content(), [], [], { recalc_pending: ['image'] }), ['image']);
});

Deno.test('pendingForRetry keeps the pending fields that are not locked, without junk', () => {
  const row = { recalc_pending: ['image', 'calories', 'nope'], locked_fields: ['calories'] };
  assertEquals(pendingForRetry(row), ['image']);
  assertEquals(pendingForRetry({ recalc_pending: null, locked_fields: null }), []);
});

Deno.test('runIsFresh: a run started under two minutes ago', () => {
  const now = Date.parse('2026-11-24T12:00:00Z');
  assertEquals(runIsFresh('2026-11-24T11:59:00Z', now), true);
  assertEquals(runIsFresh('2026-11-24T11:58:00Z', now), false);
  assertEquals(runIsFresh('2026-11-24T12:01:00Z', now), false);
  assertEquals(runIsFresh('not a date', now), false);
  assertEquals(runIsFresh(null, now), false);
});

Deno.test('beforeOf reads a stored row, with safe defaults', () => {
  const row = { title: 'Soup', servings: '4', ingredients: [], instructions: [], tags: ['a'], cook_note: 'x' };
  assertEquals(beforeOf(row), {
    title: 'Soup',
    servings: 4,
    ingredients: [],
    instructions: [],
    tags: ['a'],
    cook_note: 'x',
  });
  assertEquals(beforeOf({}), { title: '', servings: 1, ingredients: [], instructions: [], tags: [], cook_note: null });
});

Deno.test('importColumns keeps the source; a written recipe has none', () => {
  const source = {
    original_url: 'https://example.com/r',
    platform: 'web' as const,
    extraction_source: 'web' as const,
    image_url: null,
    source_video_url: null,
    source_language: 'en',
  };
  assertEquals(importColumns(source), {
    extraction_source: 'web',
    original_url: 'https://example.com/r',
    platform: 'web',
    image_url: null,
    source_video_url: null,
  });
  assertEquals(WRITTEN_COLUMNS, { extraction_source: 'manual', original_url: null, platform: 'unknown' });
});

Deno.test('contentColumns stores the trimmed content and clears kitchen auto-apply', () => {
  const columns = contentColumns(content(), [], [], []);
  assertEquals(columns.title, 'Tomato soup');
  assertEquals(columns.tags, ['soup']);
  assertEquals(columns.cook_note, null);
  assertEquals((columns.instructions as { step: number }[]).map((step) => step.step), [1, 2]);
  assertEquals(columns.locked_fields, []);
  assertEquals(columns.kitchen_original, null);
  assertEquals(columns.kitchen_adapted_summary, null);
  assertEquals('nutrition' in columns, false);
  assertEquals(Object.keys(columns).slice(-4), [
    'missing_fields',
    'locked_fields',
    'kitchen_original',
    'kitchen_adapted_summary',
  ]);
});

Deno.test('contentColumns drops stale amounts only while they are recalculated', () => {
  const rows = (columns: Record<string, unknown>) => columns.ingredients as { metric?: unknown }[];
  assertEquals(rows(contentColumns(content(), [], [], [1])).map((row) => Boolean(row.metric)), [true, true]);
  assertEquals(
    rows(contentColumns(content(), [], ['ingredient_amounts'], [1])).map((row) => Boolean(row.metric)),
    [true, false],
  );
});

Deno.test('contentColumns: calories set by hand drop the macros', () => {
  assertEquals(contentColumns(content(), ['calories'], [], []).nutrition, null);
});
