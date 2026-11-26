import { describe, expect, it } from 'vitest';

import type { PantryItem, ScanItem, ScanPhoto } from '../types/pantry';
import type { Recipe } from '../types/recipe';
import {
  daysSince,
  foodWords,
  groupByPlaceAndAisle,
  homeCovers,
  lastScannedByPlace,
  mergeScanPhotos,
  notSeenInScan,
  pantryHomeNames,
  pantryItemsUsedBy,
  pantryNameKey,
  rankCookable,
} from './pantry';

const scanItem = (name: string, over: Partial<ScanItem> = {}): ScanItem => ({
  name,
  name_en: name,
  brand: '',
  aisle: 'pantry',
  confidence: 'high',
  container_unknown: false,
  ...over,
});

const photo = (items: ScanItem[], over: Partial<ScanPhoto> = {}): ScanPhoto => ({
  id: over.id ?? `p${Math.random()}`,
  scan_id: 's1',
  place: 'fridge',
  quality: 'ok',
  items,
  truncated: false,
  from_phone: false,
  created_at: '2026-11-26T10:00:00Z',
  ...over,
});

const saved = (name: string, over: Partial<PantryItem> = {}): PantryItem => ({
  id: name,
  name,
  nameEn: name,
  brand: '',
  place: 'fridge',
  aisle: 'other',
  source: 'scan',
  addedAt: '2026-11-01T00:00:00Z',
  lastSeenAt: '2026-11-20T00:00:00Z',
  ...over,
});

const recipe = (title: string, ingredients: string[]): Recipe =>
  ({ id: title, title, ingredients: ingredients.map((name) => ({ name })) }) as unknown as Recipe;

describe('pantryNameKey', () => {
  it('matches the database key: the English name when there is one', () => {
    expect(pantryNameKey('חלב', ' Whole  Milk ')).toBe('whole milk');
    expect(pantryNameKey(' Tahini ')).toBe('tahini');
  });
});

describe('mergeScanPhotos', () => {
  it('lists a product seen in two photos once, sure if either photo was sure', () => {
    const rows = mergeScanPhotos([
      photo([scanItem('milk', { confidence: 'low' })]),
      photo([scanItem('Milk', { brand: 'Tnuva' })], { created_at: '2026-11-26T10:01:00Z' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'milk', sure: true, brand: 'Tnuva' });
  });

  it('keeps the same product in two places, unknown containers apart, and skips non-kitchen photos', () => {
    const rows = mergeScanPhotos([
      photo([scanItem('peas'), scanItem('tub', { container_unknown: true }), scanItem('tub', { container_unknown: true })]),
      photo([scanItem('peas')], { place: 'freezer' }),
      photo([scanItem('dog toy')], { quality: 'not_kitchen' }),
    ]);
    expect(rows.map((r) => `${r.place}:${r.name}:${r.sure}`)).toEqual([
      'fridge:peas:true',
      'fridge:tub:false',
      'fridge:tub:false',
      'freezer:peas:true',
    ]);
  });
});

describe('groupByPlaceAndAisle', () => {
  it('orders places, then aisles in shopping order, then names', () => {
    const rows = mergeScanPhotos([
      photo([scanItem('rice'), scanItem('apple', { aisle: 'produce' }), scanItem('flour')], { place: 'cupboard' }),
      photo([scanItem('milk', { aisle: 'dairy' })]),
    ]);
    const groups = groupByPlaceAndAisle(rows);
    expect(groups.map((g) => g.place)).toEqual(['fridge', 'cupboard']);
    expect(groups[1].aisles.map((a) => [a.aisle, a.items.map((i) => i.name)])).toEqual([
      ['produce', ['apple']],
      ['pantry', ['flour', 'rice']],
    ]);
  });
});

describe('notSeenInScan', () => {
  it('asks only about scanned items in the places this scan covered', () => {
    const reviewed = mergeScanPhotos([photo([scanItem('milk')])]);
    const items = [
      saved('milk'),
      saved('butter'),
      saved('eggs', { source: 'manual' }),
      saved('rice', { place: 'cupboard' }),
    ];
    expect(notSeenInScan(items, reviewed, ['fridge']).map((i) => i.name)).toEqual(['butter']);
  });
});

describe('dates', () => {
  it('counts whole days and the last scan of each place', () => {
    expect(daysSince('2026-11-20T00:00:00Z', Date.parse('2026-11-23T12:00:00Z'))).toBe(3);
    expect(daysSince(null)).toBeNull();
    expect(lastScannedByPlace([saved('a'), saved('b', { lastSeenAt: '2026-11-25T00:00:00Z' }), saved('c', { source: 'manual', lastSeenAt: '2026-11-26T00:00:00Z' })])).toEqual({
      fridge: '2026-11-25T00:00:00Z',
    });
  });
});

describe('homeCovers', () => {
  const covers = (home: string, ingredient: string) => homeCovers(foodWords(home), foodWords(ingredient));

  it('matches whole words and plurals, never parts of words', () => {
    expect(covers('egg', 'large eggs')).toBe(true);
    expect(covers('milk', 'whole milk')).toBe(true);
    expect(covers('pea', 'peanut butter')).toBe(false);
    expect(covers('tomatoes', 'cherry tomato')).toBe(true);
  });

  it('a kind of something covers the plain thing, by its main word', () => {
    expect(covers('brown sugar', 'sugar')).toBe(true);
    expect(covers('coconut oil', 'oil')).toBe(true);
    expect(covers('pepper sauce', 'pepper')).toBe(false);
    expect(covers('coconut oil', 'olive oil')).toBe(false);
    expect(covers('סוכר חום', 'סוכר')).toBe(true);
    expect(covers('רוטב שום', 'שום')).toBe(false);
  });

  it('a form of what is at home is covered, another product made from it is not', () => {
    expect(covers('garlic', 'garlic cloves')).toBe(true);
    expect(covers('chicken', 'chicken breasts')).toBe(true);
    expect(covers('chicken', 'chicken stock')).toBe(false);
    expect(covers('lemon', 'lemon juice')).toBe(false);
    expect(covers('garlic', 'garlic powder')).toBe(false);
    expect(covers('tomatoes', 'tomato paste')).toBe(false);
    expect(covers('butter', 'peanut butter')).toBe(false);
    expect(covers('milk', 'coconut milk')).toBe(false);
    expect(covers('peanut butter', 'peanut butter')).toBe(true);
    expect(covers('שום', 'שום כתוש')).toBe(true);
    expect(covers('עוף', 'ציר עוף')).toBe(false);
  });

  it('ignores accents and punctuation', () => {
    expect(covers("za'atar", 'Zaatar')).toBe(true);
    expect(covers('jalapeño', 'jalapeno peppers')).toBe(true);
  });
});

describe('rankCookable', () => {
  const home = ['eggs', 'milk', 'flour', 'butter', 'brown sugar'];

  it('puts recipes with the fewest missing first and leaves out the far ones', () => {
    const ranked = rankCookable(
      [
        recipe('Cake', ['flour', 'sugar', 'eggs', 'butter', 'vanilla']),
        recipe('Crepes', ['eggs', 'milk', 'flour', 'water', 'salt']),
        recipe('Curry', ['chicken', 'coconut milk', 'curry paste', 'rice', 'onion']),
      ],
      home,
    );
    expect(ranked.map((r) => [r.recipe.title, r.have, r.total, r.missing])).toEqual([
      ['Crepes', 3, 3, []],
      ['Cake', 4, 5, ['vanilla']],
    ]);
  });

  it('counts the staples and both names of each pantry item', () => {
    const names = pantryHomeNames([saved('חלב', { nameEn: 'milk' })], ['olive oil']);
    expect(names).toEqual(['חלב', 'milk', 'olive oil']);
    expect(rankCookable([recipe('Salad', ['olive oil', 'milk'])], names)[0].missing).toEqual([]);
  });
});

describe('pantryItemsUsedBy', () => {
  it('finds the pantry items a recipe used', () => {
    const items = [saved('eggs'), saved('ketchup'), saved('חלב', { nameEn: 'milk' })];
    expect(pantryItemsUsedBy(recipe('Crepes', ['2 eggs', 'milk', 'flour']), items).map((i) => i.name)).toEqual([
      'eggs',
      'חלב',
    ]);
  });
});
