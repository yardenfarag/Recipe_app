// npx deno test -A --no-lock supabase/functions/_shared/extraction/imageSize_test.ts

import { assertEquals } from 'jsr:@std/assert@1';
import { encode as encodePng } from 'npm:fast-png@6.3.0';
import jpeg from 'npm:jpeg-js@0.4.4';

import { rankImageCandidates, readDimension, readImageSize, sizeFromUrl } from './imageSize.ts';

function jpegOf(width: number, height: number): Uint8Array {
  const data = new Uint8Array(width * height * 4).fill(200);
  return new Uint8Array(jpeg.encode({ data, width, height }, 80).data);
}

/** A JPEG with an APP1 (EXIF) block before the frame, as phone photos have. */
function withExifBlock(bytes: Uint8Array): Uint8Array {
  const exif = new Uint8Array([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const out = new Uint8Array(bytes.length + exif.length);
  out.set(bytes.subarray(0, 2));
  out.set(exif, 2);
  out.set(bytes.subarray(2), 2 + exif.length);
  return out;
}

function bytesOf(...parts: (string | number[])[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...[...part].map((c) => c.charCodeAt(0)));
    else out.push(...part);
  }
  return new Uint8Array(out);
}

const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

Deno.test('reads a JPEG size, also behind an EXIF block', () => {
  assertEquals(readImageSize(jpegOf(300, 400)), { width: 300, height: 400 });
  assertEquals(readImageSize(withExifBlock(jpegOf(64, 32))), { width: 64, height: 32 });
});

Deno.test('reads a PNG size', () => {
  const png = encodePng({ width: 225, height: 150, data: new Uint8Array(225 * 150 * 4), channels: 4 });
  assertEquals(readImageSize(png), { width: 225, height: 150 });
});

Deno.test('reads WebP sizes (lossy, lossless, extended)', () => {
  const lossy = bytesOf('RIFF', [0, 0, 0, 0], 'WEBPVP8 ', [0, 0, 0, 0], [0, 0, 0, 0x9d, 0x01, 0x2a], [0xb0, 0x04, 0x80, 0x07]);
  assertEquals(readImageSize(lossy), { width: 1200, height: 1920 });

  const w = 1079;
  const h = 1349;
  const bits = w | (h << 14);
  const lossless = bytesOf('RIFF', [0, 0, 0, 0], 'WEBPVP8L', [0, 0, 0, 0], [0x2f], [bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff], [0, 0, 0, 0, 0]);
  assertEquals(readImageSize(lossless), { width: 1080, height: 1350 });

  const extended = bytesOf('RIFF', [0, 0, 0, 0], 'WEBPVP8X', [0, 0, 0, 0], [0, 0, 0, 0], le24(224), le24(224));
  assertEquals(readImageSize(extended), { width: 225, height: 225 });
});

Deno.test('reads GIF and AVIF sizes', () => {
  assertEquals(readImageSize(bytesOf('GIF89a', [0x40, 0x01, 0xf0, 0x00], [0, 0, 0])), { width: 320, height: 240 });
  const avif = bytesOf(be32(24), 'ftypavif', [0, 0, 0, 0], 'mif1avif', be32(20), 'ispe', [0, 0, 0, 0], be32(1080), be32(1920));
  assertEquals(readImageSize(avif), { width: 1080, height: 1920 });
});

Deno.test('anything else has no size', () => {
  assertEquals(readImageSize(new Uint8Array(2048).fill(7)), null);
  assertEquals(readImageSize(new Uint8Array([0xff, 0xd8, 0xff])), null);
  assertEquals(readImageSize(new Uint8Array()), null);
});

Deno.test('a WordPress file name gives its size; a date or an id does not', () => {
  assertEquals(sizeFromUrl('https://site.com/wp-content/uploads/2013/06/seafood-stew-109-225x225.jpg'), {
    width: 225,
    height: 225,
  });
  assertEquals(sizeFromUrl('https://site.com/uploads/2023/09/Beef-Stew-main.jpg'), null);
  assertEquals(sizeFromUrl('https://site.com/img/1200x630/photo.jpg?w=10'), null);
});

Deno.test('ranks sharp pictures first, the one nearest 1080 leading', () => {
  assertEquals(
    rankImageCandidates([
      { url: 'https://s.com/a-225x225.jpg' },
      { url: 'https://s.com/a-500x375.jpg' },
      { url: 'https://s.com/a.jpg' },
      { url: 'https://s.com/og.jpg', width: 1200, height: 1200 },
      { url: 'https://s.com/huge.jpg', width: 4000, height: 3000 },
      { url: 'https://s.com/mid.jpg', width: 800, height: 800 },
    ]),
    [
      'https://s.com/og.jpg',
      'https://s.com/huge.jpg',
      'https://s.com/mid.jpg',
      'https://s.com/a.jpg',
      'https://s.com/a-500x375.jpg',
      'https://s.com/a-225x225.jpg',
    ],
  );
});

Deno.test('pictures of unknown size keep the source order, without repeats or blanks', () => {
  assertEquals(
    rankImageCandidates([{ url: 'https://s.com/b.jpg' }, { url: ' ' }, { url: 'https://s.com/a.jpg' }, { url: 'https://s.com/b.jpg' }]),
    ['https://s.com/b.jpg', 'https://s.com/a.jpg'],
  );
});

Deno.test('reads a width written as a number, a string or a QuantitativeValue', () => {
  assertEquals(readDimension(1200), 1200);
  assertEquals(readDimension('1200px'), 1200);
  assertEquals(readDimension({ '@type': 'QuantitativeValue', value: 630 }), 630);
  assertEquals(readDimension('wide'), undefined);
  assertEquals(readDimension(0), undefined);
});
