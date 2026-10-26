// npx -y deno test -A --no-lock eval/appliances_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import type { RecipeAppliance } from '../supabase/functions/_shared/appliances.ts';
import { type ApplianceCase, scoreCase, totals } from './appliances.ts';

const cookies: ApplianceCase = {
  id: 'cookies',
  lang: 'en',
  title: 'Cookies',
  ingredients: [],
  steps: ['Heat oven', 'Cream butter', 'Bake'],
  expect: [
    { any_of: ['oven'], required: true },
    { any_of: ['stand_mixer', 'hand_mixer'], required: false },
  ],
  also_ok: ['kitchen_scale'],
  tips_ok: ['kitchen_scale'],
};

const item = (key: string, required: boolean, origin: 'source' | 'tip' = 'source'): RecipeAppliance =>
  ({ key, required, steps: [1], origin }) as RecipeAppliance;

Deno.test('a perfect answer scores full marks', () => {
  const s = scoreCase(cookies, [item('oven', true), item('hand_mixer', false)]);
  assertEquals([s.truePositives, s.falsePositives, s.missed, s.requiredChecked, s.requiredCorrect], [2, [], [], 2, 2]);
});

Deno.test('any_of accepts either key but only once per expected entry', () => {
  const s = scoreCase(cookies, [item('oven', true), item('stand_mixer', false), item('hand_mixer', false)]);
  assertEquals(s.truePositives, 2);
  assertEquals(s.falsePositives, ['hand_mixer']);
});

Deno.test('extras, misses and wrong required readings are counted', () => {
  const s = scoreCase(cookies, [item('oven', false), item('blender', true)]);
  assertEquals(s.falsePositives, ['blender']);
  assertEquals(s.missed, ['stand_mixer|hand_mixer']);
  assertEquals([s.requiredChecked, s.requiredCorrect], [1, 0]);
});

Deno.test('also_ok keys are neither credit nor penalty', () => {
  const s = scoreCase(cookies, [item('oven', true), item('kitchen_scale', false)]);
  assertEquals([s.truePositives, s.falsePositives.length], [1, 0]);
});

Deno.test('tips are scored only against tips_ok', () => {
  const s = scoreCase(cookies, [item('kitchen_scale', false, 'tip'), item('kitchen_thermometer', false, 'tip')]);
  assertEquals(s.tipsKept, ['kitchen_scale', 'kitchen_thermometer']);
  assertEquals(s.tipsThatDontFit, ['kitchen_thermometer']);
  assertEquals(s.truePositives, 0);
});

Deno.test('"either" entries count for recall but not for required accuracy', () => {
  const pesto: ApplianceCase = { ...cookies, expect: [{ any_of: ['food_processor'], required: 'either' }] };
  const s = scoreCase(pesto, [item('food_processor', true)]);
  assertEquals([s.truePositives, s.requiredChecked], [1, 0]);
});

Deno.test('not analysed misses everything; an empty expectation with [] is perfect', () => {
  const none = scoreCase(cookies, null);
  assertEquals([none.notAnalysed, none.missed.length], [true, 2]);
  const salad: ApplianceCase = { ...cookies, expect: [] };
  assertEquals(totals([{ testCase: salad, score: scoreCase(salad, []) }]).precision, 1);
});

Deno.test('totals add up across cases', () => {
  const a = scoreCase(cookies, [item('oven', true), item('hand_mixer', false)]);
  const b = scoreCase(cookies, [item('oven', true), item('blender', true)]);
  const t = totals([
    { testCase: cookies, score: a },
    { testCase: cookies, score: b },
  ]);
  assertEquals(t.precision, 3 / 4);
  assertEquals(t.recall, 3 / 4);
  assertEquals(t.requiredAccuracy, 1);
});

Deno.test('every label in cases/appliances.json uses real catalog keys', async () => {
  const { isApplianceKey } = await import('../supabase/functions/_shared/appliances.ts');
  const { TIP_KEYS } = await import('../supabase/functions/_shared/recipeAppliances.ts');
  const file = JSON.parse(await Deno.readTextFile(new URL('./cases/appliances.json', import.meta.url)));
  const ids = new Set<string>();
  for (const c of file.cases as ApplianceCase[]) {
    assertEquals(ids.has(c.id), false, `duplicate id ${c.id}`);
    ids.add(c.id);
    for (const key of [...c.expect.flatMap((e) => e.any_of), ...c.also_ok, ...c.tips_ok]) {
      assertEquals(isApplianceKey(key), true, `${c.id}: unknown key ${key}`);
    }
    for (const key of c.tips_ok) assertEquals((TIP_KEYS as readonly string[]).includes(key), true, `${c.id}: ${key} can't be a tip`);
    assertEquals(c.steps.length > 0, true, `${c.id} has no steps`);
  }
});
