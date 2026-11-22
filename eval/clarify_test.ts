// npx -y deno test -A --no-lock --unstable-sloppy-imports eval/clarify_test.ts

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';

import {
  answersFor,
  bestThreshold,
  type CaseResult,
  type ClarifyCase,
  type GateRow,
  isRightDish,
  outcomeAt,
  summarize,
} from './clarify.ts';

const veal: ClarifyCase = {
  id: 'clarify-u-wiener-schnitzel',
  group: 'unclear',
  title: 'File:Wiener-Schnitzel02.jpg',
  dish: 'Veal schnitzel',
  answer: ['veal', 'עגל'],
  accept: ['veal', 'עגל'],
};
const pizza: ClarifyCase = {
  id: 'clarify-c-margherita',
  group: 'clear',
  title: 'File:Margherita Originale.JPG',
  dish: 'Margherita pizza',
  answer: ['pizza'],
  accept: ['pizza'],
};

const MEAT = { question: 'Which meat?', options: ['Pork', 'Chicken', 'Veal'] };
const METHOD = { question: 'Fried or baked?', options: ['Fried', 'Baked'] };

function gate(confidence: number | null, questions = [MEAT]): GateRow {
  return { confidence, candidates: ['Pork schnitzel', 'Veal schnitzel'], questions, dishGuess: 'Schnitzel', kind: 'plated_dish', ms: 1000, costUsd: 0.0001 };
}

Deno.test('answersFor picks the chip that matches the label, in either language', () => {
  assertEquals(answersFor(veal, [MEAT]), [{ question: 'Which meat?', answer: 'Veal', other: false }]);
  assertEquals(answersFor(veal, [{ question: 'איזה בשר?', options: ['חזיר', 'עוף', 'עגל'] }]), [
    { question: 'איזה בשר?', answer: 'עגל', other: false },
  ]);
});

Deno.test('answersFor skips a question no chip matches, instead of typing the real dish', () => {
  assertEquals(answersFor(veal, [METHOD]), []);
  assertEquals(answersFor(veal, [METHOD, MEAT]).map((a) => a.answer), ['Veal']);
});

Deno.test('isRightDish looks at the title and the ingredients, ignoring case', () => {
  assert(isRightDish(veal, { title: 'Wiener Schnitzel', ingredients: [{ name: 'VEAL cutlets' }] }));
  assert(isRightDish(veal, { title: 'שניצל עגל', ingredients: [] }));
  assertFalse(isRightDish(veal, { title: 'Pork Schnitzel', ingredients: [{ name: 'pork loin' }] }));
  assertFalse(isRightDish(veal, null));
});

function result(testCase: ClarifyCase, g: GateRow, rightWithout: boolean, rightWith: boolean): CaseResult {
  return { testCase, gate: g, answers: answersFor(testCase, g.questions), rightWithout, rightWith };
}

Deno.test('outcomeAt uses the answered recipe only when the case asks at that threshold', () => {
  const r = result(veal, gate(0.55), false, true);
  assertEquals(outcomeAt(r, 0.5), { asked: false, right: false });
  assertEquals(outcomeAt(r, 0.7), { asked: true, right: true });
});

Deno.test('a gate error never asks and keeps the recipe without answers', () => {
  const r = result(veal, { ...gate(null, []), kind: 'error', error: 'timeout' }, true, true);
  assertEquals(outcomeAt(r, 0.8), { asked: false, right: true });
});

Deno.test('summarize counts asks and right dishes per group', () => {
  const s = summarize([result(veal, gate(0.55), false, true), result(pizza, gate(0.95, []), true, true)], 0.7);
  assertEquals(s, {
    unclear: 1, clear: 1, askedUnclear: 1, askedClear: 0, rightUnclear: 1, rightClear: 1, usefulQuestions: 1, asked: 1,
  });
});

Deno.test('bestThreshold skips thresholds where clear photos ask too often', () => {
  // Ten clear photos: at 0.8 two of them ask (20%), which breaks the 10% rule even though it finds one more veal.
  const clear = Array.from({ length: 10 }, (_, i) =>
    result({ ...pizza, id: `c${i}` }, gate(i < 2 ? 0.75 : 0.95, [{ question: 'Base?', options: ['Thin', 'Thick'] }]), true, true));
  const results = [result(veal, gate(0.75), false, true), ...clear];
  assertEquals(summarize(results, 0.8).askedClear, 2);
  assertEquals(bestThreshold(results), 0.5);
});

Deno.test('bestThreshold prefers the lower threshold on a tie (asks less)', () => {
  const results = [result(veal, gate(0.55), false, true), result(pizza, gate(0.95, []), true, true)];
  assertEquals(bestThreshold(results), 0.6);
});
