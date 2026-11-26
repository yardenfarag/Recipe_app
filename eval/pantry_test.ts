// npx -y deno test -A --no-lock --unstable-sloppy-imports eval/pantry_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import type { PantryScanItem, PantryScanResult } from '../supabase/functions/_shared/pantry/pantryScan.ts';
import { containsPhrase, normalizeName, type PantryCase, scoreCase, totals } from './pantry.ts';

const cupboard: PantryCase = {
  id: 'cupboard',
  source: 'own',
  market: 'il',
  place: 'cupboard',
  strict: true,
  quality: ['ok'],
  expect: [
    { any_of: ['sugar'], brand: true },
    { any_of: ['brown sugar'], brand: true },
    { any_of: ['pea'], brand: true },
    { any_of: ['rice'], brand: false },
  ],
  also_ok: ['flour', 'carrot'],
  never: ['salmon oil', 'pet'],
};

const item = (nameEn: string, confidence: 'high' | 'low' = 'high', containerUnknown = false): PantryScanItem => ({
  name: nameEn,
  nameEn,
  brand: '',
  aisle: 'pantry',
  confidence,
  containerUnknown,
});

const answer = (items: PantryScanItem[], quality: PantryScanResult['quality'] = 'ok'): PantryScanResult => ({
  quality,
  items,
  truncated: false,
});

Deno.test('names are compared without case, accents, punctuation or plurals', () => {
  assertEquals(normalizeName("Za'atar"), 'zaatar');
  assertEquals(normalizeName('Tomatoes & Peas'), 'tomato and pea');
  assertEquals(normalizeName('Jalapeño peppers'), 'jalapeno pepper');
  assertEquals(normalizeName('hummus'), 'hummus');
});

Deno.test('a phrase matches whole words only', () => {
  assertEquals(containsPhrase('canned peas and carrots', 'pea'), true);
  assertEquals(containsPhrase('peanut butter', 'pea'), false);
  assertEquals(containsPhrase('petit pois', 'pet'), false);
});

Deno.test('the longest phrase wins, so brown sugar and white sugar each find their own entry', () => {
  const s = scoreCase(cupboard, answer([item('white sugar'), item('brown sugar'), item('rice')]));
  assertEquals(s.matched.map((m) => m.name).sort(), ['brown sugar', 'rice', 'white sugar']);
  assertEquals(s.missed, ['pea']);
  assertEquals([s.brandExpected, s.brandMatched], [3, 2]);
});

Deno.test('a second name for a matched entry, and anything in also_ok, is not made up', () => {
  const s = scoreCase(cupboard, answer([item('sugar'), item('caster sugar'), item('carrots'), item('butter')]));
  assertEquals(s.alsoOk.map((m) => m.name), ['caster sugar', 'carrots']);
  assertEquals(s.unmatched.map((m) => m.name), ['butter']);
});

Deno.test('a forbidden item is caught before anything else, and unknown containers count for nothing', () => {
  const s = scoreCase(cupboard, answer([item('salmon oil'), item('white tub', 'low', true), item('rice')]));
  assertEquals(s.forbidden, ['salmon oil']);
  assertEquals(s.containers, 1);
  assertEquals(s.matched.map((m) => m.name), ['rice']);
});

Deno.test('the photo verdict is right when it is one of the accepted ones', () => {
  assertEquals(scoreCase(cupboard, answer([], 'too_dark')).qualityOk, false);
  assertEquals(scoreCase({ ...cupboard, quality: ['ok', 'too_dark'] }, answer([], 'too_dark')).qualityOk, true);
  assertEquals(scoreCase(cupboard, null).qualityOk, false);
});

Deno.test('totals: made-up items count on strict photos only, and a forbidden item lowers the share of right items', () => {
  const web: PantryCase = { ...cupboard, id: 'web', strict: false, never: [] };
  const rows = [
    { testCase: cupboard, score: scoreCase(cupboard, answer([item('sugar'), item('butter'), item('jam', 'low'), item('salmon oil')])), failed: false },
    { testCase: web, score: scoreCase(web, answer([item('rice'), item('olive oil')])), failed: false },
  ];
  const t = totals(rows);
  assertEquals([t.madeUp, t.madeUpSure, t.unchecked, t.forbidden], [2, 1, 1, 1]);
  assertEquals(t.strictListed, 4);
  assertEquals(t.precision, 0.25);
  assertEquals([t.matched, t.expected], [2, 8]);
});
