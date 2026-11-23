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
  name: 'a social image is named by its post id and its content',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      let fill = 1;
      const stub = stubNetwork(() => jpeg(fill));
      try {
        const first = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'tiktok', contentId: '7619040874910993667' });
        const again = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'tiktok', contentId: '7619040874910993667' });
        fill = 2;
        const changed = await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform: 'tiktok', contentId: '7619040874910993667' });
        assert(/^tiktok\/7619040874910993667-[0-9a-f]{8}\.jpg$/.test(stub.uploads[0].path), stub.uploads[0].path);
        assertEquals(again, first, 'the same picture is the same file');
        assertNotEquals(changed, first, 'a new picture for the same post gets a new name, past the year-long cache');
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'a HEIC image is not copied, since only Apple devices can show it',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      for (const platform of ['tiktok', 'instagram', 'web'] as const) {
        for (const type of ['image/heic', 'image/heif']) {
          const stub = stubNetwork(() => new Response(new Uint8Array(2048), { headers: { 'content-type': type } }));
          try {
            assertEquals(await persistSocialThumbnail({ sourceUrl: IMAGE_URL, platform, contentId: '1' }), undefined, `${platform} ${type}`);
            assertEquals(stub.uploads.length, 0);
          } finally {
            stub.restore();
          }
        }
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

// PIN-176: a source lists several pictures; the first sharp one is kept, else the largest.

/** A JPEG header that says `width`×`height`, padded so it passes the size checks. */
function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(512);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff]);
  return bytes;
}

/** Serves `sizes[url]` as a JPEG of that size, counts the downloads and records uploads. */
function stubCandidates(sizes: Record<string, [number, number] | 'fail'>) {
  const original = globalThis.fetch;
  const downloads: string[] = [];
  const uploads: number[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url in sizes) {
      downloads.push(request.url);
      const size = sizes[request.url];
      if (size === 'fail') return new Response('gone', { status: 404 });
      return new Response(jpegHeader(size[0], size[1]), { headers: { 'content-type': 'image/jpeg' } });
    }
    if (request.url.startsWith(`${PROJECT}/storage/v1/object/recipe-thumbnails/`)) {
      const body = new Uint8Array(await request.arrayBuffer());
      uploads.push((body[9] << 8) | body[10]);
      return Response.json({ Key: 'ok' });
    }
    return new Response('unexpected request', { status: 500 });
  }) as typeof fetch;
  return { downloads, uploadedWidths: uploads, restore: () => (globalThis.fetch = original) };
}

const SMALL = 'http://93.184.216.34/cover-300x400.jpg';
const SHARP = 'http://93.184.216.34/origin.jpg';
const MEDIUM = 'http://93.184.216.34/medium.jpg';

Deno.test({
  name: 'a sharp first picture is kept without downloading the others',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      const stub = stubCandidates({ [SHARP]: [720, 1280], [SMALL]: [300, 400] });
      try {
        await persistSocialThumbnail({ sourceUrl: SHARP, alternates: [SMALL], platform: 'tiktok', contentId: '1' });
        assertEquals(stub.downloads, [SHARP]);
        assertEquals(stub.uploadedWidths, [720]);
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'a small picture makes it try the next one, and the sharp one is kept',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      const stub = stubCandidates({ [SMALL]: [300, 400], [SHARP]: [720, 1280], [MEDIUM]: [600, 800] });
      try {
        await persistSocialThumbnail({ sourceUrl: SMALL, alternates: [SHARP, MEDIUM], platform: 'web' });
        assertEquals(stub.downloads, [SMALL, SHARP]);
        assertEquals(stub.uploadedWidths, [720]);
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'when none is sharp, the largest is kept; a failed download is skipped',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      const stub = stubCandidates({ [SMALL]: [300, 400], [SHARP]: 'fail', [MEDIUM]: [600, 800] });
      try {
        const hosted = await persistSocialThumbnail({ sourceUrl: SMALL, alternates: [SHARP, MEDIUM], platform: 'web' });
        assertEquals(stub.downloads, [SMALL, SHARP, MEDIUM]);
        assertEquals(stub.uploadedWidths, [600]);
        assert(hosted);
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'at most three pictures are downloaded',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      const urls = [1, 2, 3, 4].map((n) => `http://93.184.216.34/small-${n}.jpg`);
      const stub = stubCandidates(Object.fromEntries(urls.map((url) => [url, [200, 200] as [number, number]])));
      try {
        await persistSocialThumbnail({ sourceUrl: urls[0], alternates: urls.slice(1), platform: 'web' });
        assertEquals(stub.downloads, urls.slice(0, 3));
      } finally {
        stub.restore();
      }
    }),
});

Deno.test({
  name: 'with minShortSide, a picture no larger than the old cover is not stored',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: () =>
    withStorageEnv(async () => {
      const stub = stubCandidates({ [SMALL]: [300, 400], [MEDIUM]: [600, 800] });
      try {
        const kept = await persistSocialThumbnail({ sourceUrl: SMALL, platform: 'web', minShortSide: 300 });
        assertEquals(kept, undefined);
        assertEquals(stub.uploadedWidths, []);
        const larger = await persistSocialThumbnail({ sourceUrl: MEDIUM, platform: 'web', minShortSide: 300 });
        assert(larger);
        assertEquals(stub.uploadedWidths, [600]);
      } finally {
        stub.restore();
      }
    }),
});
