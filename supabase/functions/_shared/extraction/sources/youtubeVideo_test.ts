// npx deno test -A --no-lock supabase/functions/_shared/extraction/sources/youtubeVideo_test.ts
//
// YouTube imports reach the model's video step (PIN-103): the watch URL, the length
// it depends on, and the rule that an unknown or over-limit length keeps the video out.

import { assert, assertEquals } from 'jsr:@std/assert@1';

import { extractRecipeWithLadder, type ExtractInput } from '../recipeExtraction.ts';
import { skipsTextStep } from '../../llm/jev.ts';
import { extractYouTubeId } from '../platform.ts';
import { isVideoTooLong, parseDurationSeconds, parseYouTubeIsoDuration } from '../videoLimits.ts';
import { fetchYouTubeMeta, youTubeVideoUrlForModel } from './youtube.ts';

const ID = 'dQw4w9WgXcQ';
const WATCH_URL = `https://www.youtube.com/watch?v=${ID}`;

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Replaces fetch for one test; records each call's URL and JSON body. */
function stubFetch(route: Route): { calls: { url: string; body: any }[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: { url: string; body: any }[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    let body: unknown = null;
    try {
      body = init?.body ? JSON.parse(String(init.body)) : null;
    } catch {
      body = null;
    }
    calls.push({ url, body });
    return Promise.resolve(route(url, init));
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

async function withEnv(vars: Record<string, string | null>, fn: () => Promise<void>) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, Deno.env.get(key));
    if (value === null) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

function completion(recipe: Record<string, unknown>): Response {
  return Response.json({
    model: 'google/gemini-3.5-flash',
    choices: [{ message: { content: JSON.stringify(recipe) }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost: 0.0001 },
  });
}

// Title and steps but no ingredients: partial, so the ladder goes on to the video.
const PARTIAL = {
  found_recipe: true,
  source_language: 'en',
  title: 'Tomato soup',
  servings: 2,
  ingredients: [],
  instructions: [{ step: 1, text: 'Simmer the tomatoes.' }],
};

const VIDEO_RECIPE = {
  ...PARTIAL,
  instructions: [
    { step: 1, text: 'Simmer the tomatoes.' },
    { step: 2, text: 'Blend until smooth.' },
  ],
};

function youtubeInput(overrides: Partial<ExtractInput> = {}): ExtractInput {
  return {
    platform: 'youtube',
    sourceUrl: WATCH_URL,
    videoUrl: WATCH_URL,
    durationSeconds: 300,
    description: 'Tomato soup. Simmer the tomatoes.',
    topComments: [],
    ...overrides,
  };
}

Deno.test('normal videos and Shorts get the same canonical watch URL', () => {
  const fromWatch = extractYouTubeId(`https://www.youtube.com/watch?v=${ID}&t=42s`)!;
  const fromShorts = extractYouTubeId(`https://youtube.com/shorts/${ID}?feature=share`)!;
  const fromShortLink = extractYouTubeId(`https://youtu.be/${ID}`)!;
  assertEquals(youTubeVideoUrlForModel(fromWatch, 300), WATCH_URL);
  assertEquals(youTubeVideoUrlForModel(fromShorts, 45), WATCH_URL);
  assertEquals(youTubeVideoUrlForModel(fromShortLink, 45), WATCH_URL);
});

Deno.test('an unknown length keeps the YouTube video away from the model', () => {
  assertEquals(youTubeVideoUrlForModel(ID, undefined), undefined);
  assertEquals(youTubeVideoUrlForModel(ID, Number.NaN), undefined);
  assertEquals(youTubeVideoUrlForModel(ID, 0), undefined);
});

Deno.test('YouTube durations parse from the Data API and the player', () => {
  assertEquals(parseYouTubeIsoDuration('PT45S'), 45);
  assertEquals(parseYouTubeIsoDuration('PT12M'), 720);
  assertEquals(parseYouTubeIsoDuration('PT12M1S'), 721);
  assertEquals(parseYouTubeIsoDuration('PT2H3M4S'), 7384);
  assertEquals(parseYouTubeIsoDuration('P0D'), undefined); // live streams
  assertEquals(parseDurationSeconds('754'), 754);
  assertEquals(parseDurationSeconds('0'), undefined);
});

Deno.test('the 12-minute limit: 720 s goes to the model, 721 s does not', () => {
  assertEquals(isVideoTooLong(720), false);
  assertEquals(isVideoTooLong(721), true);
  // Over-limit videos keep their URL; the ladder's too-long path is what stops them.
  assertEquals(skipsTextStep('needs_video', youtubeInput({ durationSeconds: 721 })), false);
  assertEquals(skipsTextStep('needs_video', youtubeInput({ videoUrl: undefined, durationSeconds: undefined })), false);
  assertEquals(skipsTextStep('needs_video', youtubeInput()), true);
});

Deno.test('meta without an API key: player length sets videoUrl', () =>
  withEnv({ YOUTUBE_API_KEY: null }, async () => {
    const stub = stubFetch(() => Response.json({ videoDetails: { lengthSeconds: '300' } }));
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.durationSeconds, 300);
      assertEquals(meta.videoUrl, WATCH_URL);
    } finally {
      stub.restore();
    }
  }));

Deno.test('meta with no length anywhere leaves videoUrl unset', () =>
  withEnv({ YOUTUBE_API_KEY: null }, async () => {
    const stub = stubFetch(() => new Response('blocked', { status: 403 }));
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.durationSeconds, undefined);
      assertEquals(meta.videoUrl, undefined);
    } finally {
      stub.restore();
    }
  }));

Deno.test('meta with an API key: the Data API length wins and long videos stay flagged', () =>
  withEnv({ YOUTUBE_API_KEY: 'test' }, async () => {
    const stub = stubFetch((url) => {
      if (url.includes('/youtube/v3/videos')) {
        return Response.json({
          items: [{ snippet: { title: 'Soup', description: 'Soup' }, contentDetails: { duration: 'PT1H30M' } }],
        });
      }
      if (url.includes('/youtube/v3/commentThreads')) return Response.json({ items: [] });
      return new Response('blocked', { status: 403 });
    });
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.durationSeconds, 5400);
      assertEquals(meta.videoUrl, WATCH_URL);
      assert(isVideoTooLong(meta.durationSeconds));
    } finally {
      stub.restore();
    }
  }));

Deno.test('ladder: a YouTube video over 12 minutes never reaches the model', async () => {
  const stub = stubFetch(() => {
    throw new Error('no network call expected');
  });
  try {
    const result = await extractRecipeWithLadder(
      youtubeInput({ durationSeconds: 5400, description: undefined }),
    );
    assertEquals(result.videoSkippedReason, 'too_long');
    assertEquals(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test('ladder: partial text, unknown length, keeps the text and sends no video', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() => completion(PARTIAL));
    try {
      const result = await extractRecipeWithLadder(
        youtubeInput({ videoUrl: undefined, durationSeconds: undefined }),
      );
      assertEquals(stub.calls.length, 1);
      assertEquals(result.source, 'description');
      assertEquals(result.recipe.title, 'Tomato soup');
    } finally {
      stub.restore();
    }
  }));

Deno.test('ladder: partial text then the YouTube URL, with no fallback model', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      return completion(Array.isArray(body.messages[1].content) ? VIDEO_RECIPE : PARTIAL);
    });
    try {
      const result = await extractRecipeWithLadder(youtubeInput());
      assertEquals(stub.calls.length, 2);
      const videoCall = stub.calls[1].body;
      assertEquals(videoCall.messages[1].content[0], { type: 'video_url', video_url: { url: WATCH_URL } });
      assertEquals(videoCall.models, undefined);
      assertEquals(result.source, 'video');
      assertEquals(result.recipe.instructions.length, 2);
    } finally {
      stub.restore();
    }
  }));

Deno.test('ladder: a failed YouTube video call keeps the partial text', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (Array.isArray(body.messages[1].content)) {
        return new Response('{"error":"video unavailable"}', { status: 400 });
      }
      return completion(PARTIAL);
    });
    try {
      const result = await extractRecipeWithLadder(youtubeInput());
      assertEquals(stub.calls.length, 2);
      assertEquals(result.source, 'description');
      assertEquals(result.recipe.title, 'Tomato soup');
    } finally {
      stub.restore();
    }
  }));

Deno.test('ladder: with no time left for the video, it is skipped as out_of_time, not "no recipe"', async () => {
  const stub = stubFetch(() => {
    throw new Error('no network call expected');
  });
  try {
    const result = await extractRecipeWithLadder(youtubeInput({ description: undefined }), {
      deadlineAt: Date.now() + 5_000,
    });
    assertEquals(result.videoSkippedReason, 'out_of_time');
    assertEquals(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

Deno.test('ladder: out of time after partial text keeps the text instead of failing', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() => completion(PARTIAL));
    try {
      // Enough for the text step, not for the video rung after it.
      const result = await extractRecipeWithLadder(youtubeInput(), { deadlineAt: Date.now() + 20_000 });
      assertEquals(result.videoSkippedReason, undefined);
      assertEquals(result.recipe.title, 'Tomato soup');
      assertEquals(stub.calls.length, 1);
    } finally {
      stub.restore();
    }
  }));

Deno.test('ladder: a deadline shortens the video call to the time left', () =>
  withEnv({ OPENROUTER_API_KEY: 'test' }, async () => {
    const stub = stubFetch(() => completion(VIDEO_RECIPE));
    try {
      const result = await extractRecipeWithLadder(youtubeInput({ description: undefined }), {
        deadlineAt: Date.now() + 60_000,
      });
      assertEquals(result.source, 'video');
      assertEquals(result.videoSkippedReason, undefined);
      assertEquals(stub.calls.length, 1);
    } finally {
      stub.restore();
    }
  }));
