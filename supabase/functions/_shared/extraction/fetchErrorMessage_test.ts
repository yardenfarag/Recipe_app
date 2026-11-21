// npx deno test -A --no-lock supabase/functions/_shared/extraction/fetchErrorMessage_test.ts

import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { FetchError } from '../core/errors.ts';
import { mapScraperHttpError } from './sources/scrapecreators.ts';
import { fetchErrorMessage } from './fetchErrorMessage.ts';

function webError(status: number): FetchError {
  return new FetchError('webRecipe.ts: fetchHtml', 'Webpage returned an error', {
    url: 'https://example.com/recipe',
    status,
  });
}

Deno.test('a site that blocks us suggests a screenshot instead of a retry', () => {
  for (const status of [401, 403]) {
    const message = fetchErrorMessage(webError(status), 'web');
    assertStringIncludes(message, "doesn't let apps read");
    assertStringIncludes(message, 'screenshot');
  }
});

Deno.test('web statuses each get their own message', () => {
  assertEquals(fetchErrorMessage(webError(404), 'web'), "That page doesn't exist anymore — check the link.");
  assertEquals(fetchErrorMessage(webError(410), 'web'), "That page doesn't exist anymore — check the link.");
  assertEquals(
    fetchErrorMessage(webError(429), 'web'),
    'That site is busy right now — try again in a few minutes.',
  );
  assertEquals(
    fetchErrorMessage(webError(503), 'web'),
    'That site is having trouble right now — try again later.',
  );
  assertStringIncludes(fetchErrorMessage(webError(451), 'web'), 'screenshot');
});

Deno.test('web timeouts and network failures', () => {
  const timedOut = new FetchError('webRecipe.ts: fetchHtml', 'Could not load this webpage', { timedOut: true });
  assertEquals(fetchErrorMessage(timedOut, 'web'), 'That site took too long to respond — try again in a moment.');
  const unreachable = new FetchError('webRecipe.ts: fetchHtml', 'Could not load this webpage', {
    timedOut: false,
    originalError: 'dns error',
  });
  assertEquals(fetchErrorMessage(unreachable, 'web'), "Couldn't reach that site — check the link and try again.");
});

Deno.test('a page that is not a recipe', () => {
  const notHtml = new FetchError('webRecipe.ts: fetchHtml', "That link doesn't look like a recipe webpage.", {
    contentType: 'application/pdf',
  });
  assertEquals(fetchErrorMessage(notHtml, 'web'), "That link doesn't look like a recipe webpage.");
  const empty = new FetchError(
    'webRecipe.ts: fetchWebRecipeMeta',
    "Couldn't read this page — it may be private or blocked.",
  );
  assertStringIncludes(fetchErrorMessage(empty, 'web'), 'screenshot');
});

Deno.test('an AI provider status is not read as a website status', () => {
  const llm = new FetchError('gemini.ts: extract', 'OpenRouter API returned an error', { status: 403 });
  assertEquals(fetchErrorMessage(llm, 'web'), 'Recipe extraction failed — try again in a moment.');
});

Deno.test('a private or deleted post', () => {
  const err = mapScraperHttpError(404, 'not found', '/v2/tiktok/video');
  assertEquals(fetchErrorMessage(err, 'tiktok'), "This post is private or was deleted, so Pinch can't read it.");
});

Deno.test('ScrapeCreators timeouts and rate limits', () => {
  const timedOut = new FetchError('scrapecreators.ts: scrapeCreatorsGet', 'ScrapeCreators request failed', {
    timedOut: true,
  });
  assertEquals(fetchErrorMessage(timedOut, 'tiktok'), 'TikTok took too long to respond — try again.');
  assertEquals(fetchErrorMessage(timedOut, 'facebook'), 'Facebook took too long to respond — try again.');
  const limited = mapScraperHttpError(429, 'rate limited', '/v2/tiktok/video');
  assertEquals(fetchErrorMessage(limited, 'tiktok'), 'Too many requests right now — try again in a minute.');
});

Deno.test('an LLM timeout says extraction timed out', () => {
  const err = new FetchError('gemini.ts: extract', 'OpenRouter request failed', { timedOut: true });
  assertEquals(fetchErrorMessage(err, 'youtube'), 'Recipe extraction timed out — try again in a moment.');
});

Deno.test('unknown errors fall back by platform', () => {
  const err = new FetchError('somewhere.ts', 'Something odd');
  assertEquals(fetchErrorMessage(err, 'web'), "Couldn't load this page — try again.");
  assertEquals(fetchErrorMessage(err, 'instagram'), "Couldn't load this video — try again.");
});
