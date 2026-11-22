// npx deno test -A --no-lock supabase/functions/_shared/recipeEstimates_test.ts

import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { estimateRecipeFields, estimateRecipeNutrition } from './recipeEstimates.ts';

const brownies = {
  title: 'Brown Butter Brownie',
  servings: 1,
  ingredients: [
    { name: 'butter', quantity: 120, unit: 'g' },
    { name: 'carrot', quantity: 10_000, unit: 'g' },
  ],
  instructions: [{ step: 1, text: 'Brown the butter, mix and bake.' }],
  fields: ['calories' as const, 'estimated_time_minutes' as const, 'effort_level' as const],
  amountRows: [],
};

async function withModel(answer: Record<string, unknown> | Response, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  const key = Deno.env.get('OPENROUTER_API_KEY');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  globalThis.fetch = (() =>
    Promise.resolve(
      answer instanceof Response
        ? answer
        : Response.json({
          model: 'openai/gpt-6-luna',
          choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.00001 },
        }),
    )) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
    if (key === undefined) Deno.env.delete('OPENROUTER_API_KEY');
    else Deno.env.set('OPENROUTER_API_KEY', key);
  }
}

Deno.test('an estimate in range is kept', async () => {
  await withModel(
    { calories_reasoning: 'r', calories: 5_300, time_reasoning: 't', estimated_time_minutes: 60, effort_level: 'Easy' },
    async () => {
      const { values } = await estimateRecipeFields(brownies);
      assertEquals(values.calories?.calories, 5_300);
      assertEquals(values.estimated_time_minutes?.minutes, 60);
      assertEquals(values.effort_level, 'Easy');
    },
  );
});

// 10 kg of carrots in a brownie: the model answers, but past the 10,000 kcal limit. That is a
// result (unknown), not a failure, so the field is settled and never retried in a loop.
Deno.test('an estimate outside the database range settles as unknown, not as a failure', async () => {
  await withModel(
    { calories_reasoning: 'r', calories: 42_000, time_reasoning: 't', estimated_time_minutes: 0, effort_level: 'Easy' },
    async () => {
      const { values } = await estimateRecipeFields(brownies);
      assertEquals(values.calories, { calories: null, reasoning: 'r', nutrition: null });
      assertEquals(values.estimated_time_minutes, { minutes: null, reasoning: 't' });
    },
  );
});

Deno.test('a requested estimate the model left out settles as unknown', async () => {
  await withModel({ effort_level: 'Medium' }, async () => {
    const { values } = await estimateRecipeFields(brownies);
    assertEquals(values.calories?.calories, null);
    assertEquals(values.estimated_time_minutes?.minutes, null);
  });
});

Deno.test('a failed call settles nothing, so the fields stay pending for a retry', async () => {
  await withModel(new Response('upstream down', { status: 500 }), async () => {
    await assertRejects(() => estimateRecipeFields(brownies));
  });
});

// PIN-80: macros ride on the calorie estimate.
Deno.test('macros that fit the calories come back with them', async () => {
  await withModel(
    { calories_reasoning: 'r', calories: 2_000, protein_g: 30, carbs_g: 220, fat_g: 110, effort_level: 'Easy' },
    async () => {
      const { values } = await estimateRecipeFields(brownies);
      assertEquals(values.calories, { calories: 2_000, reasoning: 'r', nutrition: { protein_g: 30, carbs_g: 220, fat_g: 110 } });
    },
  );
});

Deno.test('macros that do not fit, or are left out, never fail the calorie estimate', async () => {
  await withModel({ calories_reasoning: 'r', calories: 2_000, protein_g: 5, carbs_g: 5, fat_g: 5 }, async () => {
    const { values } = await estimateRecipeFields(brownies);
    assertEquals(values.calories, { calories: 2_000, reasoning: 'r', nutrition: null });
  });
  await withModel({ calories_reasoning: 'r', calories: 2_000 }, async () => {
    const { values } = await estimateRecipeFields(brownies);
    assertEquals(values.calories?.nutrition, null);
  });
});

Deno.test('the macros backfill keeps a split that fits the stored calories', async () => {
  const input = { ...brownies, calories: 2_000 };
  await withModel({ protein_g: 30, carbs_g: 220, fat_g: 110 }, async () => {
    assertEquals((await estimateRecipeNutrition(input)).nutrition, { protein_g: 30, carbs_g: 220, fat_g: 110 });
  });
  await withModel({ protein_g: 300, carbs_g: 220, fat_g: 110 }, async () => {
    assertEquals((await estimateRecipeNutrition(input)).nutrition, null);
  });
});
