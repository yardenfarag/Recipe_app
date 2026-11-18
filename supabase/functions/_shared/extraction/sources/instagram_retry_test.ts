// npx deno test -A --no-lock supabase/functions/_shared/extraction/sources/instagram_retry_test.ts
import { assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { FetchError } from '../../core/errors.ts';
import { fetchInstagramMeta } from './instagram.ts';
import { isScrapeCreatorsTimeout } from './scrapecreators.ts';

const REEL = 'https://www.instagram.com/reel/DAbCdEfGhIj/';

const POST_RESPONSE = {
  data: {
    xdt_shortcode_media: {
      shortcode: 'DAbCdEfGhIj',
      display_url: 'https://example.com/thumb.jpg',
      owner: { username: 'cook', id: '1' },
      edge_media_to_caption: { edges: [{ node: { text: 'Lentil soup: 1 cup lentils' } }] },
    },
  },
};

function abortError(): Error {
  const err = new Error('The signal has been aborted');
  err.name = 'AbortError';
  return err;
}

/** Stubs fetch: ScrapeCreators calls take their outcome from `outcomes` in order; anything else 404s. */
function stubScrapeCreators(outcomes: Array<'timeout' | 'ok'>) {
  const original = globalThis.fetch;
  Deno.env.set('SCRAPECREATORS_API_KEY', 'test-key');
  let calls = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://api.scrapecreators.com/v1/instagram/post')) {
      return Promise.resolve(new Response('', { status: 404 }));
    }
    const outcome = outcomes[calls++] ?? 'timeout';
    if (outcome === 'timeout') return Promise.reject(abortError());
    return Promise.resolve(new Response(JSON.stringify(POST_RESPONSE), { status: 200 }));
  }) as typeof fetch;
  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

Deno.test('a ScrapeCreators timeout on the Instagram post call is retried once', async () => {
  const stub = stubScrapeCreators(['timeout', 'ok']);
  try {
    const meta = await fetchInstagramMeta(REEL);
    assertEquals(meta.contentId, 'DAbCdEfGhIj');
    assertEquals(stub.calls(), 2);
  } finally {
    stub.restore();
  }
});

Deno.test('two timeouts in a row on the same URL give up with the timeout error', async () => {
  const stub = stubScrapeCreators(['timeout', 'timeout', 'timeout', 'timeout', 'timeout', 'timeout']);
  try {
    const err = await assertRejects(() => fetchInstagramMeta(REEL), FetchError);
    assertEquals(isScrapeCreatorsTimeout(err), true);
    // One retry, and a timeout is not a reason to move on to the next URL candidate.
    assertEquals(stub.calls(), 2);
  } finally {
    stub.restore();
  }
});

Deno.test('isScrapeCreatorsTimeout only matches timeouts', () => {
  assertEquals(isScrapeCreatorsTimeout(new FetchError('x', 'failed', { timedOut: true })), true);
  assertEquals(isScrapeCreatorsTimeout(new FetchError('x', 'failed', { timedOut: false })), false);
  assertEquals(isScrapeCreatorsTimeout(new FetchError('x', 'This post is not publicly accessible')), false);
  assertEquals(isScrapeCreatorsTimeout(new Error('boom')), false);
});
