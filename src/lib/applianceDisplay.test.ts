import { describe, expect, it } from 'vitest';

import {
  applianceAlternativeKey,
  applianceNameKey,
  applianceSteps,
  cardApplianceKeys,
  groupAppliances,
} from './applianceDisplay';
import { ALTERNATIVE_KEYS, APPLIANCE_KEYS, BENEFIT_KEYS, type RecipeAppliance } from './appliances';
import { recipeCardToExtracted, recipeCardToListRecipe } from './recipeCardMap';
import ar from '@/i18n/locales/ar';
import en from '@/i18n/locales/en';
import es from '@/i18n/locales/es';
import he from '@/i18n/locales/he';
import ru from '@/i18n/locales/ru';
import type { RecipeCard } from '@/types/recipeCard';

const item = (key: string, required: boolean, origin: 'source' | 'tip' = 'source', steps = [1]) =>
  ({ key, required, steps, origin }) as RecipeAppliance;

const OVEN = item('oven', true);
const AIR_FRYER = item('air_fryer', true);
const BLENDER = item('blender', true);
const MIXER = { ...item('stand_mixer', false), benefit: 'less_effort', alternative: 'by_hand' } as RecipeAppliance;
const THERMOMETER_TIP = { ...item('kitchen_thermometer', false, 'tip'), benefit: 'juicier_meat' } as RecipeAppliance;

describe('groupAppliances', () => {
  it('puts required items first and optional ones under "Makes it better", tips last', () => {
    expect(groupAppliances([THERMOMETER_TIP, OVEN, MIXER])).toEqual({
      required: [OVEN],
      better: [MIXER, THERMOMETER_TIP],
    });
  });

  it('handles an empty list', () => {
    expect(groupAppliances([])).toEqual({ required: [], better: [] });
  });
});

describe('cardApplianceKeys ("Needs: …" on list cards)', () => {
  it('shows special, required appliances in recipe order, at most two', () => {
    expect(cardApplianceKeys([OVEN, AIR_FRYER, BLENDER, item('ice_cream_maker', true)])).toEqual(['air_fryer', 'blender']);
  });

  it('never shows basics, optional items or Pinch tips', () => {
    expect(cardApplianceKeys([OVEN, item('stovetop', true), item('microwave', true), MIXER, THERMOMETER_TIP])).toEqual([]);
  });

  it('shows nothing for a recipe that was not analysed', () => {
    expect(cardApplianceKeys(null)).toEqual([]);
  });
});

describe('applianceSteps', () => {
  it('returns the cited steps with their text, in Hebrew and English', () => {
    const he = [
      { step: 1, text: 'מחממים תנור ל-180 מעלות.' },
      { step: 2, text: 'מקציפים במיקסר.' },
      { step: 3, text: 'אופים 35 דקות.' },
    ];
    expect(applianceSteps(item('oven', true, 'source', [1, 3]), he)).toEqual([he[0], he[2]]);
    expect(applianceSteps(item('blender', true, 'source', [2]), [{ step: 1, text: 'Add fruit.' }, { step: 2, text: 'Blend.' }])).toEqual([
      { step: 2, text: 'Blend.' },
    ]);
  });

  it('skips a cited step that the displayed steps no longer have', () => {
    expect(applianceSteps(item('oven', true, 'source', [1, 9]), [{ step: 1, text: 'Bake.' }])).toEqual([{ step: 1, text: 'Bake.' }]);
  });
});

describe('i18n keys', () => {
  it('maps a workaround to its phrase and another appliance to its name', () => {
    expect(applianceAlternativeKey('by_hand')).toBe('appliances.alternatives.by_hand');
    expect(applianceAlternativeKey('immersion_blender')).toBe('appliances.names.immersion_blender');
    expect(applianceAlternativeKey(undefined)).toBeNull();
    expect(applianceNameKey('wok')).toBe('appliances.names.wok');
  });

  const locales = { en, es, he, ru, ar } as const;
  it.each(Object.entries(locales))('%s translates every appliance, benefit and workaround', (_lang, strings) => {
    const section = (strings as unknown as { appliances: Record<string, Record<string, string>> }).appliances;
    for (const key of APPLIANCE_KEYS) expect(section.names[key], key).toMatch(/\S/);
    for (const key of BENEFIT_KEYS) expect(section.benefits[key], key).toMatch(/\S/);
    for (const key of ALTERNATIVE_KEYS) expect(section.alternatives[key], key).toMatch(/\S/);
  });

  it('Hebrew names are written in Hebrew and English names in English', () => {
    for (const key of APPLIANCE_KEYS) {
      expect(he.appliances.names[key], key).toMatch(/[א-ת]/);
      expect(en.appliances.names[key], key).toMatch(/^[A-Z][A-Za-z &-]*$/);
    }
  });
});

describe('Hub card mapping keeps appliances', () => {
  const card = {
    id: 'c1',
    title: 'Soup',
    platform: 'web',
    original_url: 'https://example.com',
    ingredients: [],
    instructions: [{ step: 1, text: 'Blend.' }],
    servings: 2,
    extraction_status: 'full',
    tags: [],
    save_count: 0,
    extract_hit_count: 0,
    created_at: '2026-10-23T00:00:00Z',
    canonical_key: 'web:x',
    canonical_url: 'https://example.com',
    appliances: [BLENDER],
  } as unknown as RecipeCard;

  it('for the detail screen and the list row', () => {
    expect(recipeCardToExtracted(card).appliances).toEqual([BLENDER]);
    expect(recipeCardToListRecipe(card).appliances).toEqual([BLENDER]);
  });

  it('as null for a card from before PIN-26', () => {
    const { appliances: _drop, ...old } = card;
    expect(recipeCardToExtracted(old as RecipeCard).appliances).toBeNull();
  });
});
