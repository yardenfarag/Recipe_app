import { assertEquals, assertThrows } from 'jsr:@std/assert@1';

import { HttpError } from '../core/httpError.ts';
import { bytesToBase64, parsePhoto, photoBytes, sniffPhotoMime } from './photoInput.ts';

const pad = (head: number[]) => bytesToBase64(new Uint8Array([...head, ...new Array(4000).fill(0)]));
const jpeg = pad([0xff, 0xd8, 0xff, 0xe0]);
const png = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = pad([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));

Deno.test('the type comes from the first bytes', () => {
  assertEquals([sniffPhotoMime(jpeg), sniffPhotoMime(png), sniffPhotoMime(webp)], ['image/jpeg', 'image/png', 'image/webp']);
  assertEquals(sniffPhotoMime(pad([0x25, 0x50, 0x44, 0x46])), null);
});

Deno.test('a data URL is unwrapped and its declared type ignored', () => {
  assertEquals(parsePhoto(`data:image/gif;base64,${jpeg}`), { base64: jpeg, mime: 'image/jpeg' });
});

Deno.test('a PDF, a tiny image, a huge one or a non-string is refused', () => {
  for (const raw of [pad([0x25, 0x50, 0x44, 0x46]), jpeg.slice(0, 100), 'A'.repeat(2_000_004), 42, 'not base64 !!!'.repeat(400)]) {
    const error = assertThrows(() => parsePhoto(raw), HttpError);
    assertEquals(error.code, 'invalid_photo');
  }
});

Deno.test('bytes survive the round trip', () => {
  assertEquals(bytesToBase64(photoBytes(jpeg)), jpeg);
});
