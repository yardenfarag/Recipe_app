import { assertEquals, assertMatch } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { parseExtractRequest } from './extractRequest.ts';
import { MAX_RECIPE_TEXT_CHARS } from './textRecipe.ts';

/** The exact status and body a request is turned away with. */
function rejection(body: unknown): [number, string] {
  try {
    parseExtractRequest(body);
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

const error400 = (message: string): [number, string] => [400, JSON.stringify({ error: message })];
const MISSING = error400('Missing "url", "image_base64", "pdf_base64" or "text" in request body');
const PHOTO = 'a'.repeat(100);
const RECIPE = 'Pasta: boil 200 g spaghetti, fry garlic in olive oil, toss together and serve.';
const pdfBase64 = (text: string) => btoa(`%PDF-1.4\n${text}`);

Deno.test('a link is trimmed, with the defaults for everything else', () => {
  const parsed = parseExtractRequest({ url: '  https://youtu.be/abc  ' });
  assertMatch(parsed.requestId, /^[0-9a-f-]{36}$/);
  assertEquals({ ...parsed, requestId: '' }, {
    url: 'https://youtu.be/abc',
    imageBase64: null,
    imageMime: 'image/jpeg',
    pdf: null,
    recipeText: null,
    guestInstallId: null,
    requestId: '',
    forceExtract: false,
  });
});

Deno.test('ids are trimmed and capped, short ones ignored, camelCase accepted', () => {
  const parsed = parseExtractRequest({
    url: 'https://example.com/x',
    guestInstallId: ` ${'g'.repeat(200)} `,
    request_id: ' req-12345 ',
    forceExtract: true,
  });
  assertEquals(parsed.guestInstallId, 'g'.repeat(128));
  assertEquals(parsed.requestId, 'req-12345');
  assertEquals(parsed.forceExtract, true);

  const short = parseExtractRequest({ url: 'https://example.com/x', guest_install_id: 'short', requestId: 'tiny' });
  assertEquals(short.guestInstallId, null);
  assertMatch(short.requestId, /^[0-9a-f-]{36}$/);
  assertEquals(parseExtractRequest({ url: 'x', force_extract: 'true' }).forceExtract, false);
});

Deno.test('a photo: data URL mime, image_mime, whitespace removed, and too large', () => {
  const fromDataUrl = parseExtractRequest({ image_base64: ` data:image/png;base64,${PHOTO} ` });
  assertEquals([fromDataUrl.imageBase64, fromDataUrl.imageMime], [PHOTO, 'image/png']);

  const plain = parseExtractRequest({ imageBase64: `${PHOTO}\n${PHOTO}`, image_mime: 'image/webp' });
  assertEquals([plain.imageBase64, plain.imageMime], [PHOTO + PHOTO, 'image/webp']);
  assertEquals(parseExtractRequest({ image_base64: PHOTO, image_mime: 'text/plain' }).imageMime, 'image/jpeg');

  // 80 characters or fewer is no photo at all.
  assertEquals(rejection({ image_base64: 'a'.repeat(80) }), MISSING);
  assertEquals(rejection({ image_base64: 'a'.repeat(2_000_001) }), error400('Image is too large. Try a smaller photo.'));
});

Deno.test('a PDF is decoded, and a bad one gets its failed 200', () => {
  const parsed = parseExtractRequest({ pdf_base64: pdfBase64('x'.repeat(80)) });
  assertEquals(parsed.pdf?.bytes.length, 9 + 80);

  const [status, body] = rejection({ pdfBase64: btoa('not a pdf'.repeat(20)) });
  assertEquals(status, 200);
  assertEquals(Object.keys(JSON.parse(body)), ['status', 'platform', 'code', 'message', 'tokens_charged']);
  assertEquals(JSON.parse(body).code, 'pdf_unreadable');

  // A photo wins over a PDF; the PDF isn't even read.
  assertEquals(parseExtractRequest({ image_base64: PHOTO, pdf_base64: 'garbage'.repeat(20) }).pdf, null);
});

Deno.test('a text is read only without a link, photo or PDF', () => {
  assertEquals(parseExtractRequest({ text: `  ${RECIPE}  ` }).recipeText, RECIPE);
  assertEquals(parseExtractRequest({ url: 'https://example.com', text: 'short' }).recipeText, null);

  const [status, body] = rejection({ text: 'too short' });
  assertEquals([status, JSON.parse(body).platform, JSON.parse(body).code], [200, 'text', 'text_too_short']);
  assertEquals(JSON.parse(rejection({ text: 'x'.repeat(MAX_RECIPE_TEXT_CHARS + 1) })[1]).code, 'text_too_long');
  assertEquals(rejection({ text: 42 }), MISSING);
});

Deno.test('a body that is not an object is invalid JSON; an empty one is missing input', () => {
  assertEquals(rejection(null), error400('Invalid JSON body'));
  assertEquals(rejection({}), MISSING);
  assertEquals(rejection([]), MISSING);
  assertEquals(rejection('https://youtu.be/abc'), MISSING);
  assertEquals(rejection({ url: '   ' }), MISSING);
});
