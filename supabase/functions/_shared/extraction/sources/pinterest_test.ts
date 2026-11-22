// npx deno test -A --no-lock supabase/functions/_shared/extraction/sources/pinterest_test.ts

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';

import type { WebRecipeMeta } from '../webRecipe.ts';
import {
  fetchPinterestMeta,
  parseIsoDuration,
  parsePinterestPage,
  pinterestMetaFromPin,
  resolvePinterestShortLink,
} from './pinterest.ts';

// Real pin pages saved on 22 Nov 2026, trimmed to the meta tags, JSON-LD and Relay fields
// pinterest.ts reads. People's ids, names and counts were removed.
const fixture = (name: string) =>
  Deno.readTextFileSync(new URL(`./fixtures/pinterest/${name}.html`, import.meta.url));
const RICH_LINK_PIN = fixture('rich-recipe-pin-with-link');
const LINK_PIN_BOILERPLATE = fixture('link-pin-boilerplate');
const VIDEO_PIN = fixture('video-idea-pin');
const MISSING_PIN = fixture('missing-pin');

const withoutRelay = (html: string) =>
  html.replace(/<script data-relay-completed-request[\s\S]*?<\/script>/g, '');

Deno.test('a rich recipe pin gives its outbound link, Relay title and caption, and JSON-LD ingredients', () => {
  const pin = parsePinterestPage(RICH_LINK_PIN, '452611831329517145')!;
  assertEquals(pin.link, 'https://pinchofyum.com/tortellini-soup?tp_image_id=57973');
  assertEquals(pin.title, "Ang's Creamy Tortellini Soup");
  assertEquals(pin.descriptionSource, 'relay');
  assert(pin.description!.startsWith('Cozy up tonight'));
  assertEquals(pin.ingredients.length, 17);
  assertEquals(pin.ingredients[0], '1 lb Italian sausage, ground mild');
  assertEquals(pin.videoUrl, undefined);
  assertEquals(pin.imageUrl, 'https://i.pinimg.com/736x/ba/a1/0b/baa10bcc674bf705bf3f2ca79369cb47.jpg');
});

Deno.test('the outbound link falls back to the meta tags when the Relay data is gone', () => {
  const pin = parsePinterestPage(withoutRelay(RICH_LINK_PIN), '452611831329517145')!;
  assertEquals(pin.link, 'https://pinchofyum.com/tortellini-soup?tp_image_id=57973');
  // The JSON-LD name, not the generic "Pin on Soup Recipes" og:title.
  assertEquals(pin.title, "Ang's Creamy Tortellini Soup");
  // The only description left is Pinterest's boilerplate, which is dropped.
  assertEquals(pin.description, undefined);
});

Deno.test("Pinterest's 'This Pin was discovered by' filler never becomes the description", () => {
  const pin = parsePinterestPage(withoutRelay(LINK_PIN_BOILERPLATE), '554857616617775476')!;
  assertEquals(pin.link, 'https://www.tasty.co/recipe/mongolian-beef-noodle-stir-fry');
  assertEquals(pin.description, undefined);
  assertEquals(pin.title, 'Mongolian Beef Noodle Stir-Fry');
});

Deno.test('a video idea pin gives the MP4, captions and duration from JSON-LD, and the creator caption from Relay', () => {
  const pin = parsePinterestPage(VIDEO_PIN, '521713938098528836')!;
  assertEquals(pin.link, undefined);
  assertEquals(
    pin.videoUrl,
    'https://v1.pinimg.com/videos/mc/720p/65/e1/63/65e1634aa85ba17d175c22fb229c84b1.mp4',
  );
  assertEquals(
    pin.captionsUrl,
    'https://v1.pinimg.com/videos/captions/en-nz/65/e1/63/65e1634aa85ba17d175c22fb229c84b1.vtt',
  );
  assertEquals(pin.durationSeconds, 32);
  // The creator's text with the ingredient list, not Pinterest's SEO summary in og:description.
  assertEquals(pin.descriptionSource, 'relay');
  assert(pin.description!.includes('100g cream cheese'));
  assert(!pin.description!.startsWith('Indulge'));
});

Deno.test('without Relay data a video pin still has its video, from JSON-LD, and the SEO description', () => {
  const pin = parsePinterestPage(withoutRelay(VIDEO_PIN), '521713938098528836')!;
  assert(pin.videoUrl!.endsWith('.mp4'));
  assert(pin.captionsUrl!.endsWith('.vtt'));
  assertEquals(pin.durationSeconds, 32);
  assertEquals(pin.descriptionSource, 'jsonld');
});

Deno.test('without JSON-LD a video pin finds its 720p MP4 and duration in the Relay video blocks', () => {
  const html = VIDEO_PIN.replace(/<script data-test-id="leaf-snippet"[\s\S]*?<\/script>/g, '');
  const pin = parsePinterestPage(html, '521713938098528836')!;
  assertEquals(
    pin.videoUrl,
    'https://v1.pinimg.com/videos/mc/720p/65/e1/63/65e1634aa85ba17d175c22fb229c84b1.mp4',
  );
  assertEquals(pin.durationSeconds, 32);
  assert(pin.captionsUrl!.endsWith('.vtt'));
});

Deno.test('the pin data sits after 1.2 MB of page in real life, and is still found there', () => {
  const padded = VIDEO_PIN.replace('<body>', `<body><style>${'.x{color:red}'.repeat(100_000)}</style>`);
  assert(padded.length > 1_200_000);
  assert(parsePinterestPage(padded, '521713938098528836')!.videoUrl);
});

Deno.test('a page for a pin that does not exist (Pinterest still answers 200) parses to null', () => {
  assertEquals(parsePinterestPage(MISSING_PIN, '123456789012345678'), null);
});

Deno.test("another pin's Relay data is ignored", () => {
  const pin = parsePinterestPage(VIDEO_PIN, '999999999999999999');
  // The meta tags still say it's a pin page, but nothing from the other pin's Relay data leaks in.
  assertEquals(pin?.descriptionSource, 'jsonld');
});

Deno.test('links back to Pinterest, short links and non-http links are not outbound links', () => {
  for (const link of ['https://www.pinterest.com/pin/1/', 'https://pin.it/abc', 'https://uk.pinterest.com/x/', 'javascript:alert(1)']) {
    const html = RICH_LINK_PIN.replaceAll('https://pinchofyum.com/tortellini-soup?tp_image_id=57973', link);
    assertEquals(parsePinterestPage(html, '452611831329517145')!.link, undefined, link);
  }
});

Deno.test('media URLs off Pinterest’s CDN are ignored', () => {
  const html = VIDEO_PIN.replaceAll('https://v1.pinimg.com/videos/', 'https://evil.example/videos/');
  const pin = parsePinterestPage(html, '521713938098528836')!;
  assertEquals(pin.videoUrl, undefined);
  assertEquals(pin.captionsUrl, undefined);
  assertEquals(pin.durationSeconds, undefined);
});

Deno.test('parseIsoDuration reads JSON-LD durations', () => {
  assertEquals(parseIsoDuration('PT32S'), 32);
  assertEquals(parseIsoDuration('PT1M5S'), 65);
  assertEquals(parseIsoDuration('PT1H2M'), 3720);
  assertEquals(parseIsoDuration('32'), undefined);
  assertEquals(parseIsoDuration(undefined), undefined);
});

Deno.test('a pin read on its own joins caption and ingredients, and turns the VTT into plain text', () => {
  const pin = parsePinterestPage(RICH_LINK_PIN, '452611831329517145')!;
  const meta = pinterestMetaFromPin(pin, 'WEBVTT\n\n1\n00:00:00.009 --> 00:00:02.339\nBrown the sausage.\n');
  assert(meta.description!.includes('Cozy up tonight'));
  assert(meta.description!.includes('Ingredients:\n- 1 lb Italian sausage, ground mild'));
  assertEquals(meta.captions, 'Brown the sausage.');
  assertEquals(meta.contentId, '452611831329517145');
  assertEquals(meta.canonicalUrl, 'https://www.pinterest.com/pin/452611831329517145/');
  assertEquals(meta.readAs, undefined);
});

// --- Short links -------------------------------------------------------------------------------

function redirects(map: Record<string, { status: number; location?: string }>) {
  const calls: string[] = [];
  const fetchImpl = (input: string) => {
    calls.push(input);
    const hop = map[input];
    if (!hop) return Promise.reject(new Error(`unexpected fetch ${input}`));
    return Promise.resolve(
      new Response(null, { status: hop.status, headers: hop.location ? { location: hop.location } : {} }),
    );
  };
  return { fetchImpl, calls };
}

Deno.test('pin.it resolves through the url_shortener hop to a clean pin URL', async () => {
  const { fetchImpl, calls } = redirects({
    'https://pin.it/53posxf7Z': { status: 308, location: 'https://api.pinterest.com/url_shortener/53posxf7Z/redirect/' },
    'https://api.pinterest.com/url_shortener/53posxf7Z/redirect/': {
      status: 302,
      location: 'https://www.pinterest.ru/pin/337347828359676424/sent/?invite_code=1b43&sender=1137440587046666078&sfo=1',
    },
  });
  assertEquals(
    await resolvePinterestShortLink('https://pin.it/53posxf7Z', fetchImpl),
    'https://www.pinterest.com/pin/337347828359676424/',
  );
  assertEquals(calls.length, 2);
});

Deno.test('an unknown pin.it code (it lands on the home page) comes back unchanged', async () => {
  const { fetchImpl } = redirects({
    'https://pin.it/nothing': { status: 308, location: 'https://api.pinterest.com/url_shortener/nothing/redirect/' },
    'https://api.pinterest.com/url_shortener/nothing/redirect/': { status: 302, location: 'https://www.pinterest.com' },
  });
  assertEquals(await resolvePinterestShortLink('https://pin.it/nothing', fetchImpl), 'https://pin.it/nothing');
});

Deno.test('a pin.it link to a board, or one that errors, comes back unchanged', async () => {
  const board = redirects({
    'https://pin.it/board': { status: 302, location: 'https://www.pinterest.com/someone/soups/' },
  });
  assertEquals(await resolvePinterestShortLink('https://pin.it/board', board.fetchImpl), 'https://pin.it/board');
  const failing = () => Promise.reject(new Error('network down'));
  assertEquals(await resolvePinterestShortLink('https://pin.it/x', failing), 'https://pin.it/x');
});

Deno.test('a short link is never followed off Pinterest', async () => {
  const { fetchImpl, calls } = redirects({
    'https://pin.it/off': { status: 302, location: 'https://example.com/url_shortener/x' },
  });
  assertEquals(await resolvePinterestShortLink('https://pin.it/off', fetchImpl), 'https://pin.it/off');
  assertEquals(calls, ['https://pin.it/off']);
});

Deno.test('a full pin link is cleaned without any request', async () => {
  const { fetchImpl, calls } = redirects({});
  assertEquals(
    await resolvePinterestShortLink(
      'https://uk.pinterest.com/pin/one-pot-toblerone-cheesecake--521713938098528836/?invite_code=x&sender=y',
      fetchImpl,
    ),
    'https://www.pinterest.com/pin/521713938098528836/',
  );
  assertEquals(calls.length, 0);
});

// --- The readAs hand-off -----------------------------------------------------------------------

const SITE_PAGE: WebRecipeMeta = {
  topComments: [],
  title: "Ang's Creamy Tortellini Soup Recipe",
  description: 'Source URL: https://pinchofyum.com/tortellini-soup\n--- STRUCTURED RECIPE ---\n{"recipeInstructions":[]}',
  thumbnailUrl: 'https://pinchofyum.com/wp-content/uploads/soup.jpg',
  pageHost: 'pinchofyum.com',
};

Deno.test('a pin with an outbound link hands that page to the web reader and keeps the pin as identity', async () => {
  const readUrls: string[] = [];
  const meta = await fetchPinterestMeta('https://www.pinterest.com/pin/452611831329517145/', {}, {
    fetchPage: () => Promise.resolve(RICH_LINK_PIN),
    readWebPage: (url) => {
      readUrls.push(url);
      return Promise.resolve(SITE_PAGE);
    },
  });
  assertEquals(readUrls, ['https://pinchofyum.com/tortellini-soup?tp_image_id=57973']);
  assertEquals(meta.readAs, 'web');
  assertEquals(meta.description, SITE_PAGE.description);
  assertEquals(meta.thumbnailUrl, SITE_PAGE.thumbnailUrl);
  assertEquals(meta.contentId, '452611831329517145');
  assertEquals(meta.canonicalUrl, 'https://www.pinterest.com/pin/452611831329517145/');
});

Deno.test('when the linked site refuses us, the pin itself is read instead', async () => {
  const meta = await fetchPinterestMeta('https://www.pinterest.com/pin/452611831329517145/', {}, {
    fetchPage: () => Promise.resolve(RICH_LINK_PIN),
    readWebPage: () => Promise.reject(new Error('Webpage returned an error')),
  });
  assertEquals(meta.readAs, undefined);
  assert(meta.description!.includes('Ingredients:'));
  assertEquals(meta.contentId, '452611831329517145');
});

Deno.test('a video pin without a link is read itself, captions included', async () => {
  let webReads = 0;
  const meta = await fetchPinterestMeta('https://www.pinterest.com/pin/521713938098528836/', {}, {
    fetchPage: () => Promise.resolve(VIDEO_PIN),
    fetchCaptions: () => Promise.resolve('WEBVTT\n\n1\n00:00:00.009 --> 00:00:02.339\nCrush up digestive biscuits.\n'),
    readWebPage: () => {
      webReads++;
      return Promise.resolve(SITE_PAGE);
    },
  });
  assertEquals(webReads, 0);
  assertEquals(meta.readAs, undefined);
  assertEquals(meta.captions, 'Crush up digestive biscuits.');
  assert(meta.videoUrl!.endsWith('.mp4'));
  assertEquals(meta.durationSeconds, 32);
});

Deno.test('a page with no pin is reported as not found', async () => {
  await assertRejects(
    () =>
      fetchPinterestMeta('https://www.pinterest.com/pin/123456789012345678/', {}, {
        fetchPage: () => Promise.resolve(MISSING_PIN),
      }),
    Error,
    'Pinterest pin not found',
  );
});

Deno.test('a Pinterest link that is not a pin is refused before any request', async () => {
  let pageReads = 0;
  await assertRejects(
    () =>
      fetchPinterestMeta('https://www.pinterest.com/someone/soups/', {}, {
        fetchPage: () => {
          pageReads++;
          return Promise.resolve(RICH_LINK_PIN);
        },
      }),
    Error,
    'Not a Pinterest pin link',
  );
  assertEquals(pageReads, 0);
});
