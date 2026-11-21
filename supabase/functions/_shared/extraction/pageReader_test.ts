// npx deno test -A --no-lock supabase/functions/_shared/extraction/pageReader_test.ts
//
// Firecrawl's answers, as its API docs describe them (PIN-152).

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { FetchError } from '../core/errors.ts';
import { configuredPageReader, firecrawlReader, looksLikeBlockPage } from './pageReader.ts';

// An address literal, so the public-address check needs no DNS lookup.
const PAGE = 'http://93.184.216.34/recipe';
const RECIPE_PAGE =
  '<html><head><title>Socca</title><script type="application/ld+json">{"@type":"Recipe","name":"Socca"}</script></head><body>Chickpea flour</body></html>';

interface Sent {
  url: string;
  init?: RequestInit;
}

function stubService(status: number, body: unknown): { sent: Sent[]; restore: () => void } {
  const original = globalThis.fetch;
  const sent: Sent[] = [];
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { sent, restore: () => (globalThis.fetch = original) };
}

Deno.test('Firecrawl: asks for the raw HTML and returns it with one credit', async () => {
  const service = stubService(200, {
    success: true,
    data: { rawHtml: RECIPE_PAGE, metadata: { statusCode: 200, sourceURL: PAGE } },
  });
  try {
    const read = await firecrawlReader('fc-test').read(PAGE);
    assertEquals(read.html, RECIPE_PAGE);
    assertEquals(read.siteStatus, 200);
    assertEquals(read.units, 1);
    assert(read.costUsd > 0);

    assertEquals(service.sent[0].url, 'https://api.firecrawl.dev/v2/scrape');
    const body = JSON.parse(String(service.sent[0].init?.body));
    assertEquals(body.url, PAGE);
    assertEquals(body.formats, ['rawHtml']);
    assertEquals(body.onlyMainContent, false);
    assertEquals((service.sent[0].init?.headers as Record<string, string>).Authorization, 'Bearer fc-test');
  } finally {
    service.restore();
  }
});

Deno.test('Firecrawl: a site that refuses it too gives no page, and the credit still counts', async () => {
  const service = stubService(200, {
    success: true,
    data: { rawHtml: '<html><title>403 Forbidden</title></html>', metadata: { statusCode: 403 } },
  });
  try {
    const read = await firecrawlReader('fc-test').read(PAGE);
    assertEquals(read.html, null);
    assertEquals(read.siteStatus, 403);
    assertEquals(read.units, 1);
  } finally {
    service.restore();
  }
});

Deno.test('Firecrawl: out of credits is an error, not a page', async () => {
  const service = stubService(402, { success: false, error: 'Payment Required: Insufficient credits' });
  try {
    const err = await assertRejects(() => firecrawlReader('fc-test').read(PAGE), FetchError);
    assertEquals(err.details?.status, 402);
  } finally {
    service.restore();
  }
});

Deno.test('the service is never asked for a non-public address', async () => {
  const service = stubService(200, { success: true, data: { rawHtml: RECIPE_PAGE } });
  try {
    await assertRejects(() => firecrawlReader('fc-test').read('http://127.0.0.1/admin'), FetchError);
    await assertRejects(() => firecrawlReader('fc-test').read('http://169.254.169.254/'), FetchError);
    assertEquals(service.sent.length, 0);
  } finally {
    service.restore();
  }
});

Deno.test('a bot check that comes back as a normal page counts as blocked', () => {
  assert(looksLikeBlockPage('<html><head><title>Just a moment...</title></head></html>'));
  assert(looksLikeBlockPage('<html><head><title>Access Denied</title></head></html>'));
  assert(looksLikeBlockPage('<html><script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script></html>'));
  assertEquals(looksLikeBlockPage(RECIPE_PAGE), false);
  assertEquals(looksLikeBlockPage('<html><head><title>Thai red curry</title></head></html>'), false);
});

Deno.test('the fallback is on only when the Firecrawl key is set', () => {
  const env = (vars: Record<string, string>) => (name: string) => vars[name];
  assertEquals(configuredPageReader(env({})), null);
  assertEquals(configuredPageReader(env({ FIRECRAWL_API_KEY: '  ' })), null);
  assertEquals(configuredPageReader(env({ FIRECRAWL_API_KEY: 'fc' }))?.provider, 'firecrawl');
});
