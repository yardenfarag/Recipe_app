// npx deno test -A --no-lock --config supabase/functions/deno.json supabase/functions/_shared/extraction/sources/instagramThumbnail_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import { extractInstagramThumbnails } from './instagram.ts';

const CDN = 'https://scontent.cdninstagram.com/v/t51';

// PIN-176: `thumbnail_src` is a 640 square crop and `display_resources` starts with its smallest copy.
Deno.test('takes the 1080 copy before the 640 crop', () => {
  const media = {
    thumbnail_src: `${CDN}/square-640.jpg`,
    display_url: `${CDN}/full.jpg`,
    display_resources: [
      { src: `${CDN}/640.jpg`, config_width: 640, config_height: 1136 },
      { src: `${CDN}/750.jpg`, config_width: 750, config_height: 1333 },
      { src: `${CDN}/1080.jpg`, config_width: 1080, config_height: 1920 },
    ],
  };
  assertEquals(extractInstagramThumbnails(media), [
    `${CDN}/1080.jpg`,
    `${CDN}/750.jpg`,
    `${CDN}/full.jpg`,
    `${CDN}/square-640.jpg`,
    `${CDN}/640.jpg`,
  ]);
});

Deno.test('reads image_versions2 and falls back to the first carousel picture', () => {
  assertEquals(
    extractInstagramThumbnails({
      image_versions2: {
        candidates: [
          { url: `${CDN}/320.jpg`, width: 320, height: 320 },
          { url: `${CDN}/1440.jpg`, width: 1440, height: 1800 },
        ],
      },
    }),
    [`${CDN}/1440.jpg`, `${CDN}/320.jpg`],
  );
  assertEquals(
    extractInstagramThumbnails({ edge_sidecar_to_children: { edges: [{ node: { display_url: `${CDN}/slide1.jpg` } }] } }),
    [`${CDN}/slide1.jpg`],
  );
  assertEquals(extractInstagramThumbnails({}), []);
});
