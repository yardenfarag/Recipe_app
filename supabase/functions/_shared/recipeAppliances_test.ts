// npx deno test -A --no-lock supabase/functions/_shared/recipeAppliances_test.ts
//
// Every test stubs fetch, so no model is called and no API key is needed.
// Hebrew and English end-to-end cases live in recipeAppliances_languages_test.ts.

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import { numberedSteps } from './appliances.ts';
import {
  appliancesForRecipe,
  appliancesList,
  buildAppliancesSchema,
  buildAppliancesSystemPrompt,
  buildAppliancesUserText,
  confirmedTipKeys,
  deriveRecipeAppliances,
  stepsChanged,
  unmatchedApplianceNames,
} from './recipeAppliances.ts';
import { completion, failure, STEAK, withModel } from './testing/applianceModelStub.ts';

const SOUP = {
  title: 'Roasted tomato soup',
  ingredients: [
    { name: 'tomatoes', quantity: 1, unit: 'kg' },
    { name: 'garlic', quantity: 4, unit: 'cloves' },
  ],
  instructions: [
    { step: 1, text: 'Heat the oven to 200°C.' },
    { step: 2, text: 'Roast the tomatoes and garlic for 30 minutes.' },
    { step: 3, text: 'Blend until smooth and season.' },
  ],
};

const THERMOMETER_TIP = {
  key: 'kitchen_thermometer',
  required: false,
  benefit: 'juicier_meat',
  alternative: 'cut_to_check',
  steps: [2],
  origin: 'tip',
};

Deno.test('cleans the model answer against the catalog and the real steps', () =>
  withModel(
    [
      completion({
        appliances: [
          { key: 'oven', required: true, steps: [1, 2], origin: 'source' },
          { key: 'blender', required: true, alternative: 'immersion_blender', steps: [3], origin: 'source' },
          { key: 'pasta_machine', required: true, steps: [2], origin: 'source' },
          { key: 'stand_mixer', required: false, benefit: 'less_effort', steps: [9], origin: 'source' },
        ],
        unlisted: [],
      }),
    ],
    async ({ calls }) => {
      const result = await deriveRecipeAppliances(SOUP, { tipsEnabled: false });
      assertEquals(result.appliances, [
        { key: 'oven', required: true, steps: [1, 2], origin: 'source' },
        { key: 'blender', required: true, alternative: 'immersion_blender', steps: [3], origin: 'source' },
      ]);
      assertEquals(result.usages.map((u) => u.kind), ['appliances']);
      assertEquals(result.error, undefined);
      assertEquals(calls.length, 1, 'no tips proposed, so no tip check');
      assertEquals(calls[0].model, 'openai/gpt-6-luna');
    },
  ));

Deno.test('an empty answer means analysed and needs nothing', () =>
  withModel([completion({ appliances: [], unlisted: [] })], async () => {
    assertEquals((await deriveRecipeAppliances(SOUP)).appliances, []);
  }));

Deno.test('a recipe with no steps is not sent to the model', () =>
  withModel([completion({ appliances: [], unlisted: [] })], async ({ calls }) => {
    const result = await deriveRecipeAppliances({ ...SOUP, instructions: [] });
    assertEquals(result, { appliances: null, unmatched: [], usages: [], tipsProposed: 0, tipsKept: 0 });
    assertEquals(calls.length, 0);
  }));

Deno.test('a provider error gives not analysed and never throws', () =>
  withModel([failure(500)], async () => {
    const result = await deriveRecipeAppliances(SOUP, { timeoutMs: 2_000 });
    assertEquals(result.appliances, null);
    assertEquals(result.usages, []);
    assert(result.error, 'the error is reported for logging');
  }));

Deno.test('unparseable output gives not analysed', () =>
  withModel([completion('the oven, I think')], async () => {
    assertEquals((await deriveRecipeAppliances(SOUP)).appliances, null);
  }));

Deno.test('a missing API key gives not analysed', async () => {
  const saved = ['OPENROUTER_API_KEY', 'OPEN_ROUTER_API_KEY'].map((k) => [k, Deno.env.get(k)] as const);
  for (const [key] of saved) Deno.env.delete(key);
  try {
    const result = await deriveRecipeAppliances(SOUP);
    assertEquals(result.appliances, null);
    assert(result.error);
  } finally {
    for (const [key, value] of saved) if (value !== undefined) Deno.env.set(key, value);
  }
});

Deno.test('tips are on by default and off only when APPLIANCE_TIPS_ENABLED=false', async () => {
  const previous = Deno.env.get('APPLIANCE_TIPS_ENABLED');
  try {
    for (const [value, offersTips] of [[null, true], ['true', true], ['false', false], [' FALSE ', false]] as const) {
      if (value === null) Deno.env.delete('APPLIANCE_TIPS_ENABLED');
      else Deno.env.set('APPLIANCE_TIPS_ENABLED', value);
      await withModel([completion({ appliances: [], unlisted: [] })], async ({ calls }) => {
        await deriveRecipeAppliances(SOUP);
        assertEquals(JSON.stringify(calls[0].response_format).includes('"tip"'), offersTips, `value ${value}`);
      });
    }
  } finally {
    if (previous === undefined) Deno.env.delete('APPLIANCE_TIPS_ENABLED');
    else Deno.env.set('APPLIANCE_TIPS_ENABLED', previous);
  }
});

Deno.test('a tip the check confirms is kept, and the check is a second call', () =>
  withModel(
    [
      completion({
        appliances: [{ key: 'stovetop', required: true, steps: [2], origin: 'source' }, THERMOMETER_TIP],
        unlisted: [],
      }),
      completion({ checks: [{ key: 'kitchen_thermometer', fits: true }] }),
    ],
    async ({ calls }) => {
      const result = await deriveRecipeAppliances(STEAK, { tipsEnabled: true });
      assertEquals(result.appliances?.map((a) => [a.key, a.origin]), [
        ['stovetop', 'source'],
        ['kitchen_thermometer', 'tip'],
      ]);
      assertEquals(calls.length, 2);
      assertEquals(result.usages.length, 2, 'both calls are costed');
      assertEquals([result.tipsProposed, result.tipsKept], [1, 1]);
      const checkText = JSON.stringify(calls[1].messages);
      assert(checkText.includes('kitchen_thermometer (step 2)'), 'the check sees the tip and its step');
    },
  ));

Deno.test('a tip the check rejects is dropped, source items stay', () =>
  withModel(
    [
      completion({
        appliances: [{ key: 'stovetop', required: true, steps: [2], origin: 'source' }, THERMOMETER_TIP],
        unlisted: [],
      }),
      completion({ checks: [{ key: 'kitchen_thermometer', fits: false }] }),
    ],
    async () => {
      const result = await deriveRecipeAppliances(STEAK, { tipsEnabled: true });
      assertEquals(result.appliances?.map((a) => a.key), ['stovetop']);
      assertEquals([result.tipsProposed, result.tipsKept], [1, 0]);
    },
  ));

Deno.test('a failed tip check drops every tip but keeps the recipe appliances', () =>
  withModel(
    [
      completion({
        appliances: [{ key: 'stovetop', required: true, steps: [2], origin: 'source' }, THERMOMETER_TIP],
        unlisted: [],
      }),
      failure(503),
    ],
    async () => {
      const result = await deriveRecipeAppliances(STEAK, { tipsEnabled: true, timeoutMs: 2_000 });
      assertEquals(result.appliances?.map((a) => a.key), ['stovetop']);
      assert(result.error?.startsWith('tip_check'));
    },
  ));

Deno.test('when only tips were proposed and all are rejected, the recipe needs nothing', () =>
  withModel(
    [
      completion({ appliances: [THERMOMETER_TIP], unlisted: [] }),
      completion({ checks: [{ key: 'kitchen_thermometer', fits: false }] }),
    ],
    async () => {
      assertEquals((await deriveRecipeAppliances(STEAK, { tipsEnabled: true })).appliances, []);
    },
  ));

Deno.test('a tip outside the benefit tools is dropped without a check', () =>
  withModel(
    [
      completion({
        appliances: [{ key: 'stand_mixer', required: false, benefit: 'less_effort', steps: [1], origin: 'tip' }],
        unlisted: [],
      }),
    ],
    async ({ calls }) => {
      assertEquals((await deriveRecipeAppliances(STEAK, { tipsEnabled: true })).appliances, []);
      assertEquals(calls.length, 1);
    },
  ));

Deno.test('tips are dropped and never checked while tips are off', () =>
  withModel(
    [completion({ appliances: [{ key: 'stovetop', required: true, steps: [2] }, THERMOMETER_TIP], unlisted: [] })],
    async ({ calls }) => {
      const result = await deriveRecipeAppliances(STEAK, { tipsEnabled: false });
      assertEquals(result.appliances?.map((a) => a.key), ['stovetop']);
      assertEquals(calls.length, 1);
    },
  ));

Deno.test('confirmedTipKeys needs an explicit yes, and any no wins', () => {
  assertEquals([...confirmedTipKeys({ checks: [{ key: 'zester', fits: true }] })], ['zester']);
  assertEquals([...confirmedTipKeys({ checks: [{ key: 'zester', fits: 'yes' }] })], []);
  assertEquals(
    [...confirmedTipKeys({ checks: [{ key: 'zester', fits: true }, { key: 'zester', fits: false }] })],
    [],
  );
  assertEquals([...confirmedTipKeys({ checks: 'all good' })], []);
  assertEquals([...confirmedTipKeys(null)], []);
});

Deno.test('appliancesForRecipe adds every call to the caller usages and logs tip counts', () =>
  withModel(
    [
      completion({ appliances: [THERMOMETER_TIP], unlisted: ['Pasta machine'] }),
      completion({ checks: [{ key: 'kitchen_thermometer', fits: true }] }),
    ],
    async () => {
      const previous = Deno.env.get('APPLIANCE_TIPS_ENABLED');
      Deno.env.delete('APPLIANCE_TIPS_ENABLED');
      try {
        const usages = [
          { model: 'm', kind: 'text', promptTokenCount: 1, candidatesTokenCount: 1, thoughtsTokenCount: 0, totalTokenCount: 2 },
        ];
        const { appliances, metadata } = await appliancesForRecipe(STEAK, usages);
        assertEquals(appliances?.map((a) => a.key), ['kitchen_thermometer']);
        assertEquals(usages.map((u) => u.kind), ['text', 'appliances', 'appliances']);
        assertEquals(metadata, {
          appliances_count: 1,
          appliance_tips_proposed: 1,
          appliance_tips_kept: 1,
          unmatched_appliances: ['pasta machine'],
        });
      } finally {
        if (previous !== undefined) Deno.env.set('APPLIANCE_TIPS_ENABLED', previous);
      }
    },
  ));

Deno.test('reports equipment with no catalog key, once each', () =>
  withModel(
    [completion({ appliances: [], unlisted: ['Pasta machine', 'pasta machine', 'KitchenAid', '', 7] })],
    async () => {
      assertEquals((await deriveRecipeAppliances(SOUP)).unmatched, ['pasta machine']);
    },
  ));

Deno.test('unmatchedApplianceNames caps the list and ignores non-arrays', () => {
  assertEquals(unmatchedApplianceNames('pasta machine'), []);
  const many = Array.from({ length: 20 }, (_, i) => `gadget ${i}`);
  assertEquals(unmatchedApplianceNames(many).length, 10);
});

Deno.test('numberedSteps keeps declared numbers, fills gaps and skips empty or repeated steps', () => {
  assertEquals(
    numberedSteps([
      { step: 1, text: 'Boil' },
      { text: 'Drain' },
      { step: 1, text: 'Duplicate' },
      { step: 4, text: '   ' },
      'not a step',
      { step: 5, text: 'Serve' },
    ]),
    [
      { step: 1, text: 'Boil' },
      { step: 2, text: 'Drain' },
      { step: 5, text: 'Serve' },
    ],
  );
  assertEquals(numberedSteps(null), []);
});

Deno.test('stepsChanged ignores spacing, case and numbering, but not wording', () => {
  const steps = [
    { step: 1, text: 'Heat the oven.' },
    { step: 2, text: 'Bake 20 minutes.' },
  ];
  assertFalse(stepsChanged(steps, [{ step: 1, text: '  heat the OVEN. ' }, { text: 'Bake  20 minutes.' }]));
  assert(stepsChanged(steps, [{ step: 1, text: 'Heat the air fryer.' }, { step: 2, text: 'Bake 20 minutes.' }]));
  assert(stepsChanged(steps, steps.slice(0, 1)));
  assertFalse(stepsChanged(null, []));
});

Deno.test('the prompt text has names and steps but no amounts', () => {
  const text = buildAppliancesUserText(SOUP);
  assert(text.includes('- tomatoes'));
  assert(text.includes('3. Blend until smooth and season.'));
  assertFalse(text.includes('kg'));
  assertFalse(text.includes('cloves'));
});

Deno.test('the schema lists every catalog key and only offers tips when they are on', () => {
  const off = JSON.stringify(buildAppliancesSchema(false));
  assert(off.includes('"mortar_and_pestle"'));
  assertFalse(off.includes('"tip"'));
  assert(JSON.stringify(buildAppliancesSchema(true)).includes('"tip"'));
  assert(buildAppliancesSystemPrompt(true).includes('Pinch tips'));
  assertFalse(buildAppliancesSystemPrompt(false).includes('Pinch tips'));
});

// Regression, found by a live run on 2026-10-23: with strict: false, Luna left out `required` on every
// item, so every recipe came back "not analysed". The schema and prompt now insist on it, and the
// sanitizer still refuses to guess.
Deno.test('the schema and prompt insist on `required` for every item', () => {
  const items = (buildAppliancesSchema(true).properties as Record<string, Record<string, Record<string, unknown>>>)
    .appliances.items as { required: string[]; properties: Record<string, { description?: string }> };
  assert(items.required.includes('required'));
  assert(items.properties.required.description?.startsWith('Always present'));
  assert(buildAppliancesSystemPrompt(true).includes('Never leave out required'));
});

Deno.test('an item without `required` is dropped, not guessed', () =>
  withModel(
    [completion({ appliances: [{ key: 'blender', benefit: 'smoother_texture', steps: [3], origin: 'source' }], unlisted: [] })],
    async () => {
      assertEquals((await deriveRecipeAppliances(SOUP, { tipsEnabled: false })).appliances, null);
    },
  ));

// Regression, found by the eval on 2026-10-23: about 1 answer in 5 nested the list one level too deep.
Deno.test('a list nested one level too deep is unwrapped', () =>
  withModel(
    [completion({ appliances: { appliances: [{ key: 'oven', required: true, steps: [1], origin: 'source' }] }, unlisted: [] })],
    async () => {
      assertEquals((await deriveRecipeAppliances(SOUP, { tipsEnabled: false })).appliances, [
        { key: 'oven', required: true, steps: [1], origin: 'source' },
      ]);
    },
  ));

Deno.test('appliancesList only unwraps one level and ignores junk', () => {
  assertEquals(appliancesList({ appliances: [1] }), [1]);
  assertEquals(appliancesList({ appliances: { appliances: [2] } }), [2]);
  assertEquals(appliancesList({ appliances: { appliances: { appliances: [3] } } }), { appliances: { appliances: [3] } });
  assertEquals(appliancesList({ appliances: { items: [4] } }), { items: [4] });
  assertEquals(appliancesList('oven'), undefined);
});
