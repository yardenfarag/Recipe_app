// npx deno test -A --no-lock supabase/functions/_shared/llm/imageClient_test.ts
//
// OpenRouter's image API: the request, the fallback model, and what stops the attempts.

import { assertEquals } from 'jsr:@std/assert@1';

import { generateImage, type ImageModelConfig, resolveImageModels, sniffMediaType } from './imageClient.ts';

const MODELS: ImageModelConfig[] = [
  { model: 'first/model', params: { resolution: '1K' } },
  { model: 'second/model', params: { output_format: 'jpeg' } },
];
const PNG_B64 = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 1, 2, 3));

async function withKey<T>(fn: () => Promise<T>): Promise<T> {
  const previous = Deno.env.get('OPENROUTER_API_KEY');
  Deno.env.set('OPENROUTER_API_KEY', 'test-key');
  try {
    return await fn();
  } finally {
    if (previous === undefined) Deno.env.delete('OPENROUTER_API_KEY');
    else Deno.env.set('OPENROUTER_API_KEY', previous);
  }
}

/** Answers each call with the next response, and records the request bodies. */
function scripted(responses: Array<{ status: number; body: unknown }>, bodies: Record<string, unknown>[]): typeof fetch {
  return ((_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const next = responses.shift()!;
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
  }) as typeof fetch;
}

Deno.test('the first model that answers with a picture wins; a failing one falls through to the next', async () => {
  const bodies: Record<string, unknown>[] = [];
  const result = await withKey(() =>
    generateImage({
      kind: 'recipe_image',
      prompt: 'a soup',
      models: MODELS,
      fetchImpl: scripted([
        { status: 500, body: { error: { message: 'upstream' } } },
        { status: 200, body: { data: [{ b64_json: PNG_B64, media_type: 'image/png' }], usage: { cost: 0.018 } } },
      ], bodies),
    })
  );
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals([result.image.model, result.image.mediaType, result.image.costUsd], ['second/model', 'image/png', 0.018]);
  assertEquals(result.image.bytes.length, 7);
  assertEquals(bodies.map((body) => body.model), ['first/model', 'second/model']);
  assertEquals(bodies[0], { model: 'first/model', prompt: 'a soup', n: 1, aspect_ratio: '4:3', resolution: '1K' });
  assertEquals(result.attempts.map((attempt) => attempt.status), [500, 200]);
});

Deno.test('out of credit stops at once; no key means no call', async () => {
  const bodies: Record<string, unknown>[] = [];
  const broke = await withKey(() =>
    generateImage({
      kind: 'recipe_image',
      prompt: 'a soup',
      models: MODELS,
      fetchImpl: scripted([{ status: 402, body: { error: { message: 'Insufficient credits' } } }], bodies),
    })
  );
  assertEquals([broke.ok, bodies.length], [false, 1]);

  const previous = Deno.env.get('OPENROUTER_API_KEY');
  const previousAlt = Deno.env.get('OPEN_ROUTER_API_KEY');
  Deno.env.delete('OPENROUTER_API_KEY');
  Deno.env.delete('OPEN_ROUTER_API_KEY');
  try {
    const noKey = await generateImage({
      kind: 'recipe_image',
      prompt: 'a soup',
      models: MODELS,
      fetchImpl: () => {
        throw new Error('no call without a key');
      },
    });
    assertEquals(noKey.ok, false);
  } finally {
    if (previous !== undefined) Deno.env.set('OPENROUTER_API_KEY', previous);
    if (previousAlt !== undefined) Deno.env.set('OPEN_ROUTER_API_KEY', previousAlt);
  }
});

Deno.test('a 200 without a picture counts as a failure of that model', async () => {
  const bodies: Record<string, unknown>[] = [];
  const result = await withKey(() =>
    generateImage({
      kind: 'recipe_image',
      prompt: 'a soup',
      models: MODELS,
      fetchImpl: scripted([{ status: 200, body: { data: [] } }, { status: 200, body: { data: [] } }], bodies),
    })
  );
  assertEquals([result.ok, bodies.length], [false, 2]);
});

Deno.test('the model list follows the env overrides (ADR 015)', () => {
  const keys = ['OPENROUTER_MODEL_RECIPE_IMAGE', 'OPENROUTER_FALLBACKS_RECIPE_IMAGE'];
  const saved = keys.map((key) => Deno.env.get(key));
  try {
    keys.forEach((key) => Deno.env.delete(key));
    assertEquals(resolveImageModels('recipe_image').map((m) => m.model), [
      'qwen/qwen-image-2.1-turbo',
      'bytedance-seed/seedream-5-0-flash',
    ]);

    Deno.env.set('OPENROUTER_MODEL_RECIPE_IMAGE', 'bytedance-seed/seedream-5-0-flash');
    Deno.env.set('OPENROUTER_FALLBACKS_RECIPE_IMAGE', 'none');
    const only = resolveImageModels('recipe_image');
    assertEquals(only.map((m) => m.model), ['bytedance-seed/seedream-5-0-flash']);
    // A known model keeps its own request fields.
    assertEquals(only[0].params, { resolution: '1K', output_format: 'jpeg' });

    Deno.env.set('OPENROUTER_FALLBACKS_RECIPE_IMAGE', 'x/new-model, bytedance-seed/seedream-5-0-flash');
    assertEquals(resolveImageModels('recipe_image').map((m) => [m.model, m.params]), [
      ['bytedance-seed/seedream-5-0-flash', { resolution: '1K', output_format: 'jpeg' }],
      ['x/new-model', {}],
    ]);
  } finally {
    keys.forEach((key, i) => (saved[i] === undefined ? Deno.env.delete(key) : Deno.env.set(key, saved[i]!)));
  }
});

Deno.test('the picture type is read from its bytes when the provider leaves it out', () => {
  assertEquals(sniffMediaType(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), 'image/png');
  assertEquals(sniffMediaType(new Uint8Array([0xff, 0xd8, 0xff])), 'image/jpeg');
  assertEquals(sniffMediaType(new Uint8Array([1, 2, 3])), 'application/octet-stream');
});
