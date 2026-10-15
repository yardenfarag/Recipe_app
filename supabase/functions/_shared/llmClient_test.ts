// npx deno test -A --no-lock supabase/functions/_shared/llmClient_test.ts
//
// The last test calls OpenRouter's public model list to prove every default
// slug still exists (a retired slug fails the whole request). It runs only
// when OPENROUTER_API_KEY is set; CI without a key skips it.

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import {
  defaultModelSlugs,
  generateLlmJson,
  partsToOpenRouterContent,
  resolveTaskModel,
  TASK_MODELS,
  unwrapTopLevelArray,
} from './llmClient.ts';

const OBJECT_SCHEMA = { type: 'object', properties: { title: { type: 'string' } } };

function withEnv(vars: Record<string, string | null>, fn: () => void | Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, Deno.env.get(key));
    if (value === null) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };
  try {
    const out = fn();
    if (out instanceof Promise) return out.finally(restore);
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

function stubFetch(handler: (body: Record<string, unknown>) => Response): { calls: Record<string, unknown>[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = ((_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push(body);
    return Promise.resolve(handler(body));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

function completion(content: string, extra: Record<string, unknown> = {}): Response {
  return Response.json({
    model: 'openai/gpt-6-luna',
    provider: 'OpenAI',
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150, cost: 0.00005 },
    ...extra,
  });
}

Deno.test('every kind has a primary model and live-looking fallbacks', () => {
  for (const [kind, config] of Object.entries(TASK_MODELS)) {
    assert(config.model.includes('/'), `${kind} primary should be an OpenRouter slug`);
    assert(!config.fallbacks.includes(config.model), `${kind} fallback repeats the primary`);
    for (const slug of config.fallbacks) assert(slug.includes('/'), `${kind} fallback ${slug}`);
  }
  assert(defaultModelSlugs().length >= 7);
});

Deno.test('photo tasks use Sonnet with low reasoning; text tasks use Luna with none', () => {
  assertEquals(resolveTaskModel('photo'), { model: 'anthropic/claude-sonnet-5.5', fallbacks: ['openai/gpt-6.1-sol'], reasoning: 'low' });
  assertEquals(resolveTaskModel('text'), { model: 'openai/gpt-6-luna', fallbacks: ['qwen/qwen3.8-flash'], reasoning: 'none' });
  assertEquals(resolveTaskModel('video').model, 'google/gemini-3.5-flash');
});

Deno.test('env overrides per kind: model, fallbacks, reasoning', () =>
  withEnv(
    {
      OPENROUTER_MODEL_TRANSLATE: 'openai/gpt-6-luna',
      OPENROUTER_FALLBACKS_TRANSLATE: 'qwen/qwen3.8-flash, openai/gpt-6-luna',
      OPENROUTER_REASONING_TRANSLATE: 'none',
    },
    () => {
      const config = resolveTaskModel('translate');
      assertEquals(config.model, 'openai/gpt-6-luna');
      // The primary is removed from the fallback list.
      assertEquals(config.fallbacks, ['qwen/qwen3.8-flash']);
      assertEquals(config.reasoning, 'none');
    },
  ));

Deno.test('OPENROUTER_FALLBACKS_<KIND>=none disables fallbacks', () =>
  withEnv({ OPENROUTER_FALLBACKS_TEXT: 'none' }, () => {
    assertEquals(resolveTaskModel('text').fallbacks, []);
  }));

Deno.test('unknown kinds fall back through the legacy tier', () => {
  assertEquals(resolveTaskModel('mystery', 'fast').model, TASK_MODELS.text.model);
  assertEquals(resolveTaskModel('mystery', 'standard').model, TASK_MODELS.photo.model);
});

Deno.test('a top-level array is unwrapped only when the schema wants an object', () => {
  assertEquals(unwrapTopLevelArray([{ title: 'Cake' }], OBJECT_SCHEMA), { title: 'Cake' });
  assertEquals(unwrapTopLevelArray({ title: 'Cake' }, OBJECT_SCHEMA), { title: 'Cake' });
  assertEquals(unwrapTopLevelArray([1, 2], { type: 'array' }), [1, 2]);
});

Deno.test('video parts become video_url: YouTube by URL, clips as data URLs', () => {
  const content = partsToOpenRouterContent([
    { fileData: { fileUri: 'https://www.youtube.com/watch?v=abc' } },
    { imageBase64: 'AAAA', mimeType: 'video/mp4' },
    { imageBase64: 'BBBB', mimeType: 'image/png' },
    { text: 'hi' },
  ]) as Array<Record<string, unknown>>;
  assertEquals(content[0], { type: 'video_url', video_url: { url: 'https://www.youtube.com/watch?v=abc' } });
  assertEquals(content[1], { type: 'video_url', video_url: { url: 'data:video/mp4;base64,AAAA' } });
  assertEquals(content[2], { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } });
});

Deno.test('request body carries the task model, fallbacks, reasoning and provider rules', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() => completion('{"title":"Cake"}'));
    try {
      const result = await generateLlmJson<{ title: string }>({
        kind: 'photo',
        systemPrompt: 'sys',
        parts: [{ imageBase64: 'AAAA', mimeType: 'image/jpeg' }, { text: 'go' }],
        responseSchema: OBJECT_SCHEMA,
        timeoutMs: 5_000,
        maxOutputTokens: 100,
        context: 'test',
      });
      const body = stub.calls[0];
      assertEquals(body.model, 'anthropic/claude-sonnet-5.5');
      assertEquals(body.models, ['openai/gpt-6.1-sol']);
      assertEquals(body.reasoning, { effort: 'low' });
      assertEquals(body.provider, {
        allow_fallbacks: true,
        data_collection: 'deny',
        require_parameters: true,
        ignore: ['azure'],
      });
      assertEquals(result.data, { title: 'Cake' });
      assertEquals(result.costUsd, 0.00005);
      assertEquals(result.usage.costUsd, 0.00005);
      assertEquals(result.model, 'openai/gpt-6-luna');
    } finally {
      stub.restore();
    }
  }));

Deno.test('text tasks send no provider ignore list', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() => completion('{"title":"Soup"}'));
    try {
      await generateLlmJson({
        kind: 'translate',
        systemPrompt: 'sys',
        parts: [{ text: 'go' }],
        responseSchema: OBJECT_SCHEMA,
        timeoutMs: 5_000,
        maxOutputTokens: 100,
        context: 'test',
      });
      const provider = stub.calls[0].provider as Record<string, unknown>;
      assertEquals(provider.ignore, undefined);
      assertEquals(stub.calls[0].model, 'openai/gpt-6.1-sol');
    } finally {
      stub.restore();
    }
  }));

Deno.test('an array-wrapped answer (Qwen) is accepted', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() => completion('[{"title":"Wrapped"}]'));
    try {
      const result = await generateLlmJson<{ title: string }>({
        kind: 'video',
        systemPrompt: 'sys',
        parts: [{ imageBase64: 'AAAA', mimeType: 'video/mp4' }],
        responseSchema: OBJECT_SCHEMA,
        timeoutMs: 5_000,
        maxOutputTokens: 100,
        context: 'test',
      });
      assertEquals(result.data, { title: 'Wrapped' });
    } finally {
      stub.restore();
    }
  }));

Deno.test('a refusal with empty content throws a clear error', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() =>
      Response.json({
        model: 'anthropic/claude-sonnet-5.5',
        choices: [{ message: { content: '' }, finish_reason: 'stop', native_finish_reason: 'refusal' }],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      }),
    );
    try {
      await assertRejects(
        () =>
          generateLlmJson({
            kind: 'invent_text',
            systemPrompt: 'sys',
            parts: [{ text: 'go' }],
            responseSchema: OBJECT_SCHEMA,
            timeoutMs: 5_000,
            maxOutputTokens: 100,
            context: 'test',
          }),
        Error,
        'OpenRouter returned no content',
      );
    } finally {
      stub.restore();
    }
  }));

Deno.test('without an OpenRouter key the call fails fast', () =>
  withEnv({ OPENROUTER_API_KEY: null, OPEN_ROUTER_API_KEY: null }, async () => {
    await assertRejects(
      () =>
        generateLlmJson({
          kind: 'text',
          systemPrompt: 'sys',
          parts: [{ text: 'go' }],
          responseSchema: OBJECT_SCHEMA,
          timeoutMs: 5_000,
          maxOutputTokens: 100,
          context: 'test',
        }),
      Error,
      'OPENROUTER_API_KEY is not configured',
    );
  }));

Deno.test({
  name: 'live: every default slug exists on OpenRouter',
  ignore: !Deno.env.get('OPENROUTER_API_KEY'),
  async fn() {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}` },
    });
    assert(res.ok, `models endpoint ${res.status}`);
    const { data } = (await res.json()) as { data: { id: string }[] };
    const live = new Set(data.map((m) => m.id));
    const missing = defaultModelSlugs().filter((slug) => !live.has(slug));
    assertEquals(missing, [], `retired or unknown slugs: ${missing.join(', ')}`);
  },
});
