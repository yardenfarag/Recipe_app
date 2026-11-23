// npx deno test -A --no-lock supabase/functions/_shared/extraction/sources/youtubeCaptions_test.ts
//
// YouTube captions (PIN-151): YouTube's player almost never hands them to a server, so the
// transcript comes from ScrapeCreators when the player has none.

import { assert, assertEquals } from 'jsr:@std/assert@1';

import { buildTextContext, type ExtractInput } from '../recipeExtraction.ts';
import { fetchYouTubeMeta, scrapeCreatorsTranscriptText } from './youtube.ts';

const ID = 'h12wEYx45ws';
const TRANSCRIPT_PATH = '/v1/youtube/video/transcript';

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

function stubFetch(route: Route): { calls: string[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    try {
      return Promise.resolve(route(url, init));
    } catch (err) {
      return Promise.reject(err);
    }
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

/** What production sees: the player answers with a length and no caption tracks. */
const PLAYER_WITHOUT_TRACKS = { playabilityStatus: { status: 'OK' }, videoDetails: { lengthSeconds: '952' } };

const PLAYER_WITH_TRACK = {
  ...PLAYER_WITHOUT_TRACKS,
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=x', languageCode: 'en', kind: 'asr' }],
    },
  },
};

const TRANSCRIPT = {
  success: true,
  credits_charged: 1,
  language: 'English',
  transcript: [
    { text: 'okay  can  everybody  hear  me', startMs: '1730', endMs: '6569' },
    { text: ' add two cups of rice\nand one egg ', startMs: '6569', endMs: '9000' },
    { text: '   ', startMs: '9000', endMs: '9100' },
  ],
  transcript_only_text: 'ignored when segments exist',
};

Deno.test('transcript text: one clean line per segment, blanks dropped', () => {
  assertEquals(scrapeCreatorsTranscriptText(TRANSCRIPT), 'okay can everybody hear me\nadd two cups of rice and one egg');
});

Deno.test('transcript text: falls back to transcript_only_text, and to nothing', () => {
  assertEquals(scrapeCreatorsTranscriptText({ transcript: null, transcript_only_text: ' stir   well ' }), 'stir well');
  assertEquals(scrapeCreatorsTranscriptText({ transcript: null }), '');
  assertEquals(scrapeCreatorsTranscriptText(null), '');
});

Deno.test('no player captions: the transcript comes from ScrapeCreators and counts one credit', () =>
  withEnv({ YOUTUBE_API_KEY: null, SCRAPECREATORS_API_KEY: 'test' }, async () => {
    const stub = stubFetch((url, init) => {
      if (url.includes(TRANSCRIPT_PATH)) {
        assertEquals(new URL(url).searchParams.get('url'), `https://www.youtube.com/watch?v=${ID}`);
        assertEquals(new Headers(init?.headers).get('x-api-key'), 'test');
        return Response.json(TRANSCRIPT);
      }
      return Response.json(PLAYER_WITHOUT_TRACKS);
    });
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.captions, 'okay can everybody hear me\nadd two cups of rice and one egg');
      assertEquals(meta.scrapeCredits, 1);
      assertEquals(meta.durationSeconds, 952);
    } finally {
      stub.restore();
    }
  }));

Deno.test('player captions: ScrapeCreators is not called', () =>
  withEnv({ YOUTUBE_API_KEY: null, SCRAPECREATORS_API_KEY: 'test' }, async () => {
    const stub = stubFetch((url) => {
      if (url.includes('/api/timedtext')) {
        return new Response('<timedtext><body><p t="0" d="1">chop the &amp; onions</p></body></timedtext>');
      }
      if (url.includes(TRANSCRIPT_PATH)) throw new Error('ScrapeCreators should not be called');
      return Response.json(PLAYER_WITH_TRACK);
    });
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.captions, 'chop the & onions');
      assertEquals(meta.scrapeCredits, 0);
      assert(!stub.calls.some((url) => url.includes(TRANSCRIPT_PATH)));
    } finally {
      stub.restore();
    }
  }));

Deno.test('an empty player track still falls back to ScrapeCreators', () =>
  withEnv({ YOUTUBE_API_KEY: null, SCRAPECREATORS_API_KEY: 'test' }, async () => {
    const stub = stubFetch((url) => {
      if (url.includes('/api/timedtext')) return new Response('');
      if (url.includes(TRANSCRIPT_PATH)) return Response.json(TRANSCRIPT);
      return Response.json(PLAYER_WITH_TRACK);
    });
    try {
      const meta = await fetchYouTubeMeta(ID);
      assert(meta.captions?.startsWith('okay can everybody'));
      assertEquals(meta.scrapeCredits, 1);
    } finally {
      stub.restore();
    }
  }));

Deno.test('a video without captions, or a failing transcript call, imports without them', () =>
  withEnv({ YOUTUBE_API_KEY: null, SCRAPECREATORS_API_KEY: 'test' }, async () => {
    const replies: (() => Response)[] = [
      () => Response.json({ success: true, credits_charged: 0, transcript: null }),
      () => Response.json({ error: 'Video not found' }, { status: 404 }),
      () => new Response('upstream down', { status: 502 }),
      () => {
        throw new TypeError('network down');
      },
    ];
    for (const reply of replies) {
      const stub = stubFetch((url) => (url.includes(TRANSCRIPT_PATH) ? reply() : Response.json(PLAYER_WITHOUT_TRACKS)));
      try {
        const meta = await fetchYouTubeMeta(ID);
        assertEquals(meta.captions, undefined);
        assertEquals(meta.scrapeCredits, 0);
        assertEquals(meta.durationSeconds, 952);
      } finally {
        stub.restore();
      }
    }
  }));

Deno.test('without a ScrapeCreators key nothing is fetched beyond the player', () =>
  withEnv({ YOUTUBE_API_KEY: null, SCRAPECREATORS_API_KEY: null }, async () => {
    const stub = stubFetch(() => Response.json(PLAYER_WITHOUT_TRACKS));
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.captions, undefined);
      assertEquals(stub.calls.length, 1);
    } finally {
      stub.restore();
    }
  }));

Deno.test('with a Data API key: description, comments and the transcript all come back', () =>
  withEnv({ YOUTUBE_API_KEY: 'test', SCRAPECREATORS_API_KEY: 'test' }, async () => {
    const stub = stubFetch((url) => {
      if (url.includes('/youtube/v3/videos')) {
        return Response.json({
          items: [{ snippet: { title: 'Fried rice', description: 'Link in bio' }, contentDetails: { duration: 'PT15M52S' } }],
        });
      }
      if (url.includes('/youtube/v3/commentThreads')) return Response.json({ items: [] });
      if (url.includes(TRANSCRIPT_PATH)) return Response.json(TRANSCRIPT);
      return new Response('Sign in to confirm you are not a bot', { status: 403 });
    });
    try {
      const meta = await fetchYouTubeMeta(ID);
      assertEquals(meta.description, 'Link in bio');
      assertEquals(meta.durationSeconds, 952);
      assert(meta.captions?.includes('two cups of rice'));
      assertEquals(meta.scrapeCredits, 1);
    } finally {
      stub.restore();
    }
  }));

Deno.test('the model reads a 15-minute transcript to the end', () => {
  // About 1,000 characters a minute of speech; the recipe's last step is at the very end.
  const transcript = `${'and then we keep stirring the rice in the pan. '.repeat(340)}Finally add the soy sauce.`;
  assert(transcript.length > 15_000);
  const input: ExtractInput = {
    platform: 'youtube',
    sourceUrl: `https://www.youtube.com/watch?v=${ID}`,
    topComments: [],
    captions: transcript,
  };
  const context = buildTextContext(input, { description: false, comments: false, captions: true });
  assert(context.endsWith('Finally add the soy sauce.'));
});
