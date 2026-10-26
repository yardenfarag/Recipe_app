/**
 * Hebrew and English robustness for the appliance catalog, name matching and sanitizer.
 * Hebrew is the app's main right-to-left language: prefixed words, vowel points, final letters,
 * invisible direction marks and non-breaking spaces all show up in real copied recipe text.
 */
import { describe, expect, it } from 'vitest';

import {
  APPLIANCE_CATALOG,
  APPLIANCE_KEYS,
  numberedSteps,
  resolveApplianceKey,
  sanitizeRecipeAppliances,
} from './appliances';

const RLM = '\u200f';
const LRM = '\u200e';
const NBSP = '\u00a0';
const HEBREW = /[א-ת]/;

const hebrewAliases = APPLIANCE_KEYS.flatMap((key) =>
  APPLIANCE_CATALOG[key].aliases.filter((alias) => HEBREW.test(alias)).map((alias) => [alias, key] as const),
);
const englishAliases = APPLIANCE_KEYS.flatMap((key) =>
  [key.replace(/_/g, ' '), ...APPLIANCE_CATALOG[key].aliases]
    .filter((alias) => /^[a-z][a-z &]*$/.test(alias))
    .map((alias) => [alias, key] as const),
);

describe('Hebrew appliance names', () => {
  it('covers every appliance with at least one Hebrew name', () => {
    expect(new Set(hebrewAliases.map(([, key]) => key)).size).toBe(APPLIANCE_KEYS.length);
  });

  it.each(hebrewAliases)('"%s" resolves to %s', (alias, key) => {
    expect(resolveApplianceKey(alias)).toBe(key);
  });

  it.each(hebrewAliases)('"%s" still resolves to %s with a prefix (ב, ה, וב, ל)', (alias, key) => {
    for (const prefix of ['ב', 'ה', 'וב', 'ל']) {
      expect(resolveApplianceKey(prefix + alias), prefix + alias).toBe(key);
    }
  });

  it.each([
    ['בתנור', 'oven'],
    ['לתנור', 'oven'],
    ['במיקרוגל', 'microwave'],
    ['המיקסר', 'stand_mixer'],
    ['במיקסר ידני', 'hand_mixer'],
    ['בבלנדר', 'blender'],
    ['בבלנדר מוט', 'immersion_blender'],
    ['במעבד מזון', 'food_processor'],
    ['ובמכתש', 'mortar_and_pestle'],
    ['בסיר לחץ', 'pressure_cooker'],
    ['בסיר טיגון באוויר', 'air_fryer'],
    ['על הגריל', null],
    ['גריל', 'grill'],
    ['במנגל', 'grill'],
    ['בתבנית קפיצית', 'springform_pan'],
    ['מדחום בשר', 'kitchen_thermometer'],
    ['מטחנת קפה', 'spice_grinder'],
  ])('real phrase "%s" → %s', (phrase, key) => {
    expect(resolveApplianceKey(phrase)).toBe(key);
  });

  it('ignores vowel points (niqqud)', () => {
    expect(resolveApplianceKey('תַּנּוּר')).toBe('oven');
    expect(resolveApplianceKey('מִכְתָּשׁ')).toBe('mortar_and_pestle');
    expect(resolveApplianceKey('בְּבְּלֶנְדֶּר')).toBe('blender');
  });

  it('ignores invisible direction marks and non-breaking spaces from copied text', () => {
    expect(resolveApplianceKey(`${RLM}תנור${RLM}`)).toBe('oven');
    expect(resolveApplianceKey(`${LRM}סיר${NBSP}לחץ`)).toBe('pressure_cooker');
    expect(resolveApplianceKey(`  מעבד   מזון  `)).toBe('food_processor');
  });

  it.each([['בצל'], ['שמן'], ['מלח'], ['מים'], ['ביצים'], ['סוכר'], ['ב'], ['וב'], ['הה'], ['מחבת'], ['קערה'], ['סכין']])(
    'everyday word "%s" is not an appliance',
    (word) => {
      expect(resolveApplianceKey(word)).toBeNull();
    },
  );
});

describe('English appliance names', () => {
  it.each(englishAliases)('"%s" resolves to %s', (alias, key) => {
    expect(resolveApplianceKey(alias)).toBe(key);
  });

  it.each(englishAliases)('"%s" still resolves to %s after "the" or "a"', (alias, key) => {
    expect(resolveApplianceKey(`the ${alias}`)).toBe(key);
    expect(resolveApplianceKey(`A ${alias.toUpperCase()}`)).toBe(key);
  });

  it.each([
    ['Air-Fryer', 'air_fryer'],
    ['the Instant Pot', 'pressure_cooker'],
    ['KitchenAid', 'stand_mixer'],
    ['stick blender', 'immersion_blender'],
    ['Mortar & Pestle', 'mortar_and_pestle'],
    ['an instant-read thermometer', 'kitchen_thermometer'],
    ['cast-iron skillet', 'cast_iron_pan'],
    ['Crock-Pot', 'slow_cooker'],
  ])('real phrase "%s" → %s', (phrase, key) => {
    expect(resolveApplianceKey(phrase)).toBe(key);
  });

  it.each([['onion'], ['the onion'], ['salt'], ['a bowl'], ['knife'], ['frying pan'], ['spatula'], ['the'], ['a'], ['oven mitts']])(
    'everyday word "%s" is not an appliance',
    (word) => {
      expect(resolveApplianceKey(word)).toBeNull();
    },
  );
});

describe('numberedSteps with real Hebrew and English text', () => {
  it('cleans direction marks and odd spacing but keeps the Hebrew text', () => {
    expect(
      numberedSteps([
        { step: 1, text: `${RLM}מחממים תנור ל-180${NBSP}מעלות.${RLM}` },
        { step: 2, text: '  אופים   35 דקות  ' },
      ]),
    ).toEqual([
      { step: 1, text: 'מחממים תנור ל-180 מעלות.' },
      { step: 2, text: 'אופים 35 דקות' },
    ]);
  });

  it('treats Hebrew and English steps the same way', () => {
    const he = numberedSteps([{ text: 'מערבבים' }, { text: '' }, { text: 'מגישים' }]);
    const en = numberedSteps([{ text: 'Mix' }, { text: '' }, { text: 'Serve' }]);
    expect(he.map((s) => s.step)).toEqual([1, 3]);
    expect(en.map((s) => s.step)).toEqual([1, 3]);
  });
});

describe('sanitizing model answers for Hebrew and English recipes', () => {
  const hebrewCake = [
    { step: 1, text: 'מחממים תנור ל-180 מעלות.' },
    { step: 2, text: 'מקציפים חמאה וסוכר במיקסר עד לקבלת תערובת אוורירית.' },
    { step: 3, text: 'אופים 35 דקות.' },
  ];
  const englishSmoothie = [
    { step: 1, text: 'Add the banana, milk and honey to a blender.' },
    { step: 2, text: 'Blend until smooth.' },
  ];
  const steps = (list: { step: number }[]) => list.map((s) => s.step);

  it('keeps a grounded Hebrew answer and drops an invented step', () => {
    expect(
      sanitizeRecipeAppliances(
        [
          { key: 'oven', required: true, steps: [1, 3], origin: 'source' },
          { key: 'stand_mixer', required: false, benefit: 'less_effort', alternative: 'by_hand', steps: [2], origin: 'source' },
          { key: 'blender', required: true, steps: [4], origin: 'source' },
        ],
        steps(hebrewCake),
      ),
    ).toEqual([
      { key: 'oven', required: true, steps: [1, 3], origin: 'source' },
      { key: 'stand_mixer', required: false, benefit: 'less_effort', alternative: 'by_hand', steps: [2], origin: 'source' },
    ]);
  });

  it('keeps a grounded English answer', () => {
    expect(
      sanitizeRecipeAppliances([{ key: 'blender', required: true, steps: [1, 2] }], steps(englishSmoothie)),
    ).toEqual([{ key: 'blender', required: true, steps: [1, 2], origin: 'source' }]);
  });

  it('rejects a Hebrew or English name in place of a key', () => {
    expect(sanitizeRecipeAppliances([{ key: 'תנור', required: true, steps: [1] }], steps(hebrewCake))).toBeNull();
    expect(sanitizeRecipeAppliances([{ key: 'Blender', required: true, steps: [1] }], steps(englishSmoothie))).toBeNull();
  });
});
