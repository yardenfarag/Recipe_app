import { assertEquals } from 'jsr:@std/assert@1';

import { MAX_ITEMS_PER_PHOTO, parsePantryScan } from './pantryScan.ts';

const row = (over: Record<string, unknown> = {}) => ({
  name: 'קטשופ',
  name_en: 'Ketchup',
  brand: 'Heinz',
  aisle: 'pantry',
  confidence: 'high',
  container_unknown: false,
  ...over,
});

Deno.test('a clean answer comes through with the English name in lower case', () => {
  const result = parsePantryScan({ photo_quality: 'ok', items: [row()] });
  assertEquals(result, {
    quality: 'ok',
    truncated: false,
    items: [{ name: 'קטשופ', nameEn: 'ketchup', brand: 'Heinz', aisle: 'pantry', confidence: 'high', containerUnknown: false }],
  });
});

Deno.test('a photo that is not a kitchen never carries items', () => {
  assertEquals(parsePantryScan({ photo_quality: 'not_kitchen', items: [row()] }).items, []);
});

Deno.test('unknown enum values fall back to the careful reading', () => {
  const result = parsePantryScan({
    photo_quality: 'fuzzy',
    items: [row({ aisle: 'drinks', confidence: 'medium' })],
  });
  assertEquals(result.quality, 'ok');
  assertEquals([result.items[0].aisle, result.items[0].confidence], ['other', 'low']);
});

Deno.test('the same product listed twice is kept once, and empty names are dropped', () => {
  const result = parsePantryScan({
    photo_quality: 'ok',
    items: [row(), row({ name: 'Ketchup', name_en: ' KETCHUP ' }), row({ name: ' ', name_en: '' }), null, 'milk'],
  });
  assertEquals(result.items.map((i) => i.nameEn), ['ketchup']);
});

Deno.test('one missing name is filled from the other', () => {
  const result = parsePantryScan({ photo_quality: 'ok', items: [row({ name: '' }), row({ name: 'Milk', name_en: '' })] });
  assertEquals(result.items.map((i) => [i.name, i.nameEn]), [['ketchup', 'ketchup'], ['Milk', 'milk']]);
});

Deno.test('an unidentified container is never marked as sure', () => {
  const result = parsePantryScan({ photo_quality: 'ok', items: [row({ container_unknown: true, confidence: 'high' })] });
  assertEquals([result.items[0].containerUnknown, result.items[0].confidence], [true, 'low']);
});

Deno.test('a very crowded shelf is cut at the limit and says so', () => {
  const items = Array.from({ length: MAX_ITEMS_PER_PHOTO + 5 }, (_, i) => row({ name: `item ${i}`, name_en: `item ${i}` }));
  const result = parsePantryScan({ photo_quality: 'ok', items });
  assertEquals([result.items.length, result.truncated], [MAX_ITEMS_PER_PHOTO, true]);
});

Deno.test('an answer that is not an object reads as an empty, usable photo', () => {
  assertEquals(parsePantryScan(null), { quality: 'ok', items: [], truncated: false });
});
