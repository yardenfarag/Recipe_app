import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { parseShareRequest } from './recipeShareRequest.ts';

/** The exact status and body a request gets. */
function rejection(raw: string): [number, string] {
  try {
    parseShareRequest(raw);
  } catch (err) {
    if (err instanceof HttpError) return [err.status, JSON.stringify(err.body)];
    throw err;
  }
  throw new Error('expected a rejection');
}

const error400 = (message: string): [number, string] => [400, JSON.stringify({ error: message })];

Deno.test('a valid request comes back as sent', () => {
  assertEquals(parseShareRequest('{"action":"get","token":" abc "}'), { action: 'get', token: ' abc ' });
  for (const action of ['create', 'get', 'claim', 'revoke', 'status']) {
    assertEquals(parseShareRequest(JSON.stringify({ action })).action, action);
  }
});

Deno.test('an empty body is invalid JSON, as before', () => {
  assertEquals(rejection(''), error400('Invalid JSON body'));
});

Deno.test('the size limit counts real bytes and comes before the JSON check', () => {
  const fits = JSON.stringify({ action: 'get', token: 'x'.repeat(32_000 - 30) });
  assertEquals(parseShareRequest(fits).action, 'get');
  assertEquals(rejection('{' + 'x'.repeat(32_000)), error400('Request payload is too large'));
  // Hebrew letters are two bytes each: 16,001 of them are over the limit in bytes, not in characters.
  assertEquals(rejection(JSON.stringify('א'.repeat(16_001))), error400('Request payload is too large'));
});

Deno.test('bad JSON and unknown actions keep their old bodies', () => {
  assertEquals(rejection('{"action":'), error400('Invalid JSON body'));
  assertEquals(rejection('{}'), error400('Invalid action'));
  assertEquals(rejection('{"action":"delete"}'), error400('Invalid action'));
  assertEquals(rejection('[]'), error400('Invalid action'));
  assertEquals(rejection('"get"'), error400('Invalid action'));
  assertEquals(rejection('5'), error400('Invalid action'));
});

Deno.test('JSON null throws a TypeError (a 500), as before', () => {
  assertThrows(() => parseShareRequest('null'), TypeError);
});
