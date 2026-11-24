// npx deno test -A --no-lock supabase/functions/_shared/recipes/recipeVariant_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { completion, STEAK, withModel } from '../testing/applianceModelStub.ts';
import { remixedSteps, transformRecipeWithLlm } from './recipeVariant.ts';

Deno.test('remixedSteps numbers the steps 1, 2, 3 whatever the model numbered them', () => {
  const steps = [
    { step: 2, text: 'Press the tofu.' },
    { text: 'Sear it in a hot pan.' },
    { step: Number.NaN, text: 'Rest and slice.' },
  ];
  assertEquals(remixedSteps(steps), [
    { step: 1, text: 'Press the tofu.' },
    { step: 2, text: 'Sear it in a hot pan.' },
    { step: 3, text: 'Rest and slice.' },
  ]);
});

Deno.test('remixedSteps drops blank steps', () => {
  assertEquals(remixedSteps([{ step: 1, text: '  ' }, { step: 2 }, { step: 3, text: 'Rest and slice.' }]), [
    { step: 1, text: 'Rest and slice.' },
  ]);
  assertEquals(remixedSteps(undefined), []);
});

// PIN-186: transform-recipe refuses this answer; it used to be saved over the recipe's steps.
Deno.test('a remix that came back with ingredients and no usable steps has no steps', async () => {
  const answer = {
    ingredients: [{ name: 'firm tofu', quantity: 400, unit: 'g' }],
    instructions: [{ step: 1, text: '' }],
    servings: 2,
    summary: 'Swapped the steak for tofu.',
  };
  await withModel([completion(answer)], async () => {
    const remixed = await transformRecipeWithLlm({ variant: 'vegan', servings: 2, ...STEAK });
    assertEquals(remixed.ingredients.length, 1);
    assertEquals(remixed.instructions, []);
  });
});
