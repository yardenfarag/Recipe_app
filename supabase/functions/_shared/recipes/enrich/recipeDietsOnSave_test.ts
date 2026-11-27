import { assertEquals } from 'jsr:@std/assert@1';

import type { HubPublishDecision } from '../recipeCards.ts';
import { dietsAfterExtract, type DietsOnSaveDeps, sameIngredientNames, worthOwnDietCheck } from './recipeDietsOnSave.ts';

function deps(calls: string[], stored: string[] | null = ['halal']): DietsOnSaveDeps {
  return {
    fillCard: (id) => {
      calls.push(`fill:${id}`);
      return Promise.resolve(['vegan', 'vegetarian']);
    },
    readCard: (id) => {
      calls.push(`read:${id}`);
      return Promise.resolve(stored);
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
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls), true), ['vegan', 'vegetarian']);
  assertEquals(calls, ['fill:c1']);
});

Deno.test('a card checked before: its answer is read, no model call', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'existing', cardId: 'c2', canonicalKey: 'k', needsDiets: false, filled: [] };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls), true), ['halal']);
  assertEquals(calls, ['read:c2']);
});

Deno.test('no card (the cook does not share, a photo): a check of its own, logged', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'skipped', reason: 'opted_out' };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls), true), ['kosher']);
  assertEquals(calls, ['derive', 'log']);
});

Deno.test('a guest with no card: nothing to label, no model call', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'skipped', reason: 'opted_out' };
  assertEquals(await dietsAfterExtract(decision, null, deps(calls), true), null);
  assertEquals(calls, []);
});

Deno.test('a card whose ingredients differ: its answer is not used, the recipe gets a check of its own', async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'existing', cardId: 'c3', canonicalKey: 'k', needsDiets: false, filled: [] };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls, null), true), ['kosher']);
  assertEquals(calls, ['read:c3', 'derive', 'log']);
});

Deno.test("a partial or one-line recipe: no check of its own (the editor's save checks it)", async () => {
  const calls: string[] = [];
  const decision: HubPublishDecision = { status: 'skipped', reason: 'opted_out' };
  assertEquals(await dietsAfterExtract(decision, 'u1', deps(calls), false), null);
  assertEquals(calls, []);
});

Deno.test('worthOwnDietCheck: full, with two named ingredients', () => {
  const two = { ingredients: [{ name: 'Rice' }, { name: 'egg' }] };
  assertEquals(worthOwnDietCheck(true, two), true);
  assertEquals(worthOwnDietCheck(false, two), false);
  assertEquals(worthOwnDietCheck(true, { ingredients: [{ name: 'rice' }, { name: ' ' }] }), false);
  assertEquals(worthOwnDietCheck(true, { ingredients: 'rice' }), false);
});

Deno.test('sameIngredientNames: case and spaces aside, the same names in order', () => {
  assertEquals(sameIngredientNames([{ name: 'Rice ' }, { name: 'egg' }], [{ name: 'rice', quantity: 1 }, { name: 'Egg' }]), true);
  assertEquals(sameIngredientNames([{ name: 'rice' }, { name: 'egg' }], [{ name: 'egg' }, { name: 'rice' }]), false);
  assertEquals(sameIngredientNames([{ name: 'rice' }], [{ name: 'rice' }, { name: 'bacon' }]), false);
  assertEquals(sameIngredientNames([], []), false);
});
