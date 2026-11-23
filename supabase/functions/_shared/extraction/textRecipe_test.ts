// npx -y deno@2 test -A --no-lock --config supabase/functions/deno.json supabase/functions/_shared/extraction/textRecipe_test.ts
//
// Import a recipe someone wrote out as text (ADR 032): the bounds, the food check's answer, and the text read.

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { FetchError } from '../core/errors.ts';
import { buildMessageContext, type LlmRecipe } from './recipeExtraction.ts';
import {
  extractRecipeFromText,
  MAX_RECIPE_TEXT_CHARS,
  MIN_RECIPE_TEXT_CHARS,
  readRecipeText,
  TEXT_RECIPE_ORIGIN,
  textGateInput,
  textGateOutcome,
  textMetadata,
  textRejectMessage,
} from './textRecipe.ts';

const MESSAGE = `Grandma's shakshuka 🍳
2 tbsp olive oil, 1 onion, 2 peppers, 4 tomatoes, 4 eggs, salt, cumin
Fry the onion and peppers, add the tomatoes and cook 10 min. Make 4 wells, crack in the eggs, cover 6 min.`;

function recipe(overrides: Partial<LlmRecipe> = {}): LlmRecipe {
  return {
    found_recipe: true,
    source_language: 'en',
    title: 'Shakshuka',
    servings: 2,
    ingredients: [{ name: 'eggs', quantity: 4, unit: '' }],
    instructions: [{ step: 1, text: 'Fry the onion.' }],
    ...overrides,
  };
}

Deno.test('readRecipeText: no text is not a text import', () => {
  assertEquals(readRecipeText(undefined), null);
  assertEquals(readRecipeText(null), null);
  assertEquals(readRecipeText(42), null);
  assertEquals(readRecipeText({ text: MESSAGE }), null);
});

Deno.test('readRecipeText trims, then keeps a text within the bounds', () => {
  assertEquals(readRecipeText(`  \n${MESSAGE}\n `), { ok: true, text: MESSAGE });
  assertEquals(readRecipeText('x'.repeat(MIN_RECIPE_TEXT_CHARS)), { ok: true, text: 'x'.repeat(MIN_RECIPE_TEXT_CHARS) });
  assertEquals(readRecipeText('x'.repeat(MAX_RECIPE_TEXT_CHARS))?.ok, true);
});

Deno.test('readRecipeText turns away a text too short or too long', () => {
  assertEquals(readRecipeText(''), { ok: false, code: 'text_too_short' });
  // Whitespace doesn't count towards the minimum.
  assertEquals(readRecipeText(`  ${'x'.repeat(MIN_RECIPE_TEXT_CHARS - 1)}      `), { ok: false, code: 'text_too_short' });
  assertEquals(readRecipeText('Lasagna recipe pls 🙏'), { ok: false, code: 'text_too_short' });
  assertEquals(readRecipeText('x'.repeat(MAX_RECIPE_TEXT_CHARS + 1)), { ok: false, code: 'text_too_long' });
});

Deno.test('every reject code has words', () => {
  assert(textRejectMessage('text_too_short').length > 0);
  assert(textRejectMessage('text_too_long').includes('20,000'));
});

Deno.test('the food check reads the text alone, with no picture to fetch', () => {
  assertEquals(textGateInput(MESSAGE), { description: MESSAGE });
});

Deno.test("the food check's answer for a text", () => {
  assertEquals(textGateOutcome('written_recipe', false), 'extract');
  assertEquals(textGateOutcome('mixed', false), 'extract');
  assertEquals(textGateOutcome('unrelated', false), 'not_food');
  assertEquals(textGateOutcome('plated_dish', false), 'no_recipe');
  // "Read it anyway" reads food talk, but never something that isn't food.
  assertEquals(textGateOutcome('plated_dish', true), 'extract');
  assertEquals(textGateOutcome('unrelated', true), 'not_food');
});

Deno.test('a written recipe is saved with no platform, as written', () => {
  assertEquals(TEXT_RECIPE_ORIGIN, { platform: 'unknown', extraction_source: 'manual' });
});

Deno.test('textMetadata logs the size, never the text', () => {
  assertEquals(textMetadata(null), {});
  assertEquals(textMetadata(MESSAGE), { input: 'text', text_chars: MESSAGE.length });
});

Deno.test('the model reads the message under its own heading', () => {
  const context = buildMessageContext(MESSAGE);
  assert(context.startsWith('Extract the recipe from the sources below.'));
  assert(context.includes('--- MESSAGE FROM A GROUP CHAT ---'));
  assert(context.endsWith(MESSAGE));
});

Deno.test('extractRecipeFromText returns what the model read, with its usage', async () => {
  const seen: Array<{ text: string; timeoutMs: number }> = [];
  const usage = { model: 'm', promptTokens: 10, completionTokens: 20 } as never;
  const result = await extractRecipeFromText({ text: MESSAGE }, (text, timeoutMs) => {
    seen.push({ text, timeoutMs });
    return Promise.resolve({ recipe: recipe(), usage });
  });
  assertEquals(result, { recipe: recipe(), usages: [usage] });
  assertEquals(seen, [{ text: MESSAGE, timeoutMs: 35_000 }]);
});

Deno.test('extractRecipeFromText shrinks the timeout to the deadline', async () => {
  let timeout = 0;
  await extractRecipeFromText({ text: MESSAGE, deadlineAt: Date.now() + 20_000 }, (_text, timeoutMs) => {
    timeout = timeoutMs;
    return Promise.resolve({ recipe: recipe(), usage: null });
  });
  assert(timeout > 18_000 && timeout <= 20_000, `timeout ${timeout}`);
});

Deno.test('extractRecipeFromText: too little time left is a timeout, and the model is never called', async () => {
  let called = false;
  const result = await extractRecipeFromText({ text: MESSAGE, deadlineAt: Date.now() + 2_000 }, () => {
    called = true;
    return Promise.resolve({ recipe: recipe(), usage: null });
  });
  assertEquals(called, false);
  assertEquals(result.timedOut, true);
  assertEquals(result.recipe.found_recipe, false);
  assertEquals(result.usages, []);
});

Deno.test('extractRecipeFromText: a model timeout comes back as timedOut', async () => {
  const result = await extractRecipeFromText({ text: MESSAGE }, () => {
    throw new FetchError('llmClient.ts', 'OpenRouter request failed (timedOut=true)');
  });
  assertEquals(result.timedOut, true);
  assertEquals(result.recipe.found_recipe, false);
});

Deno.test('extractRecipeFromText: any other model error is thrown (the credit is refunded by the caller)', async () => {
  await assertRejects(
    () =>
      extractRecipeFromText({ text: MESSAGE }, () => {
        throw new FetchError('llmClient.ts', 'OpenRouter 402');
      }),
    FetchError,
    'OpenRouter 402',
  );
});
