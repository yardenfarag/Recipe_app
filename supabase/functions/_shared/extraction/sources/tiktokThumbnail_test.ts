// npx deno test -A --no-lock supabase/functions/_shared/extraction/sources/tiktokThumbnail_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { extractTikTokThumbnail } from './tiktokThumbnail.ts';

const CDN = 'https://p16-common-sign.tiktokcdn-us.com/tos-no1a-i-0068-no/ogf5RERkvCFF';

// The shape ScrapeCreators returned for a real video on 2026-11-22.
const list = (...exts: string[]) => ({ url_list: exts.map((ext) => `${CDN}.${ext}?x-expires=1&x-signature=abc`) });

Deno.test('takes the JPEG from a cover listed HEIC first', () => {
  assertEquals(extractTikTokThumbnail({ cover: list('heic', 'heic', 'jpeg') }, {}), `${CDN}.jpeg?x-expires=1&x-signature=abc`);
});

Deno.test('a cover with only HEIC is skipped for the next field', () => {
  assertEquals(
    extractTikTokThumbnail({ cover: list('heic', 'heif'), origin_cover: list('heic', 'webp') }, {}),
    `${CDN}.webp?x-expires=1&x-signature=abc`,
  );
});

Deno.test('a URL without a known extension is used when nothing better is listed', () => {
  assertEquals(extractTikTokThumbnail({ dynamic_cover: list('heic', 'image') }, {}), `${CDN}.image?x-expires=1&x-signature=abc`);
});

Deno.test('falls back to top-level fields, skipping HEIC', () => {
  assertEquals(extractTikTokThumbnail(undefined, { cover_url: `${CDN}.heic`, thumbnail_url: `${CDN}.jpg` }), `${CDN}.jpg`);
  assertEquals(extractTikTokThumbnail(undefined, { cover: list('heic', 'jpeg') }), `${CDN}.jpeg?x-expires=1&x-signature=abc`);
});

Deno.test('nothing usable gives undefined', () => {
  assertEquals(extractTikTokThumbnail({ cover: list('heic') }, { cover_url: `${CDN}.heic` }), undefined);
  assertEquals(extractTikTokThumbnail(undefined, {}), undefined);
});
