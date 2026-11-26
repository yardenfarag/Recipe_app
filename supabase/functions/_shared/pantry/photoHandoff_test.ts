import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';

import {
  fromByteaHex,
  type HandoffRow,
  handoffState,
  hashHandoffToken,
  isHandoffToken,
  newHandoffToken,
  toByteaHex,
} from './photoHandoff.ts';

const row = (over: Partial<HandoffRow> = {}): HandoffRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  purpose: 'pantry',
  scan_id: '00000000-0000-4000-8000-000000000003',
  place: 'fridge',
  language: 'he',
  expires_at: '2026-11-26T12:15:00Z',
  connected_at: null,
  closed_at: null,
  photo_at: null,
  ...over,
});
const at = Date.parse('2026-11-26T12:05:00Z');

Deno.test('tokens are 32 url-safe characters and never repeat', () => {
  const a = newHandoffToken();
  assertEquals(isHandoffToken(a), true);
  assertNotEquals(a, newHandoffToken());
  assertEquals(isHandoffToken('short'), false);
  assertEquals(isHandoffToken(`${a.slice(0, 31)}/`), false);
});

Deno.test('only the hash is stored, and it is stable', async () => {
  const token = newHandoffToken();
  assertEquals(await hashHandoffToken(token), await hashHandoffToken(token));
  assertEquals((await hashHandoffToken(token)).length, 64);
});

Deno.test('the computer sees the phone connect, send a photo, and the link run out', () => {
  assertEquals(handoffState(row(), at), 'waiting');
  assertEquals(handoffState(row({ connected_at: '2026-11-26T12:01:00Z' }), at), 'connected');
  assertEquals(handoffState(row({ connected_at: '2026-11-26T12:01:00Z', photo_at: '2026-11-26T12:02:00Z' }), at), 'photo_ready');
  assertEquals(handoffState(row({ closed_at: '2026-11-26T12:03:00Z' }), at), 'closed');
  assertEquals(handoffState(row(), Date.parse('2026-11-26T12:15:00Z')), 'expired');
});

Deno.test('bytea hex survives the round trip', () => {
  const bytes = new Uint8Array([0, 1, 127, 128, 255]);
  assertEquals(toByteaHex(bytes), '\\x00017f80ff');
  assertEquals(fromByteaHex(toByteaHex(bytes)), bytes);
});
