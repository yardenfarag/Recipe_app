// npx deno test -A --no-lock supabase/functions/_shared/recipes/inventRecipe_test.ts

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import { clarificationFacts, inventRecipeFromImage } from './inventRecipe.ts';

type SentBody = { messages: { role: string; content: unknown }[] };

/** Answers every model call with an empty recipe and records the request bodies sent. */
async function withModel(fn: (sent: SentBody[]) => Promise<void>) {
  const original = globalThis.fetch;
  const key = Deno.env.get('OPENROUTER_API_KEY');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  const sent: SentBody[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    const recipe = { found_recipe: false, source_language: 'en', title: '', servings: 0, ingredients: [], instructions: [] };
    return Promise.resolve(
      Response.json({
        model: 'google/gemini-test',
        choices: [{ message: { content: JSON.stringify(recipe) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.00001 },
      }),
    );
  }) as typeof fetch;
  try {
    await fn(sent);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) Deno.env.delete('OPENROUTER_API_KEY');
    else Deno.env.set('OPENROUTER_API_KEY', key);
  }
}

/** The text part of the user message. */
function userText(body: SentBody): string {
  const user = body.messages.find((m) => m.role === 'user')?.content;
  const parts = Array.isArray(user) ? user : [];
  return parts.map((p: { type?: string; text?: string }) => (p.type === 'text' ? p.text : '')).join('');
}

const PHOTO = { imageBase64: 'aGVsbG8=', mimeType: 'image/jpeg', language: 'en' };

Deno.test('clarificationFacts is empty without answers', () => {
  assertEquals(clarificationFacts([]), '');
  assertEquals(clarificationFacts([{ question: '  ', answer: 'Fish', other: false }]), '');
});

Deno.test('clarificationFacts quotes each answer as data', () => {
  const text = clarificationFacts([
    { question: "What's the protein?", answer: 'Fish', other: false },
    { question: 'How is it cooked?', answer: 'on the "grill"', other: true },
  ]);
  assert(text.includes('Treat the answers as facts about the dish'));
  assert(text.includes(`- question: "What's the protein?" answer: "Fish"`));
  assert(text.includes(String.raw`answer: "on the \"grill\""`));
});

Deno.test('clarificationFacts cuts a long typed answer before it reaches the prompt', () => {
  const text = clarificationFacts([{ question: 'Protein?', answer: 'x'.repeat(500), other: true }]);
  assert(text.includes(`"${'x'.repeat(60)}"`));
  assertFalse(text.includes('x'.repeat(61)));
});

Deno.test('without answers the photo prompt is exactly as before', async () => {
  await withModel(async (sent) => {
    await inventRecipeFromImage(PHOTO);
    await inventRecipeFromImage({ ...PHOTO, clarifications: [] });
    const before = 'Write title, ingredients, and instructions in language code "en".\nIdentify the dish in this photo and write a complete home-cook recipe.';
    assertEquals(userText(sent[0]), before);
    assertEquals(userText(sent[1]), before);
  });
});

Deno.test('with answers the photo prompt carries them', async () => {
  await withModel(async (sent) => {
    await inventRecipeFromImage({ ...PHOTO, clarifications: [{ question: "What's the protein?", answer: 'Fish', other: false }] });
    const text = userText(sent[0]);
    assert(text.startsWith('Write title, ingredients, and instructions in language code "en".'));
    assert(text.includes(`answer: "Fish"`));
  });
});
