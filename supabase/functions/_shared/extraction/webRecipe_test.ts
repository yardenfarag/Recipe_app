// npx deno test -A --no-lock supabase/functions/_shared/extraction/webRecipe_test.ts
//
// The page download is capped in size and in time, body included (PIN-153).
// Google Docs links are read through the document's HTML export (PIN-73).

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { FetchError } from '../core/errors.ts';
import { fetchErrorInfo } from './fetchErrorMessage.ts';
import type { PageRead, PageReader, PageReadEvent } from './pageReader.ts';
import { fetchHtml, fetchHtmlOrRead, googleDocExportUrl } from './webRecipe.ts';

// An address literal, so safeFetch needs no DNS lookup.
const PAGE = 'http://93.184.216.34/recipe';

function stubFetch(respond: (init?: RequestInit) => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(respond(init))) as typeof fetch;
  return () => (globalThis.fetch = original);
}

/** A body that sends `chunk` forever, counting what was pulled and whether it was cancelled. */
function endlessBody(chunk: Uint8Array, state: { pulled: number; cancelled: boolean }): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(controller) {
      state.pulled += chunk.byteLength;
      controller.enqueue(chunk);
    },
    cancel() {
      state.cancelled = true;
    },
  });
}

Deno.test('a normal page comes back whole', async () => {
  const restore = stubFetch(() => new Response('<html><body>Pancakes: 2 eggs</body></html>', {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }));
  try {
    assertEquals(await fetchHtml(PAGE), '<html><body>Pancakes: 2 eggs</body></html>');
  } finally {
    restore();
  }
});

Deno.test('an endless page stops downloading at the cap', async () => {
  const state = { pulled: 0, cancelled: false };
  const chunk = new TextEncoder().encode('x'.repeat(64 * 1024));
  const restore = stubFetch(() => new Response(endlessBody(chunk, state), { headers: { 'content-type': 'text/html' } }));
  try {
    const html = await fetchHtml(PAGE);
    assert(html.length <= 600_000, 'the text handed on stays within MAX_HTML_CHARS');
    assert(state.cancelled, 'the download was cancelled');
    assert(state.pulled <= 2 * 1024 * 1024 + 2 * chunk.byteLength, `read ${state.pulled} bytes`);
  } finally {
    restore();
  }
});

Deno.test('a page that sends its body too slowly times out', async () => {
  const restore = stubFetch((init) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<html>'));
        // The rest never arrives; the abort signal ends the read, as it does for a real fetch.
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(body, { headers: { 'content-type': 'text/html' } });
  });
  try {
    const started = Date.now();
    const err = await assertRejects(() => fetchHtml(PAGE, 150), FetchError);
    assertEquals(err.details?.timedOut, true);
    assert(Date.now() - started < 3_000);
  } finally {
    restore();
  }
});

Deno.test('a file that is not a page is refused without downloading it', async () => {
  const state = { pulled: 0, cancelled: false };
  const restore = stubFetch(() =>
    new Response(endlessBody(new Uint8Array(1024), state), { headers: { 'content-type': 'video/mp4' } })
  );
  try {
    await assertRejects(() => fetchHtml(PAGE), FetchError, "doesn't look like a recipe webpage");
    assert(state.cancelled);
  } finally {
    restore();
  }
});

const DOC_ID = '1nz2yrR77amxBmtKIR57BJi1qn9aZabWKCpldXtTEMvw';
const DOC_EXPORT = `https://docs.google.com/document/d/${DOC_ID}/export?format=html`;

Deno.test('a Google Docs link is read through its HTML export', () => {
  for (const link of [
    `https://docs.google.com/document/d/${DOC_ID}/edit`,
    `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`,
    `https://docs.google.com/document/d/${DOC_ID}/edit#heading=h.abc`,
    `https://docs.google.com/document/d/${DOC_ID}/view`,
    `https://docs.google.com/document/d/${DOC_ID}`,
    `https://docs.google.com/document/u/1/d/${DOC_ID}/edit`,
    `http://docs.google.com/document/d/${DOC_ID}/preview?hgd=1`,
  ]) {
    assertEquals(googleDocExportUrl(link), DOC_EXPORT, link);
  }
});

Deno.test('other links are fetched as they are', () => {
  for (const link of [
    'https://cookieandkate.com/socca/',
    // Published to the web: an ordinary page already.
    'https://docs.google.com/document/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz/pub',
    `https://docs.google.com/spreadsheets/d/${DOC_ID}/edit`,
    `https://drive.google.com/file/d/${DOC_ID}/view`,
    `https://docs.google.com.evil.example/document/d/${DOC_ID}/edit`,
    'https://docs.google.com/document/d/short/edit',
    'not a url',
  ]) {
    assertEquals(googleDocExportUrl(link), null, link);
  }
});

Deno.test('a private Google Doc, which lands on the sign-in page, is reported as private', async () => {
  const restore = stubFetch(() => {
    const res = new Response('<html><body>Sign in</body></html>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(res, 'url', { value: 'https://accounts.google.com/v3/signin/identifier?continue=x' });
    return res;
  });
  try {
    const err = await assertRejects(() => fetchHtml(PAGE), FetchError);
    assertEquals(fetchErrorInfo(err, 'web').code, 'post_private');
  } finally {
    restore();
  }
});

// --- A page our servers are refused (403) is read once through the page-reading service (PIN-152).

function siteAnswers(status: number): () => void {
  return stubFetch(() => new Response('Forbidden', { status, headers: { 'content-type': 'text/html' } }));
}

function fakeReader(result: PageRead | Error): PageReader & { calls: string[] } {
  const calls: string[] = [];
  return {
    provider: 'firecrawl',
    calls,
    read(url) {
      calls.push(url);
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
  };
}

const READ_OK: PageRead = { html: '<html><body>Socca: chickpea flour</body></html>', siteStatus: 200, units: 1, costUsd: 0.005 };

Deno.test('a 403 page is read once through the service, and the read is logged with its cost', async () => {
  const restore = siteAnswers(403);
  const reader = fakeReader(READ_OK);
  const events: PageReadEvent[] = [];
  try {
    const html = await fetchHtmlOrRead(PAGE, { pageReader: reader, onPageRead: (e) => void events.push(e) });
    assertEquals(html, READ_OK.html);
    assertEquals(reader.calls, [PAGE]);
    assertEquals(events.length, 1);
    assertEquals(events[0].status, 'ok');
    assertEquals(events[0].provider, 'firecrawl');
    assertEquals(events[0].costUsd, 0.005);
    assertEquals(events[0].host, '93.184.216.34');
  } finally {
    restore();
  }
});

Deno.test('other errors never call the service', async () => {
  for (const status of [401, 404, 429, 500]) {
    const restore = siteAnswers(status);
    const reader = fakeReader(READ_OK);
    try {
      const err = await assertRejects(() => fetchHtmlOrRead(PAGE, { pageReader: reader }), FetchError);
      assertEquals(err.details?.status, status);
      assertEquals(reader.calls.length, 0, `status ${status}`);
    } finally {
      restore();
    }
  }
});

Deno.test('a page that loads normally never calls the service', async () => {
  const restore = stubFetch(() => new Response('<html>ok</html>', { headers: { 'content-type': 'text/html' } }));
  const reader = fakeReader(READ_OK);
  try {
    assertEquals(await fetchHtmlOrRead(PAGE, { pageReader: reader }), '<html>ok</html>');
    assertEquals(reader.calls.length, 0);
  } finally {
    restore();
  }
});

Deno.test('when the site refuses the service too, the user sees the usual blocked message and the charge is logged', async () => {
  const restore = siteAnswers(403);
  const reader = fakeReader({ html: null, siteStatus: 403, units: 1, costUsd: 0.005 });
  const events: PageReadEvent[] = [];
  try {
    const err = await assertRejects(
      () => fetchHtmlOrRead(PAGE, { pageReader: reader, onPageRead: (e) => void events.push(e) }),
      FetchError,
    );
    assertEquals(fetchErrorInfo(err, 'web').code, 'site_blocked');
    assertEquals(events.map((e) => [e.status, e.siteStatus, e.costUsd]), [['blocked', 403, 0.005]]);
  } finally {
    restore();
  }
});

Deno.test('when the service fails, the user sees the usual blocked message', async () => {
  const restore = siteAnswers(403);
  const reader = fakeReader(new FetchError('pageReader.ts: firecrawl', 'Page reader request failed', { status: 402 }));
  const events: PageReadEvent[] = [];
  try {
    const err = await assertRejects(
      () => fetchHtmlOrRead(PAGE, { pageReader: reader, onPageRead: (e) => void events.push(e) }),
      FetchError,
    );
    assertEquals(fetchErrorInfo(err, 'web').code, 'site_blocked');
    assertEquals(events[0].status, 'error');
    assertEquals(events[0].costUsd, 0);
  } finally {
    restore();
  }
});

Deno.test('a failing usage log does not fail the import', async () => {
  const restore = siteAnswers(403);
  try {
    const html = await fetchHtmlOrRead(PAGE, {
      pageReader: fakeReader(READ_OK),
      onPageRead: () => Promise.reject(new Error('db down')),
    });
    assertEquals(html, READ_OK.html);
  } finally {
    restore();
  }
});

Deno.test('with no service configured, a 403 fails as before', async () => {
  const restore = siteAnswers(403);
  try {
    const err = await assertRejects(() => fetchHtmlOrRead(PAGE, { pageReader: null }), FetchError);
    assertEquals(err.details?.status, 403);
  } finally {
    restore();
  }
});
