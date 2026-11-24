// npx deno test -A --no-lock supabase/functions/_shared/recipes/substitution_test.ts

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { completion, withModel } from '../testing/applianceModelStub.ts';
import { keepStepShape, rewriteInstructionsForSubstitutionWithLlm } from './substitution.ts';

const RECIPE = [
  { step: 1, text: 'Preheat the oven to 400°F (200°C). Grease a 9x13 baking dish.' },
  { step: 2, text: 'Season the chicken breasts with garlic powder, salt and pepper, and place them in the dish.' },
  { step: 3, text: 'Slice the zucchini into rounds and arrange them around the chicken.' },
  { step: 4, text: 'Top with mozzarella and bake for 25–30 minutes, until the chicken reaches 165°F.' },
];
const SWAPPED = 'Slice the bell pepper into strips and arrange them around the chicken.';
const rewriteOf = (recipe: { step: number; text: string }[]) => recipe.map((step) => ({ ...step }));
const ZUCCHINI = { from: 'zucchini', to: 'bell pepper' };

Deno.test('keepStepShape accepts a rewrite of the same steps', () => {
  const rewritten = rewriteOf(RECIPE);
  rewritten[2].text = SWAPPED;
  assertEquals(keepStepShape(RECIPE, rewritten, ZUCCHINI), {
    instructions: [RECIPE[0], RECIPE[1], { step: 3, text: SWAPPED }, RECIPE[3]],
  });
});

// PIN-186: this answer was saved as it came, and the recipe lost steps 1 and 2.
Deno.test('keepStepShape refuses a shorter rewrite', () => {
  assertEquals(keepStepShape(RECIPE, rewriteOf(RECIPE).slice(2), ZUCCHINI), {
    refused: 'Rewrite has 2 steps, the recipe has 4',
  });
});

Deno.test('keepStepShape refuses a longer rewrite', () => {
  assertEquals(keepStepShape(RECIPE, [...rewriteOf(RECIPE), { step: 5, text: 'Serve warm.' }], ZUCCHINI), {
    refused: 'Rewrite has 5 steps, the recipe has 4',
  });
});

Deno.test('keepStepShape refuses a rewrite that merged two steps and kept the count', () => {
  const rewritten = [
    RECIPE[0],
    { step: 2, text: `${RECIPE[1].text} ${SWAPPED}` },
    RECIPE[3],
    { step: 4, text: 'Serve warm with a green salad on the side.' },
  ];
  assertEquals(keepStepShape(RECIPE, rewritten, ZUCCHINI), { refused: 'Rewrite replaced step 3' });
});

Deno.test("keepStepShape keeps the recipe's step numbers when the rewrite renumbers them", () => {
  const recipe = RECIPE.slice(1);
  const rewritten = recipe.map((step, index) => ({ step: index + 1, text: step.text }));
  assertEquals(keepStepShape(recipe, rewritten, ZUCCHINI), { instructions: recipe });
});

Deno.test('keepStepShape takes a missing or broken step number', () => {
  const rewritten = RECIPE.map((step, index) => ({ step: index === 0 ? undefined : Number.NaN, text: step.text }));
  assertEquals(keepStepShape(RECIPE, rewritten, ZUCCHINI), { instructions: RECIPE });
});

Deno.test("keepStepShape keeps a step's text when its rewrite is empty", () => {
  const rewritten = rewriteOf(RECIPE).map((step, index) => (index === 0 ? { step: 1, text: '  ' } : step));
  rewritten[2].text = SWAPPED;
  assertEquals(keepStepShape(RECIPE, [rewritten[0], { step: 2 }, rewritten[2], rewritten[3]], ZUCCHINI), {
    instructions: [RECIPE[0], RECIPE[1], { step: 3, text: SWAPPED }, RECIPE[3]],
  });
});

// The step the damaged recipe was saved with.
Deno.test('keepStepShape refuses a note written in place of a step', () => {
  const rewritten = rewriteOf(RECIPE);
  rewritten[0].text =
    'No fish ingredients are listed, so no fish substitution is needed. Follow the original preparation; the provided instructions begin at step 2.';
  assertEquals(keepStepShape(RECIPE, rewritten, ZUCCHINI), { refused: 'Rewrite replaced step 1' });
});

Deno.test('keepStepShape refuses a step that came back in another language', () => {
  const rewritten = rewriteOf(RECIPE);
  rewritten[2].text = 'Corta el pimiento en tiras y colócalas alrededor del pollo.';
  assertEquals(keepStepShape(RECIPE, rewritten, ZUCCHINI), { refused: 'Rewrite replaced step 3' });
});

Deno.test('keepStepShape accepts a step whose technique changed with the ingredient', () => {
  const recipe = [{ step: 1, text: 'Whisk the eggs with the sugar until pale and fluffy.' }];
  const rewritten = [{ step: 1, text: 'Blend the silken tofu with the sugar until smooth.' }];
  assertEquals(keepStepShape(recipe, rewritten, { from: 'eggs', to: 'silken tofu' }), { instructions: rewritten });
});

Deno.test('keepStepShape accepts a step about the old ingredient redone for the substitute', () => {
  const recipe = [{ step: 1, text: 'Cook the spaghetti according to the package directions, then drain.' }];
  const rewritten = [{ step: 1, text: 'Spiralize the zucchini and fry it for 2 minutes, until just tender.' }];
  const swap = { from: 'spaghetti', to: 'zucchini' };
  assertEquals(keepStepShape(recipe, rewritten, swap), { instructions: rewritten });
  // Redone, but not about the substitute.
  const note = [{ step: 1, text: 'This recipe has no pasta, so nothing was changed here.' }];
  assertEquals(keepStepShape(recipe, note, swap), { refused: 'Rewrite replaced step 1' });
});

Deno.test('keepStepShape compares Hebrew steps by their words', () => {
  const recipe = [{ step: 1, text: 'ממיסים את החמאה במחבת על אש בינונית.' }];
  const rewritten = [{ step: 1, text: 'מחממים את שמן הזית במחבת על אש בינונית.' }];
  const swap = { from: 'חמאה', to: 'שמן זית' };
  assertEquals(keepStepShape(recipe, rewritten, swap), { instructions: rewritten });
  assertEquals(keepStepShape(recipe, [{ step: 1, text: 'Heat the olive oil in a pan over medium heat.' }], swap), {
    refused: 'Rewrite replaced step 1',
  });
});

Deno.test('keepStepShape leaves a step too short to compare alone', () => {
  const recipe = [{ step: 1, text: 'Fry the fish.' }];
  const rewritten = [{ step: 1, text: 'Bake the tofu at 200°C for 20 minutes.' }];
  assertEquals(keepStepShape(recipe, rewritten, { from: 'fish', to: 'tofu' }), { instructions: rewritten });
});

// The whole call, with the model's answer scripted.
const SWAP = {
  ingredient: { name: 'zucchini', quantity: 1, unit: '' },
  alternative: { name: 'bell pepper', quantity: 1, unit: '' },
  instructions: RECIPE,
  recipeTitle: 'Baked Chicken and Zucchini Casserole',
  language: 'en' as const,
};

Deno.test('a rewrite that kept the steps comes back with the cost of the call', async () => {
  const answer = rewriteOf(RECIPE);
  answer[2].text = SWAPPED;
  await withModel([completion({ instructions: answer })], async () => {
    const result = await rewriteInstructionsForSubstitutionWithLlm(SWAP);
    assertEquals(result.instructions, [RECIPE[0], RECIPE[1], { step: 3, text: SWAPPED }, RECIPE[3]]);
    assertEquals(result.refused, undefined);
    assertEquals(result.usage?.costUsd, 0.00015);
  });
});

Deno.test('a rewrite that dropped steps comes back empty, with why and the cost of the call', async () => {
  await withModel([completion({ instructions: rewriteOf(RECIPE).slice(2) })], async () => {
    const result = await rewriteInstructionsForSubstitutionWithLlm(SWAP);
    assertEquals(result.instructions, []);
    assertEquals(result.refused, 'Rewrite has 2 steps, the recipe has 4');
    assertEquals(result.usage?.costUsd, 0.00015);
  });
});

Deno.test('an empty rewrite comes back empty with no reason', async () => {
  await withModel([completion({ instructions: [] })], async () => {
    const result = await rewriteInstructionsForSubstitutionWithLlm(SWAP);
    assertEquals(result.instructions, []);
    assertEquals(result.refused, undefined);
  });
});

Deno.test("the model is told to keep each step's language, whatever the recipe is labelled", async () => {
  await withModel([completion({ instructions: rewriteOf(RECIPE) })], async ({ calls }) => {
    await rewriteInstructionsForSubstitutionWithLlm({ ...SWAP, language: 'es' });
    const sent = JSON.stringify(calls[0]);
    assertStringIncludes(sent, 'The recipe is labelled Spanish. Keep every step in the language it is written in now');
  });
});
