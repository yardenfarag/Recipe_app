import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import { parseUuidCursor, readBackfillBody } from './backfillRequest.ts';
import { HttpError } from './httpError.ts';

const post = (body?: string, headers: Record<string, string> = {}) =>
  new Request('http://localhost/fn', { method: 'POST', body, headers });

const invalidJson = { error: 'Invalid JSON body' };
const badCursor = { error: 'after must be a next_cursor value' };

Deno.test('readBackfillBody: Content-Length 0 is an empty object', async () => {
  assertEquals(await readBackfillBody(post(undefined, { 'content-length': '0' })), {});
});

Deno.test('readBackfillBody: an empty body without Content-Length is invalid JSON', async () => {
  const err = await assertRejects(() => readBackfillBody(post()), HttpError);
  assertEquals([err.status, err.body], [400, invalidJson]);
});

Deno.test('readBackfillBody: parses JSON and returns non-objects as they are', async () => {
  assertEquals(await readBackfillBody(post('{"after":null,"limit":3}')), { after: null, limit: 3 });
  assertEquals(await readBackfillBody(post('null')), null);
  assertEquals(await readBackfillBody(post('[1]')), [1]);
});

Deno.test('readBackfillBody: bad JSON is the old 400', async () => {
  const err = await assertRejects(() => readBackfillBody(post('{nope')), HttpError);
  assertEquals([err.status, err.body], [400, invalidJson]);
});

Deno.test('parseUuidCursor: null or missing starts from the beginning', () => {
  assertEquals(parseUuidCursor(undefined), null);
  assertEquals(parseUuidCursor(null), null);
});

Deno.test('parseUuidCursor: keeps a row id', () => {
  const id = '0F8FAD5B-D9CB-469F-A165-70867728950E';
  assertEquals(parseUuidCursor(id), id);
});

Deno.test('parseUuidCursor: anything else is the old 400', () => {
  for (const value of ['', 'abc', 5, { id: 'x' }, false]) {
    const err = assertThrows(() => parseUuidCursor(value), HttpError);
    assertEquals([err.status, err.body], [400, badCursor]);
  }
});
