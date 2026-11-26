import { assertEquals } from 'jsr:@std/assert@1';

import type { HubPublishDecision } from '../recipeCards.ts';
import { dietsAfterExtract, type DietsOnSaveDeps } from './recipeDietsOnSave.ts';

function deps(calls: string[]): DietsOnSaveDeps {
  return {
    fillCard: (id) => {
      calls.push(`fill:${id}`);
      return Promise.resolve(['vegan', 'vegetarian']);
    },
    readCard: (id) => {
      calls.push(`read:${id}`);
      return Promise.resolve(['halal']);
    },
    derive: () => {
      calls.push('derive');
      return Promise.resolve({ diets: ['kosher'], contains: [], usages: [] } as never);
    },
    logOwnCheck: () => {
      calls.push('log');
      return Promise.resolve();
    },
  };
}

Deno.test('a new Hub card: its own check labels the recipe too, with no extra call', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'published', cardId: 'c1', canonicalKey: 'k', needsDiets: true, replaced: false };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls)), ['vegan', 'vegetarian']);
  assertEquals(calls, ['fill:c1']);
});

Deno.test('a card checked before: its answer is read, no model call', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'existing', cardId: 'c2', canonicalKey: 'k', needsDiets: false, filled: [] };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls)), ['halal']);
  assertEquals(calls, ['read:c2']);
});

Deno.test('no card (the cook does not share, a photo): a check of its own, logged', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'skipped', reason: 'opted_out' };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls)), ['kosher']);
  assertEquals(calls, ['derive', 'log']);
});

Deno.test('a guest with no card: nothing to label, no model call', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'skipped', reason: 'opted_out' };
  assertEquals(await dietsAfterExtract(decision, null, deps(calls)), null);
  assertEquals(calls, []);
});
