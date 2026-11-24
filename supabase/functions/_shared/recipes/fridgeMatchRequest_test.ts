import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { parseFridgeMatchRequest } from './fridgeMatchRequest.ts';

const image = 'A'.repeat(100);

/** The exact 400 body a request gets. */
function rejection(body: unknown): [number, string] {
  try {
    parseFridgeMatchRequest(body);
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

Deno.test('fridgeMatchRequest: a missing, short or too-large image is the old 400', () => {
  const expected: [number, string] = [400, '{"error":"Missing or too-large image_base64"}'];
  assertEquals(rejection({ catalog: [] }), expected);
  assertEquals(rejection({ image_base64: 'short' }), expected);
  assertEquals(rejection({ image_base64: 'A'.repeat(2_000_001) }), expected);
  assertEquals(rejection({ image_base64: 'data:image/png;base64,' }), expected);
});

Deno.test('fridgeMatchRequest: reads a data URL, a bare image with its mime, and the camelCase names', () => {
  assertEquals(parseFridgeMatchRequest({ image_base64: `data:image/png;base64,${image}` }).imageMime, 'image/png');
  const bare = parseFridgeMatchRequest({ imageBase64: ` ${image}\n${image} `, image_mime: 'image/webp' });
  assertEquals(bare.imageBase64, image + image);
  assertEquals(bare.imageMime, 'image/webp');
  assertEquals(parseFridgeMatchRequest({ image_base64: image, image_mime: 'text/plain' }).imageMime, 'image/jpeg');
});

Deno.test('fridgeMatchRequest: cleans the catalog and the install id', () => {
  const parsed = parseFridgeMatchRequest({
    image_base64: image,
    guestInstallId: '  install-123  ',
    catalog: [
      { id: ' r1 ', title: ' Soup ', ingredientNames: [' Leek ', 3, ''], tags: [' Vegan '], time: 12.4 },
      { id: '', title: 'No id' },
      null,
    ],
  });
  assertEquals(parsed.catalog, [{ id: 'r1', title: 'Soup', ingredientNames: ['Leek'], tags: ['vegan'], time: 12 }]);
  assertEquals(parsed.guestInstallId, 'install-123');
  assertEquals(parseFridgeMatchRequest({ image_base64: image, catalog: 'x' }).catalog, []);
});

Deno.test('fridgeMatchRequest: past 80 rows the catalog is cut and loses its ingredients', () => {
  const rows = Array.from({ length: 81 }, (_, i) => ({ id: `r${i}`, title: 't', ingredientNames: ['egg'] }));
  const { catalog } = parseFridgeMatchRequest({ image_base64: image, catalog: rows });
  assertEquals(catalog.length, 80);
  assertEquals(catalog[0], { id: 'r0', title: 't' });
});

Deno.test('fridgeMatchRequest: a body that is not an object throws a TypeError (a 500), as before', () => {
  assertThrows(() => parseFridgeMatchRequest(null), TypeError);
});
