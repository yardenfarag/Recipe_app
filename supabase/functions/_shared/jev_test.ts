// npx deno test -A --no-lock supabase/functions/_shared/jev_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import type { ExtractInput } from './gemini.ts';
import { appliedExtractRoute, decideExtractRoute, shouldRunExtractGate, skipsTextStep } from './jev.ts';

const post: ExtractInput = {
  platform: 'instagram',
  sourceUrl: 'https://www.instagram.com/reel/abc/',
  videoUrl: 'https://cdn.example.com/v.mp4',
  durationSeconds: 45,
  description: 'Best brownies ever 🍫',
  topComments: [],
};

function stubFetch(respond: () => Response | Promise<Response>): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(respond())) as typeof fetch;
  Deno.env.set('OPENROUTER_API_KEY', 'test');
  return () => {
    globalThis.fetch = original;
  };
}

function routeResponse(choice: string, confidence: number): Response {
  return Response.json({
    model: 'typesafe/jev-1.13-20260917',
    answers: { route: { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } } },
    usage: { input_tokens: 400, output_tokens: 40, cost: 0.00002 },
  });
}

Deno.test('gate runs only on social posts with text', () => {
  assertEquals(shouldRunExtractGate(post), true);
  assertEquals(shouldRunExtractGate({ ...post, platform: 'web' }), false);
  assertEquals(shouldRunExtractGate({ ...post, description: '  ' }), false);
});

Deno.test('a confident route is applied', async () => {
  const restore = stubFetch(() => routeResponse('needs_video', 0.88));
  try {
    const decision = await decideExtractRoute(post);
    assertEquals(appliedExtractRoute(decision), 'needs_video');
    assertEquals(decision.ok && decision.costUsd, 0.00002);
  } finally {
    restore();
  }
});

Deno.test('a low-confidence route falls back to the ladder', async () => {
  const restore = stubFetch(() => routeResponse('full_recipe_in_text', 0.72));
  try {
    const decision = await decideExtractRoute(post);
    assertEquals(decision.ok && decision.route, 'full_recipe_in_text');
    assertEquals(appliedExtractRoute(decision), null);
  } finally {
    restore();
  }
});

Deno.test('errors and unknown routes fail open', async () => {
  for (const respond of [
    () => new Response('upstream down', { status: 502 }),
    () => routeResponse('something_else', 1),
  ]) {
    const restore = stubFetch(respond);
    try {
      const decision = await decideExtractRoute(post);
      assertEquals(decision.ok, false);
      assertEquals(appliedExtractRoute(decision), null);
    } finally {
      restore();
    }
  }
});

Deno.test('needs_video skips text only when the video can be watched', () => {
  assertEquals(skipsTextStep('needs_video', post), true);
  assertEquals(skipsTextStep('needs_video', { ...post, videoUrl: undefined }), false);
  assertEquals(skipsTextStep('needs_video', { ...post, durationSeconds: 60 * 60 }), false);
  assertEquals(skipsTextStep('partial', post), false);
  assertEquals(skipsTextStep(null, post), false);
});
