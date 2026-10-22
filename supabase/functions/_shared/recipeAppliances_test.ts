// npx deno test -A --no-lock supabase/functions/_shared/recipeAppliances_test.ts
//
// Every test stubs fetch, so no model is called and no API key is needed.

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import {
  buildAppliancesSchema,
  buildAppliancesSystemPrompt,
  buildAppliancesUserText,
  deriveRecipeAppliances,
  numberedSteps,
  unmatchedApplianceNames,
} from './recipeAppliances.ts';

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

type Stub = { calls: Record<string, unknown>[]; restore: () => void };

function stubFetch(handler: () => Response): Stub {
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return Promise.resolve(handler());
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

function completion(data: unknown): Response {
  return Response.json({
    model: 'openai/gpt-6-luna',
    choices: [{ message: { content: typeof data === 'string' ? data : JSON.stringify(data) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 900, completion_tokens: 120, total_tokens: 1020, cost: 0.00015 },
  });
}

async function withStub(handler: () => Response, fn: (stub: Stub) => Promise<void>) {
  const previousKey = Deno.env.get('OPENROUTER_API_KEY');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  const stub = stubFetch(handler);
  try {
    await fn(stub);
  } finally {
    stub.restore();
    if (previousKey === undefined) Deno.env.delete('OPENROUTER_API_KEY');
    else Deno.env.set('OPENROUTER_API_KEY', previousKey);
  }
}

Deno.test('cleans the model answer against the catalog and the real steps', () =>
  withStub(
    () =>
      completion({
        appliances: [
          { key: 'oven', required: true, steps: [1, 2], origin: 'source' },
          { key: 'blender', required: true, alternative: 'immersion_blender', steps: [3], origin: 'source' },
          { key: 'pasta_machine', required: true, steps: [2], origin: 'source' },
          { key: 'stand_mixer', required: false, benefit: 'less_effort', steps: [9], origin: 'source' },
        ],
        unlisted: [],
      }),
    async ({ calls }) => {
      const result = await deriveRecipeAppliances(SOUP, { tipsEnabled: false });
      assertEquals(result.appliances, [
        { key: 'oven', required: true, steps: [1, 2], origin: 'source' },
        { key: 'blender', required: true, alternative: 'immersion_blender', steps: [3], origin: 'source' },
      ]);
      assertEquals(result.usage?.kind, 'appliances');
      assertEquals(result.error, undefined);
      assertEquals(calls.length, 1);
      assertEquals(calls[0].model, 'openai/gpt-6-luna');
    },
  ));

Deno.test('an empty answer means analysed and needs nothing', () =>
  withStub(
    () => completion({ appliances: [], unlisted: [] }),
    async () => {
      assertEquals((await deriveRecipeAppliances(SOUP, { tipsEnabled: false })).appliances, []);
    },
  ));

Deno.test('a recipe with no steps is not sent to the model', () =>
  withStub(
    () => completion({ appliances: [], unlisted: [] }),
    async ({ calls }) => {
      const result = await deriveRecipeAppliances({ ...SOUP, instructions: [] });
      assertEquals(result, { appliances: null, unmatched: [], usage: null });
      assertEquals(calls.length, 0);
    },
  ));

Deno.test('a provider error gives not analysed and never throws', () =>
  withStub(
    () => new Response('upstream exploded', { status: 500 }),
    async () => {
      const result = await deriveRecipeAppliances(SOUP, { tipsEnabled: false, timeoutMs: 2_000 });
      assertEquals(result.appliances, null);
      assertEquals(result.usage, null);
      assert(result.error, 'the error is reported for logging');
    },
  ));

Deno.test('unparseable output gives not analysed', () =>
  withStub(
    () => completion('the oven, I think'),
    async () => {
      assertEquals((await deriveRecipeAppliances(SOUP, { tipsEnabled: false })).appliances, null);
    },
  ));

Deno.test('a missing API key gives not analysed', async () => {
  const previous = Deno.env.get('OPENROUTER_API_KEY');
  const previousAlt = Deno.env.get('OPEN_ROUTER_API_KEY');
  Deno.env.delete('OPENROUTER_API_KEY');
  Deno.env.delete('OPEN_ROUTER_API_KEY');
  try {
    const result = await deriveRecipeAppliances(SOUP, { tipsEnabled: false });
    assertEquals(result.appliances, null);
    assert(result.error);
  } finally {
    if (previous !== undefined) Deno.env.set('OPENROUTER_API_KEY', previous);
    if (previousAlt !== undefined) Deno.env.set('OPEN_ROUTER_API_KEY', previousAlt);
  }
});

Deno.test('tips are dropped while tips are off, kept when on', async () => {
  const answer = {
    appliances: [
      { key: 'oven', required: true, steps: [2], origin: 'source' },
      { key: 'kitchen_thermometer', required: false, benefit: 'more_precise', steps: [2], origin: 'tip' },
    ],
    unlisted: [],
  };
  await withStub(
    () => completion(answer),
    async () => {
      const off = await deriveRecipeAppliances(SOUP, { tipsEnabled: false });
      assertEquals(off.appliances?.map((a) => a.key), ['oven']);
      const on = await deriveRecipeAppliances(SOUP, { tipsEnabled: true });
      assertEquals(on.appliances?.map((a) => a.key), ['oven', 'kitchen_thermometer']);
    },
  );
});

Deno.test('tips are off unless APPLIANCE_TIPS_ENABLED=true', () =>
  withStub(
    () => completion({ appliances: [], unlisted: [] }),
    async ({ calls }) => {
      Deno.env.delete('APPLIANCE_TIPS_ENABLED');
      await deriveRecipeAppliances(SOUP);
      const schema = JSON.stringify((calls[0].response_format as Record<string, unknown>) ?? {});
      assertFalse(schema.includes('"tip"'), 'the schema does not offer tips');
    },
  ));

Deno.test('reports equipment with no catalog key, once each', () =>
  withStub(
    () => completion({ appliances: [], unlisted: ['Pasta machine', 'pasta machine', 'KitchenAid', '', 7] }),
    async () => {
      assertEquals((await deriveRecipeAppliances(SOUP, { tipsEnabled: false })).unmatched, ['pasta machine']);
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
