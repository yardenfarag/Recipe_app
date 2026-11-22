import { describe, expect, it } from 'vitest';

import ar from '../i18n/locales/ar';
import en from '../i18n/locales/en';
import es from '../i18n/locales/es';
import he from '../i18n/locales/he';
import ru from '../i18n/locales/ru';

import {
  ALLERGEN_KEYS,
  DISLIKE_SUGGESTION_KEYS,
  MAX_AVOID_INSTRUCTION_CHARS,
  allergyInstruction,
  cleanAvoidItems,
  dislikeSuggestionFor,
  findAvoidMatches,
  fitInstruction,
  makeWithoutInstruction,
  type AllergenKey,
  type AvoidList,
} from './avoidList';

const NOTHING: AvoidList = { allergies: [], otherAllergies: [], dislikes: [] };

function allergensIn(name: string): AllergenKey[] {
  const matches = findAvoidMatches([name], { ...NOTHING, allergies: [...ALLERGEN_KEYS] });
  return matches.allergies.map((hit) => hit.allergen!).sort();
}

function dislikesIn(name: string, dislikes: string[]): string[] {
  return findAvoidMatches([name], { ...NOTHING, dislikes }).dislikes.map((hit) => hit.item);
}

describe('findAvoidMatches: allergens', () => {
  it.each<[string, AllergenKey[]]>([
    ['unsalted butter', ['milk']],
    ['Heavy cream', ['milk']],
    ['grated Parmesan', ['milk']],
    ['2 large eggs', ['eggs']],
    ['mayonnaise', ['eggs']],
    ['salmon fillets', ['fish']],
    ['anchovies', ['fish']],
    ['Worcestershire sauce', ['fish']],
    ['raw shrimp, peeled', ['shellfish']],
    ['oyster sauce', ['shellfish']],
    ['chopped walnuts', ['tree_nuts']],
    ['almond milk', ['tree_nuts']],
    ['basil pesto', ['tree_nuts']],
    ['creamy peanut butter', ['peanuts']],
    ['all-purpose flour', ['gluten']],
    ['spaghetti', ['gluten']],
    ['rolled oats', ['gluten']],
    ['soy sauce', ['gluten', 'soy']],
    ['firm tofu', ['soy']],
    ['toasted sesame oil', ['sesame']],
    ['tahini', ['sesame']],
    ['egg noodles', ['eggs', 'gluten']],
    ['almond butter', ['tree_nuts']],
  ])('%s', (name, expected) => {
    expect(allergensIn(name)).toEqual([...expected].sort());
  });

  it.each([
    'coconut milk',
    'eggplant',
    'butternut squash',
    'ground nutmeg',
    'cocoa butter',
    'cream of tartar',
    'rice flour',
    'gluten-free flour',
    'corn tortillas',
    'rice noodles',
    'water chestnuts',
    'oyster mushrooms',
    'vegan butter',
    'dairy-free cheese',
    'olive oil',
    'ginger beer',
    'creamy salsa verde',
    'coconut',
    'celery',
  ])('%s has none of the nine', (name) => {
    expect(allergensIn(name)).toEqual([]);
  });

  it('only reports allergens on the cook’s list', () => {
    const matches = findAvoidMatches(['butter', 'peanuts'], { ...NOTHING, allergies: ['peanuts'] });
    expect(matches.allergies).toEqual([{ item: 'peanuts', allergen: 'peanuts', ingredients: ['peanuts'] }]);
    expect(matches.byIngredient).toEqual([null, 'allergy']);
  });

  it('lists every ingredient behind one allergen', () => {
    const matches = findAvoidMatches(['butter', 'salt', 'whole milk'], { ...NOTHING, allergies: ['milk'] });
    expect(matches.allergies[0].ingredients).toEqual(['butter', 'whole milk']);
  });
});

describe('findAvoidMatches: other languages', () => {
  it.each<[string, AllergenKey[]]>([
    ['חמאה', ['milk']],
    ['שמנת מתוקה', ['milk']],
    ['גבינת שמנת', ['milk']],
    ['3 ביצים', ['eggs']],
    ['קמח לבן', ['gluten']],
    ['רוטב סויה', ['gluten', 'soy']],
    ['טחינה גולמית', ['sesame']],
    ['חמאת בוטנים', ['peanuts']],
    ['אגוזי מלך', ['tree_nuts']],
    ['פילה דג', ['fish']],
    ['mantequilla', ['milk']],
    ['huevos', ['eggs']],
    ['harina de trigo', ['gluten']],
    ['nueces picadas', ['tree_nuts']],
    ['salsa de soja', ['gluten', 'soy']],
    ['gambas peladas', ['shellfish']],
    ['сливочное масло', ['milk']],
    ['молока', ['milk']],
    ['яйца', ['eggs']],
    ['пшеничная мука', ['gluten']],
    ['грецкие орехи', ['tree_nuts']],
    ['соевый соус', ['gluten', 'soy']],
    ['креветки', ['shellfish']],
    ['الحليب', ['milk']],
    ['زبدة', ['milk']],
    ['بيض', ['eggs']],
    ['دقيق', ['gluten']],
    ['لوز مطحون', ['tree_nuts']],
    ['فول سوداني', ['peanuts']],
    ['طحينة', ['sesame']],
  ])('%s', (name, expected) => {
    expect(allergensIn(name)).toEqual([...expected].sort());
  });

  it.each([
    'חלב קוקוס',
    'אגוז מוסקט',
    'קמח שקדים',
    'קמח אורז',
    'ללא גלוטן קמח',
    'שמן זית',
    'leche de coco',
    'nuez moscada',
    'harina de maíz',
    'pasta de tomate',
    'aceite de oliva',
    'кокосовое молоко',
    'мускатный орех',
    'рисовая мука',
    'томатная паста',
    'сельдерей',
    'растительное масло',
    'حليب جوز الهند',
    'جوزة الطيب',
    'دقيق الذرة',
    'ماء حار',
  ])('%s is not milk, eggs, fish, shellfish, peanuts, gluten, soy or sesame', (name) => {
    const found = allergensIn(name).filter((key) => key !== 'tree_nuts');
    expect(found).toEqual([]);
  });

  it('does not call nutmeg or coconut a tree nut in any language', () => {
    for (const name of ['אגוז מוסקט', 'nuez moscada', 'мускатный орех', 'جوز الهند', 'جوز الطيب']) {
      expect(allergensIn(name)).toEqual([]);
    }
  });
});

describe('findAvoidMatches: typed items', () => {
  it('matches a typed dislike by name, forgiving plurals', () => {
    expect(dislikesIn('2 beets, roasted', ['beet'])).toEqual(['beet']);
    expect(dislikesIn('blueberries', ['blueberry'])).toEqual(['blueberry']);
    expect(dislikesIn('pearl barley', ['pear'])).toEqual([]);
  });

  it('uses the built-in word list when a typed dislike names one', () => {
    expect(dislikesIn('fresh coriander leaves', ['Cilantro'])).toEqual(['Cilantro']);
    expect(dislikesIn('ground coriander', ['Cilantro'])).toEqual([]);
    expect(dislikesIn('кинза', ['Cilantro'])).toEqual(['Cilantro']);
    expect(dislikesIn('extra virgin olive oil', ['olives'])).toEqual([]);
    expect(dislikesIn('kalamata olives', ['olives'])).toEqual(['olives']);
    expect(dislikesIn('פטריות שמפיניון', ['mushrooms'])).toEqual(['mushrooms']);
  });

  it('is cautious with a typed allergy', () => {
    const matches = findAvoidMatches(['cornstarch', 'celery stalks'], {
      ...NOTHING,
      otherAllergies: ['corn', 'celery'],
    });
    expect(matches.allergies.map((hit) => hit.item)).toEqual(['corn', 'celery']);
    expect(matches.byIngredient).toEqual(['allergy', 'allergy']);
  });

  it('marks an ingredient as an allergy when it is both', () => {
    const matches = findAvoidMatches(['peanut butter'], {
      allergies: ['peanuts'],
      otherAllergies: [],
      dislikes: ['peanut butter'],
    });
    expect(matches.byIngredient).toEqual(['allergy']);
    expect(matches.dislikes).toHaveLength(1);
  });

  it('finds nothing for an empty list', () => {
    expect(findAvoidMatches(['butter'], NOTHING)).toEqual({
      allergies: [],
      dislikes: [],
      byIngredient: [null],
    });
  });
});

describe('dislike suggestions', () => {
  const locales = { en, he, es, ru, ar };

  it.each(Object.entries(locales))('%s chip labels match their own word list', (_name, locale) => {
    for (const key of DISLIKE_SUGGESTION_KEYS) {
      expect(dislikeSuggestionFor(locale.avoid.suggestions[key])).toBe(key);
    }
  });

  it('does not treat an unrelated word as a suggestion', () => {
    expect(dislikeSuggestionFor('beets')).toBeNull();
    expect(dislikeSuggestionFor('')).toBeNull();
  });
});

describe('cleanAvoidItems', () => {
  it('drops blanks and repeats, and keeps the limit', () => {
    expect(cleanAvoidItems([' Celery ', 'celery', '', 3, 'Mustard', 'Kiwi'], 2)).toEqual(['Celery', 'Mustard']);
  });

  it('returns an empty list for anything that is not a list', () => {
    expect(cleanAvoidItems('celery', 5)).toEqual([]);
  });
});

describe('remix instructions', () => {
  it('names allergies first and stays inside the limit', () => {
    const list: AvoidList = { allergies: ['peanuts', 'milk'], otherAllergies: ['celery'], dislikes: ['olives'] };
    const matches = findAvoidMatches(['butter', 'kalamata olives'], list);
    const text = makeWithoutInstruction(list, matches)!;
    expect(text.startsWith('I am allergic to milk and dairy, peanuts, celery')).toBe(true);
    expect(text).toContain('I do not like olives');
    expect(text.length).toBeLessThanOrEqual(MAX_AVOID_INSTRUCTION_CHARS);
  });

  it('leaves out dislikes that are not in the recipe', () => {
    const list: AvoidList = { allergies: [], otherAllergies: [], dislikes: ['olives', 'garlic'] };
    const text = makeWithoutInstruction(list, findAvoidMatches(['garlic cloves'], list))!;
    expect(text).toContain('garlic');
    expect(text).not.toContain('olives');
  });

  it('asks to work around missing appliances, after allergies and dislikes', () => {
    const list: AvoidList = { allergies: ['peanuts'], otherAllergies: [], dislikes: ['olives'] };
    const matches = findAvoidMatches(['olives'], list);
    const text = makeWithoutInstruction(list, matches, 'My kitchen has no stand mixer: change the steps so I can make it without it')!;
    expect(text.indexOf('allergic')).toBeLessThan(text.indexOf('do not like'));
    expect(text.indexOf('do not like')).toBeLessThan(text.indexOf('stand mixer'));
    expect(text.endsWith('Keep the rest of the dish the same')).toBe(true);
  });

  it('works for appliances alone, with nothing on the avoid list', () => {
    const text = makeWithoutInstruction(NOTHING, findAvoidMatches(['flour'], NOTHING), 'My kitchen has no blender: change the steps so I can make it without it');
    expect(text).toBe('My kitchen has no blender: change the steps so I can make it without it. Keep the rest of the dish the same');
  });

  it('has no allergy sentence without allergies', () => {
    expect(allergyInstruction(NOTHING)).toBeNull();
  });

  it('drops a whole sentence that does not fit, never half of one', () => {
    expect(fitInstruction(['abc', 'defgh', 'ij'], 8)).toBe('abc. ij');
    expect(fitInstruction([null, null])).toBeNull();
  });
});
