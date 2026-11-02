// npx deno test -A --no-lock supabase/functions/_shared/recipeAppliances_languages_test.ts
//
// Hebrew and English recipes end to end through the appliances task, with fetch stubbed so the
// model's answers are scripted. Checks what the model is sent, how its answers are cleaned, the tip
// check, and remix change detection, in both languages.

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import {
  buildAppliancesUserText,
  buildTipCheckUserText,
  deriveRecipeAppliances,
  stepsChanged,
  unmatchedApplianceNames,
} from './recipeAppliances.ts';
import { hubCardToExtractRecipe } from './recipeCards.ts';
import { completion, withModel } from './testing/applianceModelStub.ts';

const RLM = '\u200f';
const NBSP = '\u00a0';

const SHAKSHUKA_HE = {
  title: 'שקשוקה',
  ingredients: [
    { name: 'ביצים', quantity: 4, unit: '' },
    { name: 'עגבניות', quantity: 6, unit: '' },
    { name: 'כמון', quantity: 1, unit: 'כפית' },
  ],
  instructions: [
    { step: 1, text: 'מחממים שמן במחבת גדולה על אש בינונית.' },
    { step: 2, text: 'מוסיפים בצל ופלפל ומטגנים 5 דקות.' },
    { step: 3, text: 'כותשים כמון וגרעיני כוסברה במכתש ומוסיפים לרוטב.' },
    { step: 4, text: 'שוברים את הביצים לתוך הרוטב ומבשלים מכוסה 8 דקות.' },
  ],
};

const CAKE_HE = {
  title: 'עוגת שוקולד',
  ingredients: [
    { name: 'חמאה', quantity: 200, unit: 'גרם' },
    { name: 'סוכר', quantity: 1, unit: 'כוס' },
  ],
  instructions: [
    { step: 1, text: 'מחממים תנור ל-180 מעלות.' },
    { step: 2, text: 'מקציפים חמאה וסוכר במיקסר עד לקבלת תערובת אוורירית.' },
    { step: 3, text: 'אופים 35 דקות, או באייר פרייר 25 דקות ב-160 מעלות.' },
  ],
};

const SMOOTHIE_EN = {
  title: 'Banana smoothie',
  ingredients: [
    { name: 'banana', quantity: 1, unit: '' },
    { name: 'milk', quantity: 1, unit: 'cup' },
  ],
  instructions: [
    { step: 1, text: 'Add the banana, milk and honey to a blender.' },
    { step: 2, text: 'Blend until smooth and serve cold.' },
  ],
};

const STEAK_HE = {
  title: 'סטייק אנטריקוט',
  ingredients: [{ name: 'אנטריקוט', quantity: 1, unit: '' }],
  instructions: [
    { step: 1, text: 'מתבלים את הסטייק במלח גס.' },
    { step: 2, text: 'צורבים במחבת לוהטת 3 דקות מכל צד עד מדיום רייר.' },
    { step: 3, text: 'נותנים לנוח 5 דקות ופורסים.' },
  ],
};

const SALAD_MIXED = {
  title: 'סלט ישראלי',
  ingredients: [{ name: 'cucumber', quantity: 2, unit: '' }],
  instructions: [
    { step: 1, text: 'Chop the cucumbers and tomatoes finely.' },
    { step: 2, text: 'מתבלים בשמן זית ולימון.' },
  ],
};

function sentUserText(calls: Record<string, unknown>[], index: number): string {
  const messages = calls[index].messages as Array<{ role: string; content: unknown }>;
  const user = messages.find((m) => m.role === 'user');
  return typeof user?.content === 'string' ? user.content : JSON.stringify(user?.content);
}

Deno.test('Hebrew: the model receives the Hebrew steps intact, numbered, with no amounts', () =>
  withModel([completion({ appliances: [], unlisted: [] })], async ({ calls }) => {
    await deriveRecipeAppliances(SHAKSHUKA_HE, { tipsEnabled: false });
    const sent = sentUserText(calls, 0);
    assert(sent.includes('Title: שקשוקה'));
    assert(sent.includes('- כמון'));
    assert(sent.includes('3. כותשים כמון וגרעיני כוסברה במכתש ומוסיפים לרוטב.'));
    assertFalse(sent.includes('כפית'), 'units are not sent');
    assertFalse(/\b6\b/.test(sent.split('Steps:')[0]), 'quantities are not sent');
  }));

Deno.test('Hebrew shakshuka: stovetop required, mortar optional with its benefit', () =>
  withModel(
    [
      completion({
        appliances: [
          { key: 'stovetop', required: true, steps: [1, 2, 4], origin: 'source' },
          {
            key: 'mortar_and_pestle',
            required: false,
            benefit: 'richer_flavor',
            alternative: 'pre_ground',
            steps: [3],
            origin: 'source',
          },
        ],
        unlisted: [],
      }),
    ],
    async () => {
      const result = await deriveRecipeAppliances(SHAKSHUKA_HE, { tipsEnabled: false });
      assertEquals(result.appliances, [
        { key: 'stovetop', required: true, steps: [1, 2, 4], origin: 'source' },
        {
          key: 'mortar_and_pestle',
          required: false,
          benefit: 'richer_flavor',
          alternative: 'pre_ground',
          steps: [3],
          origin: 'source',
        },
      ]);
    },
  ));

Deno.test('Hebrew cake: oven with air fryer as the alternative, mixer optional', () =>
  withModel(
    [
      completion({
        appliances: [
          { key: 'oven', required: true, alternative: 'air_fryer', steps: [1, 3], origin: 'source' },
          { key: 'stand_mixer', required: false, benefit: 'less_effort', alternative: 'by_hand', steps: [2], origin: 'source' },
        ],
        unlisted: [],
      }),
    ],
    async () => {
      const result = await deriveRecipeAppliances(CAKE_HE, { tipsEnabled: false });
      assertEquals(result.appliances?.map((a) => [a.key, a.required, a.alternative]), [
        ['oven', true, 'air_fryer'],
        ['stand_mixer', false, 'by_hand'],
      ]);
    },
  ));

Deno.test('English smoothie: blender required on both steps', () =>
  withModel(
    [completion({ appliances: [{ key: 'blender', required: true, steps: [1, 2], origin: 'source' }], unlisted: [] })],
    async () => {
      assertEquals((await deriveRecipeAppliances(SMOOTHIE_EN)).appliances, [
        { key: 'blender', required: true, steps: [1, 2], origin: 'source' },
      ]);
    },
  ));

Deno.test('Hebrew and English: a step number that does not exist is dropped in both', () =>
  withModel(
    [
      completion({ appliances: [{ key: 'oven', required: true, steps: [9], origin: 'source' }], unlisted: [] }),
      completion({ appliances: [{ key: 'oven', required: true, steps: [9], origin: 'source' }], unlisted: [] }),
    ],
    async () => {
      assertEquals((await deriveRecipeAppliances(SHAKSHUKA_HE, { tipsEnabled: false })).appliances, null);
      assertEquals((await deriveRecipeAppliances(SMOOTHIE_EN, { tipsEnabled: false })).appliances, null);
    },
  ));

Deno.test('Hebrew: a model that answers with a Hebrew name instead of a key gets nothing', () =>
  withModel(
    [completion({ appliances: [{ key: 'תנור', required: true, steps: [1], origin: 'source' }], unlisted: [] })],
    async () => {
      assertEquals((await deriveRecipeAppliances(CAKE_HE, { tipsEnabled: false })).appliances, null);
    },
  ));

Deno.test('Hebrew steak: a thermometer tip confirmed by the check, checked in Hebrew', () =>
  withModel(
    [
      completion({
        appliances: [
          { key: 'stovetop', required: true, steps: [2], origin: 'source' },
          { key: 'kitchen_thermometer', required: false, benefit: 'juicier_meat', alternative: 'cut_to_check', steps: [2], origin: 'tip' },
        ],
        unlisted: [],
      }),
      completion({ checks: [{ key: 'kitchen_thermometer', fits: true }] }),
    ],
    async ({ calls }) => {
      const result = await deriveRecipeAppliances(STEAK_HE, { tipsEnabled: true });
      assertEquals(result.appliances?.map((a) => [a.key, a.origin]), [
        ['stovetop', 'source'],
        ['kitchen_thermometer', 'tip'],
      ]);
      const checkText = sentUserText(calls, 1);
      assert(checkText.includes('2. צורבים במחבת לוהטת 3 דקות מכל צד עד מדיום רייר.'));
      assert(checkText.includes('kitchen_thermometer (step 2): juicier_meat'));
    },
  ));

Deno.test('Hebrew cake: a tip that does not fit (zester on a cake) is rejected by the check', () =>
  withModel(
    [
      completion({
        appliances: [
          { key: 'oven', required: true, steps: [1, 3], origin: 'source' },
          { key: 'zester', required: false, benefit: 'richer_flavor', steps: [2], origin: 'tip' },
        ],
        unlisted: [],
      }),
      completion({ checks: [{ key: 'zester', fits: false }] }),
    ],
    async () => {
      const result = await deriveRecipeAppliances(CAKE_HE, { tipsEnabled: true });
      assertEquals(result.appliances?.map((a) => a.key), ['oven']);
      assertEquals([result.tipsProposed, result.tipsKept], [1, 0]);
    },
  ));

Deno.test('mixed Hebrew and English steps: no-cook salad needs nothing', () =>
  withModel([completion({ appliances: [], unlisted: [] })], async ({ calls }) => {
    const result = await deriveRecipeAppliances(SALAD_MIXED, { tipsEnabled: false });
    assertEquals(result.appliances, []);
    const sent = sentUserText(calls, 0);
    assert(sent.includes('1. Chop the cucumbers and tomatoes finely.'));
    assert(sent.includes('2. מתבלים בשמן זית ולימון.'));
  }));

Deno.test('Hebrew and English unknown equipment is logged; known names in either language are not', () => {
  assertEquals(
    unmatchedApplianceNames(['מכונת פסטה', 'מיקסר', 'בתנור', 'Pasta machine', 'the KitchenAid', 'מכונת פסטה']),
    ['מכונת פסטה', 'pasta machine'],
  );
});

Deno.test('remix detection: invisible marks and spacing in Hebrew are not a change, new wording is', () => {
  const before = CAKE_HE.instructions;
  const copied = before.map((s) => ({ ...s, text: `${RLM}${s.text.replace(' ', NBSP)}${RLM}` }));
  assertFalse(stepsChanged(before, copied));
  const airFryer = before.map((s) => (s.step === 3 ? { ...s, text: 'מכניסים לאייר פרייר ל-25 דקות.' } : s));
  assert(stepsChanged(before, airFryer));
  assertFalse(stepsChanged(SMOOTHIE_EN.instructions, SMOOTHIE_EN.instructions.map((s) => ({ ...s, text: s.text.toUpperCase() }))));
});

Deno.test('Hub cache hit with Hebrew steps keeps only grounded appliances', () => {
  const recipe = hubCardToExtractRecipe({
    title: CAKE_HE.title,
    platform: 'web',
    instructions: CAKE_HE.instructions,
    appliances: [
      { key: 'oven', required: true, steps: [1, 3], origin: 'source' },
      { key: 'blender', required: true, steps: [5], origin: 'source' },
    ],
  });
  assertEquals(recipe.appliances, [{ key: 'oven', required: true, steps: [1, 3], origin: 'source' }]);
});

Deno.test('prompt builders keep Hebrew and English text byte-for-byte', () => {
  const he = buildAppliancesUserText(SHAKSHUKA_HE);
  const en = buildAppliancesUserText(SMOOTHIE_EN);
  for (const step of SHAKSHUKA_HE.instructions) assert(he.includes(step.text));
  for (const step of SMOOTHIE_EN.instructions) assert(en.includes(step.text));
  const tipText = buildTipCheckUserText(STEAK_HE, [
    { key: 'kitchen_thermometer', required: false, benefit: 'juicier_meat', steps: [2], origin: 'tip' },
  ]);
  assert(tipText.includes('Title: סטייק אנטריקוט'));
  assert(tipText.endsWith('- kitchen_thermometer (step 2): juicier_meat'));
});
