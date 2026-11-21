// npx deno test -A --no-lock supabase/functions/_shared/extraction/persistThumbnail_test.ts
//
// A web recipe's image is copied into our Storage (PIN-153), so the public Hub page never shows
// a picture its source site can change afterwards.

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

import { persistSocialThumbnail } from './persistThumbnail.ts';

// An address literal, so safeFetch needs no DNS lookup.
const IMAGE_URL = 'http://93.184.216.34/images/soup.jpg';
const PROJECT = 'https://project.supabase.co';

interface Upload {
  path: string;
  contentType: string | null;
  bytes: number;
}

/** Serves `image` for the source URL and records uploads to Storage. */
function stubNetwork(image: () => Response): { uploads: Upload[]; restore: () => void } {
  const original = globalThis.fetch;
  const uploads: Upload[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = request.url;
    if (url.startsWith(IMAGE_URL)) return image();
    if (url.startsWith(`${PROJECT}/storage/v1/object/recipe-thumbnails/`)) {
      const body = await request.arrayBuffer();
      uploads.push({
        path: decodeURIComponent(url.slice(`${PROJECT}/storage/v1/object/recipe-thumbnails/`.length)),
        contentType: request.headers.get('content-type'),
        bytes: body.byteLength,
      });
      return Response.json({ Key: 'ok' });
    }
    return new Response('unexpected request', { status: 500 });
  }) as typeof fetch;
  return { uploads, restore: () => (globalThis.fetch = original) };
}

async function withStorageEnv(fn: () => Promise<void>) {
  const previous = { url: Deno.env.get('SUPABASE_URL'), key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') };
  Deno.env.set('SUPABASE_URL', PROJECT);
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
  try {
    await fn();
  } finally {
    if (previous.url === undefined) Deno.env.delete('SUPABASE_URL');
    else Deno.env.set('SUPABASE_URL', previous.url);
    if (previous.key === undefined) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', previous.key);
  }
}

const jpeg = (fill: number) =>
  new Response(new Uint8Array(2048).fill(fill), { headers: { 'content-type': 'image/jpeg; charset=binary' } });

Deno.test({
  name: 'a web image is copied under web/, named by its content',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      const stub = stubNetwork(() => jpeg(7));
      try {
        const hosted = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'web' });
        assertEquals(stub.uploads.length, 1);
        const { path, contentType, bytes } = stub.uploads[0];
        assert(/^web\/[0-9a-f]{32}\.jpg$/.test(path), path);
        assertEquals(contentType, 'image/jpeg');
        assertEquals(bytes, 2048);
        assertEquals(hosted, `${PROJECT}/storage/v1/object/public/recipe-thumbnails/${path}`);
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'when the site swaps the picture, the copy we already published is not overwritten',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      let fill = 1;
      const stub = stubNetwork(() => jpeg(fill));
      try {
        const first = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'web' });
        const again = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'web' });
        fill = 2; // same address, different picture
        const swapped = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'web' });
        assertEquals(again, first, 'the same picture is the same file');
        assertNotEquals(swapped, first, 'a different picture is a different file');
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'something that is not a picture is not copied',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream']) {
        const stub = stubNetwork(() => new Response('<svg onload="alert(1)"/>'.repeat(20), { headers: { 'content-type': type } }));
        try {
          assertEquals(await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'web' }), undefined, type);
          assertEquals(stub.uploads.length, 0);
        } finally {
          stub.restore();
        }
      }
    }),
});
