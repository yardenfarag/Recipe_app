// npx deno test -A --no-lock supabase/functions/_shared/extraction/webRecipe_test.ts
//
// The page download is capped in size and in time, body included (PIN-153).

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import { FetchError } from '../core/errors.ts';
import { fetchHtml } from './webRecipe.ts';

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
