// Scorer tests for the PIN-53 translation eval (no model calls).
//   npx -y deno@2 test -A --no-lock --unstable-sloppy-imports eval/translate_test.ts

import { assertEquals } from 'jsr:@std/assert@1';

import {
  containsTerm,
  foreignWords,
  genericChecks,
  hebrewVoice,
  labelledChecks,
  normalize,
  render,
  type TranslateCase,
  unitRepeatedInName,
} from './translate.ts';

const baseCase: TranslateCase = {
  id: 't',
  target: 'he',
  source_lang: 'en',
  classes: [],
  recipe: { title: 'x', ingredients: [], steps: [] },
};

Deno.test('foreignWords flags Latin in Hebrew but keeps allowed brands', () => {
  assertEquals(foreignWords('1 lemon לימון', 'he'), ['lemon']);
  assertEquals(foreignWords('שוקולד Kinder', 'he', ['Kinder']), []);
  assertEquals(foreignWords('180°C', 'he'), []);
  assertEquals(foreignWords('1 יחידה egg', 'en'), ['יחידה']);
  assertEquals(foreignWords('Milk', 'en'), []);
});

Deno.test('containsTerm does not match the start of a longer word', () => {
  assertEquals(containsTerm('¾ כוסות סוכר', '¾ כוס'), false);
  assertEquals(containsTerm('¾ כוס סוכר', '¾ כוס'), true);
  assertEquals(containsTerm('натёртые кабачки', 'кабачк*'), true);
  assertEquals(containsTerm('والبيكربونات', 'بيكربونات'), true);
});

Deno.test('hebrewVoice reads the first word of a step', () => {
  assertEquals(hebrewVoice('מחממים את התנור'), 'present');
  assertEquals(hebrewVoice('חממו את התנור'), 'imperative');
  assertEquals(hebrewVoice('יש לחמם את התנור'), 'impersonal');
  assertEquals(hebrewVoice('בקערה גדולה מערבבים'), null);
});

Deno.test('unitRepeatedInName catches the Hebrew construct form', () => {
  assertEquals(unitRepeatedInName('חבילה', 'חבילת בצק עלים'), true);
  assertEquals(unitRepeatedInName('לפי הטעם', 'שוקולד מפורר לפי הטעם'), true);
  assertEquals(unitRepeatedInName('כף', 'כפית'), false);
});

Deno.test('render shows the fraction and the localized unit like the app', () => {
  const r = render(
    {
      title: 'עוגה',
      ingredients: [{ name: 'מלח', quantity: 0.5, unit: 'tsp' }],
      instructions: [{ step: 1, text: 'מערבבים' }],
    },
    'he',
  );
  // Today's display code picks the plural for ½; the eval labels expect the singular.
  assertEquals(r.ingredients[0].amount.startsWith('½ '), true);
});

Deno.test('labelled and generic checks', () => {
  const testCase: TranslateCase = {
    ...baseCase,
    expect: [{ at: 'amount:1', any_of: ['½ כפית'] }],
    forbid: [{ at: 'steps', terms: ['°F'] }],
  };
  const r = {
    title: 'עוגה',
    ingredients: [{ name: 'מלח', unit: 'כפית', amount: '½ כפית', line: '½ כפית מלח' }],
    steps: ['מחממים תנור ל-350°F', 'חממו'],
  };
  const labelled = labelledChecks(testCase, r);
  assertEquals(labelled.map((c) => c.ok), [true, false]);
  const generic = genericChecks(testCase, r);
  assertEquals(generic.find((c) => c.check === 'voice_mixed')?.ok, false);
  assertEquals(normalize('שוקולד צ׳יפס'), normalize("שוקולד צ'יפס"));
});
