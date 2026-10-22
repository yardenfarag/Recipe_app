import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import * as shared from '../../supabase/functions/_shared/appliances';
import {
  ALTERNATIVE_KEYS,
  APPLIANCE_CATALOG,
  APPLIANCE_KEYS,
  BENEFIT_KEYS,
  isApplianceKey,
  isSpecialAppliance,
  MAX_PINCH_TIPS,
  MAX_RECIPE_APPLIANCES,
  normalizeApplianceName,
  resolveApplianceKey,
  sanitizeRecipeAppliances,
} from './appliances';

const STEPS = [1, 2, 3, 4];

describe('appliance catalog', () => {
  it('has 32 unique keys in snake_case', () => {
    expect(APPLIANCE_KEYS).toHaveLength(32);
    expect(new Set(APPLIANCE_KEYS).size).toBe(APPLIANCE_KEYS.length);
    for (const key of APPLIANCE_KEYS) expect(key).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it('marks only stovetop, oven and microwave as basic', () => {
    const basic = APPLIANCE_KEYS.filter((key) => !isSpecialAppliance(key));
    expect(basic).toEqual(['stovetop', 'oven', 'microwave']);
  });

  it('maps every alias to exactly one key', () => {
    const owner = new Map<string, string>();
    for (const key of APPLIANCE_KEYS) {
      for (const name of [key, ...APPLIANCE_CATALOG[key].aliases]) {
        const normalized = normalizeApplianceName(name);
        expect(normalized, `${key}: "${name}" normalizes to empty`).not.toBe('');
        const previous = owner.get(normalized);
        expect(previous === undefined || previous === key, `"${name}" is claimed by ${previous} and ${key}`).toBe(true);
        owner.set(normalized, key);
      }
    }
  });

  it('has aliases in every app language', () => {
    const scripts = { he: /[֐-׿]/, ru: /[Ѐ-ӿ]/, ar: /[؀-ۿ]/ };
    for (const key of APPLIANCE_KEYS) {
      const aliases = APPLIANCE_CATALOG[key].aliases;
      for (const [language, script] of Object.entries(scripts)) {
        expect(aliases.some((alias) => script.test(alias)), `${key} has no ${language} alias`).toBe(true);
      }
    }
  });

  it('keeps benefit and alternative keys distinct from appliance keys', () => {
    for (const key of [...BENEFIT_KEYS, ...ALTERNATIVE_KEYS]) expect(isApplianceKey(key)).toBe(false);
  });

  it('does not treat object prototype names as keys', () => {
    expect(isApplianceKey('constructor')).toBe(false);
    expect(isApplianceKey('toString')).toBe(false);
  });
});

describe('resolveApplianceKey', () => {
  it.each([
    ['oven', 'oven'],
    ['Air-Fryer', 'air_fryer'],
    ['KitchenAid', 'stand_mixer'],
    ['Instant Pot', 'pressure_cooker'],
    ['Mortar & Pestle', 'mortar_and_pestle'],
    ['mortar and pestle', 'mortar_and_pestle'],
    ['Fogón', 'stovetop'],
    ['  BLENDER  ', 'blender'],
    ['מכתש', 'mortar_and_pestle'],
    ['מִיקְרוֹגַל', 'microwave'],
    ['Ступка', 'mortar_and_pestle'],
    ['هَاوُن', 'mortar_and_pestle'],
    ['mortero', 'mortar_and_pestle'],
  ])('resolves "%s" to %s', (name, key) => {
    expect(resolveApplianceKey(name)).toBe(key);
  });

  it.each([['pasta machine'], [''], ['   '], [42], [null], [undefined], [{ key: 'oven' }]])(
    'returns null for %j',
    (name) => {
      expect(resolveApplianceKey(name)).toBeNull();
    },
  );
});

describe('sanitizeRecipeAppliances', () => {
  const oven = { key: 'oven', required: true, steps: [2], origin: 'source' };
  const mortar = {
    key: 'mortar_and_pestle',
    required: false,
    benefit: 'richer_flavor',
    alternative: 'pre_ground',
    steps: [1],
    origin: 'source',
  };

  describe('not analysed vs needs nothing', () => {
    it.each([[null], [undefined], ['oven'], [{ key: 'oven' }], [42]])('returns null for %j', (value) => {
      expect(sanitizeRecipeAppliances(value, STEPS)).toBeNull();
    });

    it('returns [] for an empty list', () => {
      expect(sanitizeRecipeAppliances([], STEPS)).toEqual([]);
    });

    it('returns null when the recipe has no steps to ground appliances in', () => {
      expect(sanitizeRecipeAppliances([oven], [])).toBeNull();
      expect(sanitizeRecipeAppliances([], [0, -1, 1.5])).toBeNull();
    });

    it('returns null, not [], when every item was invalid', () => {
      expect(sanitizeRecipeAppliances([{ key: 'pasta_machine', required: true, steps: [1] }], STEPS)).toBeNull();
    });
  });

  it('keeps valid items as they are', () => {
    expect(sanitizeRecipeAppliances([oven, mortar], STEPS)).toEqual([
      { key: 'oven', required: true, steps: [2], origin: 'source' },
      {
        key: 'mortar_and_pestle',
        required: false,
        benefit: 'richer_flavor',
        alternative: 'pre_ground',
        steps: [1],
        origin: 'source',
      },
    ]);
  });

  it('defaults a missing origin to source', () => {
    expect(sanitizeRecipeAppliances([{ key: 'oven', required: true, steps: [1] }], STEPS)?.[0].origin).toBe('source');
  });

  describe('drops items it cannot trust', () => {
    it.each([
      ['an unknown key', { ...oven, key: 'pasta_machine' }],
      ['a free-text name instead of a key', { ...oven, key: 'Oven' }],
      ['a missing required flag', { key: 'oven', steps: [1] }],
      ['a non-boolean required flag', { ...oven, required: 'yes' }],
      ['an unknown origin', { ...oven, origin: 'guess' }],
      ['a required tip', { ...oven, origin: 'tip' }],
      ['no steps', { ...oven, steps: [] }],
      ['only steps that do not exist', { ...oven, steps: [9, 0] }],
      ['steps that are not integers', { ...oven, steps: ['2', 2.5] }],
      ['a string item', 'oven'],
      ['a null item', null],
      ['an array item', [oven]],
    ])('%s', (_label, item) => {
      expect(sanitizeRecipeAppliances([item, mortar], STEPS)?.map((a) => a.key)).toEqual(['mortar_and_pestle']);
    });
  });

  it('keeps only the steps that exist, sorted and unique', () => {
    const [item] = sanitizeRecipeAppliances([{ ...oven, steps: [4, 9, 2, 2, 0] }], STEPS) ?? [];
    expect(item.steps).toEqual([2, 4]);
  });

  it('removes a benefit from a required item', () => {
    const [item] = sanitizeRecipeAppliances([{ ...oven, benefit: 'faster' }], STEPS) ?? [];
    expect(item.benefit).toBeUndefined();
  });

  it('removes unknown benefits and alternatives but keeps the item', () => {
    const [item] = sanitizeRecipeAppliances([{ ...mortar, benefit: 'yummier', alternative: 'a rock' }], STEPS) ?? [];
    expect(item.key).toBe('mortar_and_pestle');
    expect(item.benefit).toBeUndefined();
    expect(item.alternative).toBeUndefined();
  });

  it('accepts another appliance as the alternative, but not the item itself', () => {
    const blender = { key: 'blender', required: true, steps: [3] };
    expect(sanitizeRecipeAppliances([{ ...blender, alternative: 'immersion_blender' }], STEPS)?.[0].alternative).toBe(
      'immersion_blender',
    );
    expect(sanitizeRecipeAppliances([{ ...blender, alternative: 'blender' }], STEPS)?.[0].alternative).toBeUndefined();
  });

  it('merges a key listed twice, keeping the stronger claim and both steps', () => {
    const result = sanitizeRecipeAppliances(
      [
        { key: 'stand_mixer', required: false, benefit: 'less_effort', alternative: 'by_hand', steps: [3], origin: 'tip' },
        { key: 'stand_mixer', required: true, steps: [1] },
      ],
      STEPS,
    );
    expect(result).toEqual([
      { key: 'stand_mixer', required: true, alternative: 'by_hand', steps: [1, 3], origin: 'source' },
    ]);
  });

  it('orders required first, then by first step, then catalog order', () => {
    const result = sanitizeRecipeAppliances(
      [
        { key: 'kitchen_scale', required: false, benefit: 'more_precise', steps: [1] },
        { key: 'blender', required: true, steps: [3] },
        { key: 'oven', required: true, steps: [3] },
        { key: 'stovetop', required: true, steps: [2] },
      ],
      STEPS,
    );
    expect(result?.map((a) => a.key)).toEqual(['stovetop', 'oven', 'blender', 'kitchen_scale']);
  });

  describe('Pinch tips', () => {
    const tip = (key: string, step: number) => ({ key, required: false, benefit: 'more_precise', steps: [step], origin: 'tip' });

    it(`keeps at most ${MAX_PINCH_TIPS}`, () => {
      const result = sanitizeRecipeAppliances(
        [tip('kitchen_thermometer', 1), tip('kitchen_scale', 2), tip('zester', 3), oven],
        STEPS,
      );
      expect(result?.filter((a) => a.origin === 'tip').map((a) => a.key)).toEqual(['kitchen_thermometer', 'kitchen_scale']);
      expect(result?.some((a) => a.key === 'oven')).toBe(true);
    });

    it('drops every tip when tips are off', () => {
      expect(sanitizeRecipeAppliances([tip('kitchen_thermometer', 1), oven], STEPS, { allowTips: false })).toEqual([
        { key: 'oven', required: true, steps: [2], origin: 'source' },
      ]);
    });

    it('returns null when tips are off and only tips were given', () => {
      expect(sanitizeRecipeAppliances([tip('kitchen_thermometer', 1)], STEPS, { allowTips: false })).toBeNull();
    });
  });

  it(`caps the list at ${MAX_RECIPE_APPLIANCES}`, () => {
    const many = APPLIANCE_KEYS.slice(0, 20).map((key) => ({ key, required: true, steps: [1] }));
    expect(sanitizeRecipeAppliances(many, STEPS)).toHaveLength(MAX_RECIPE_APPLIANCES);
  });

  it('does not mutate its input', () => {
    const input = [{ ...oven, steps: [4, 2, 9] }, { ...mortar }];
    const snapshot = structuredClone(input);
    sanitizeRecipeAppliances(input, STEPS);
    expect(input).toEqual(snapshot);
  });
});

describe('app and Edge Function copies', () => {
  it('are byte-identical', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const read = (relative: string) => readFileSync(path.join(here, relative), 'utf8');
    expect(read('../../supabase/functions/_shared/appliances.ts')).toBe(read('./appliances.ts'));
  });

  it('behave the same', () => {
    const input = [
      { key: 'oven', required: true, steps: [2] },
      { key: 'mortar_and_pestle', required: false, benefit: 'richer_flavor', steps: [1], origin: 'tip' },
    ];
    expect(shared.sanitizeRecipeAppliances(input, STEPS)).toEqual(sanitizeRecipeAppliances(input, STEPS));
    expect(shared.resolveApplianceKey('מכתש')).toBe(resolveApplianceKey('מכתש'));
  });
});
