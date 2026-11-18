// npx deno test -A --no-lock supabase/functions/_shared/dietsBackfill_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import {
  clampDietsBatchSize,
  type DeriveDietsFn,
  type DietsBackfillDb,
  type PendingCard,
  runDietsBackfillBatch,
} from './dietsBackfill.ts';
import type { HubDietKey } from './recipeDiets.ts';

type Card = PendingCard & { diets: HubDietKey[] | null };

const USAGE = { model: 'openai/gpt-6-luna', kind: 'diets', promptTokenCount: 500, candidatesTokenCount: 20, thoughtsTokenCount: 0, totalTokenCount: 520 };

function card(id: string, diets: HubDietKey[] | null = null): Card {
  return { id, title: `Card ${id}`, ingredients: [{ name: 'rice' }], instructions: [], diets };
}

function fakeDb(cards: Card[], onSave?: (id: string) => void): DietsBackfillDb {
  return {
    fetchPending: (after, limit) =>
      Promise.resolve(
        cards
          .filter((c) => c.diets === null && (after === null || c.id > after))
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, limit),
      ),
    countPending: () => Promise.resolve(cards.filter((c) => c.diets === null).length),
    saveDiets(id, diets) {
      onSave?.(id);
      const target = cards.find((c) => c.id === id);
      if (!target || target.diets !== null) return Promise.resolve(false);
      target.diets = diets;
      return Promise.resolve(true);
    },
  };
}

const vegan: DeriveDietsFn = () => Promise.resolve({ diets: ['vegan'], usages: [USAGE] });

Deno.test('fills only unchecked cards and pages with a cursor', async () => {
  const cards = [card('a'), card('b', []), card('c'), card('d')];
  const db = fakeDb(cards);

  const first = await runDietsBackfillBatch(db, vegan, { after: null, limit: 2 });
  assertEquals(first.scanned, 2);
  assertEquals(first.updated, 2);
  assertEquals(first.nextCursor, 'c');
  assertEquals(first.usages.length, 2);

  const second = await runDietsBackfillBatch(db, vegan, { after: first.nextCursor, limit: 2 });
  assertEquals(second.scanned, 1);
  assertEquals(second.nextCursor, null);
  assertEquals(cards.map((c) => c.diets), [['vegan'], [], ['vegan'], ['vegan']]);
});

Deno.test('a failed check stays null and is reported', async () => {
  const cards = [card('a'), card('b')];
  const derive: DeriveDietsFn = (recipe) =>
    Promise.resolve(
      recipe.title === 'Card a' ? { diets: null, usages: [], error: 'timeout' } : { diets: [], usages: [USAGE] },
    );
  const result = await runDietsBackfillBatch(fakeDb(cards), derive, { after: null, limit: 20 });
  assertEquals(result.updated, 1);
  assertEquals(result.stillNull, 1);
  assertEquals(result.errors, ['a: timeout']);
  assertEquals(cards[0].diets, null);
});

Deno.test('a card checked by someone else meanwhile is skipped, not overwritten', async () => {
  const cards = [card('a')];
  const db = fakeDb(cards, (id) => {
    const target = cards.find((c) => c.id === id);
    if (target) target.diets = ['keto'];
  });
  const result = await runDietsBackfillBatch(db, vegan, { after: null, limit: 20 });
  assertEquals(result.skipped, 1);
  assertEquals(cards[0].diets, ['keto']);
});

Deno.test('clampDietsBatchSize keeps batches between 1 and 20', () => {
  assertEquals(clampDietsBatchSize(undefined), 20);
  assertEquals(clampDietsBatchSize(0), 1);
  assertEquals(clampDietsBatchSize(500), 20);
  assertEquals(clampDietsBatchSize(5), 5);
});
