import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import en from '../i18n/locales/en';
import type { AvoidList } from './avoidList';
import { HUB_CONTAINS_KEYS, hubAvoidIsEmpty, hubAvoidOf, hubCardFlag, hubCardFlagLabel, hubCardFlagText } from './hubAvoid';

function serverContainsKeys(): string[] {
  const src = readFileSync(join(__dirname, '../../supabase/functions/_shared/recipes/enrich/recipeDiets.ts'), 'utf8');
  const block = src.match(/export const HUB_CONTAINS_KEYS = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error('HUB_CONTAINS_KEYS not found');
  return [...block[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
}

const t = ((key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) ?? key) as TFunction;

const none: AvoidList = { allergies: [], otherAllergies: [], dislikes: [] };

function card(names: string[], contains: string[] | null = null) {
  return { ingredients: names.map((name) => ({ name, quantity: 1, unit: '' })), contains };
}

describe('hubAvoidOf', () => {
  it('has the same food keys as the server, in the same order', () => {
    expect(serverContainsKeys()).toEqual([...HUB_CONTAINS_KEYS]);
  });

  it('turns chips and words it knows into keys, and keeps the rest as lower-case words', () => {
    const avoid = hubAvoidOf({
      allergies: ['sesame', 'peanuts'],
      otherAllergies: ['Арахис', 'Kiwi '],
      dislikes: ['Кинза', 'Onion', 'Blue cheese', 'onion'],
    });
    expect(avoid).toEqual({
      allergens: ['peanuts', 'sesame'],
      dislikes: ['cilantro', 'onion'],
      allergyWords: ['kiwi'],
      dislikeWords: ['blue cheese'],
    });
  });

  it('is empty for an empty list', () => {
    expect(hubAvoidIsEmpty(hubAvoidOf(none))).toBe(true);
  });
});

describe('hubCardFlag', () => {
  it('is null without an avoid list, or when nothing matches', () => {
    expect(hubCardFlag(card(['peanuts'], ['peanuts']), none)).toBeNull();
    expect(hubCardFlag(card(['rice']), { ...none, allergies: ['milk'] })).toBeNull();
  });

  it('flags an allergen the server found, even when the on-device matcher misses it', () => {
    const flag = hubCardFlag(card(['house sauce'], ['peanuts']), { ...none, allergies: ['peanuts'] });
    expect(flag).toEqual({ kind: 'allergy', items: [{ key: 'peanuts' }] });
  });

  it('flags an allergen the on-device matcher finds on a card the server has not checked', () => {
    const flag = hubCardFlag(card(['2 tbsp butter']), { ...none, allergies: ['milk'] });
    expect(flag).toEqual({ kind: 'allergy', items: [{ key: 'milk' }] });
  });

  it('lists each food once, and an allergy wins over a dislike', () => {
    const list: AvoidList = { allergies: ['milk'], otherAllergies: ['kiwi'], dislikes: ['Onion'] };
    const flag = hubCardFlag(card(['butter', 'kiwi', 'onion'], ['milk', 'onion']), list);
    expect(flag).toEqual({ kind: 'allergy', items: [{ key: 'milk' }, { typed: 'kiwi' }] });
  });

  it('flags dislikes when there is no allergy', () => {
    const flag = hubCardFlag(card(['onion', 'blue cheese']), { ...none, dislikes: ['Onion', 'blue cheese'] });
    expect(flag).toEqual({ kind: 'dislike', items: [{ key: 'onion' }, { typed: 'blue cheese' }] });
  });

  it('reads as food names, and as a sentence for a screen reader', () => {
    const flag = hubCardFlag(card(['peanuts', 'kiwi']), { ...none, allergies: ['peanuts'], otherAllergies: ['Kiwi'] });
    expect(flag).not.toBeNull();
    expect(hubCardFlagText(flag!, t)).toBe('Peanuts, Kiwi');
    expect(hubCardFlagLabel(flag!, t)).toBe('Has ingredients from your allergies: Peanuts, Kiwi');
  });
});
