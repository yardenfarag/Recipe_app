import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';

import en from '../../i18n/locales/en';
import type { Recipe } from '../../types/recipe';
import { buildCookbookDocument, cookbookCopy } from './cookbookDocument';
import { isRtlLanguage } from './buildCookbookHtml';

const i18n = createInstance();
void i18n.init({ lng: 'en', resources: { en: { translation: en } }, initAsync: false, interpolation: { escapeValue: false } });
const t = i18n.t.bind(i18n);

const recipe = (overrides: Partial<Recipe>): Recipe => ({
  id: 'r1',
  title: 'Lemon Pasta',
  ingredients: [{ name: 'pasta', quantity: 200, unit: 'g' }],
  instructions: [{ step: 1, text: 'Boil the pasta.' }],
  servings: 2,
  extraction_status: 'full',
  source_language: 'en',
  platform: 'web',
  original_url: 'https://www.example.com/pasta',
  ...overrides,
});

const sections = (html: string) => html.match(/<section class="recipe"[^>]*>/g) ?? [];

describe('cookbookCopy', () => {
  it('says one recipe or many', () => {
    expect(cookbookCopy(t, 1).recipeCount).toBe('1 recipe');
    expect(cookbookCopy(t, 12).recipeCount).toBe('12 recipes');
  });
});

describe('isRtlLanguage', () => {
  it('knows the right-to-left languages', () => {
    expect(isRtlLanguage('he')).toBe(true);
    expect(isRtlLanguage('ar-EG')).toBe(true);
    expect(isRtlLanguage('en')).toBe(false);
    expect(isRtlLanguage(undefined)).toBe(false);
  });
});

describe('buildCookbookDocument', () => {
  it('puts the recipes in the order given, with their photos, servings and source', () => {
    const html = buildCookbookDocument({
      title: '  Family book ',
      recipes: [recipe({ id: 'a', title: 'Soup' }), recipe({ id: 'b', title: 'Cake', servings: 0 })],
      images: ['https://cdn.example.com/soup.jpg?w=1&h=2', null],
      language: 'en',
      measurementSystem: 'original',
      pageSize: 'a4',
      t,
    });

    expect(html).toContain('<title>Family book</title>');
    expect(html).toContain('2 recipes');
    expect(html.indexOf('Soup')).toBeLessThan(html.indexOf('Cake'));
    expect(html).toContain('src="https://cdn.example.com/soup.jpg?w=1&amp;h=2"');
    expect(html).toContain('data-cookbook-fallback="image"');
    expect(html).toContain('2 servings');
    expect(html).toContain('example.com');
    expect(html).toContain('Made with Pinch');
    expect(html).toContain('dir="ltr"');
  });

  it('reads right to left in Hebrew and Arabic', () => {
    for (const language of ['he', 'ar'] as const) {
      const html = buildCookbookDocument({
        title: 'ספר',
        recipes: [recipe({ title: 'פסטה', ingredients: [{ name: 'פסטה', quantity: 1, unit: '' }], instructions: [{ step: 1, text: 'לבשל' }], source_language: language })],
        language,
        measurementSystem: 'metric',
        pageSize: 'a4',
        t,
      });
      expect(html).toContain(`<html lang="${language}" dir="rtl">`);
    }
  });

  it('keeps a Hebrew recipe right to left inside an English book, and an English one left to right in a Hebrew book', () => {
    const hebrew = recipe({ title: 'שקשוקה', ingredients: [{ name: 'ביצים', quantity: 4, unit: '' }], instructions: [{ step: 1, text: 'לטגן' }], source_language: 'he' });
    const english = buildCookbookDocument({ title: 'Book', recipes: [hebrew, recipe({})], language: 'en', measurementSystem: 'original', pageSize: 'letter', t });
    const [first, second] = sections(english);
    expect(first).toContain('lang="he"');
    expect(first).toContain('dir="rtl"');
    expect(second).not.toContain('dir=');

    const inHebrew = buildCookbookDocument({ title: 'ספר', recipes: [recipe({})], language: 'he', measurementSystem: 'original', pageSize: 'a4', t });
    expect(sections(inHebrew)[0]).toContain('dir="ltr"');
  });

  it('uses the translation in the book language, and its direction', () => {
    const translated = recipe({
      source_language: 'en',
      translations: { he: { title: 'פסטה לימון', ingredients: [{ name: 'פסטה', quantity: 200, unit: 'g' }], instructions: [{ step: 1, text: 'לבשל את הפסטה.' }] } },
    });
    const html = buildCookbookDocument({ title: 'ספר', recipes: [translated], language: 'he', measurementSystem: 'original', pageSize: 'a4', t });
    expect(html).toContain('פסטה לימון');
    expect(html).toContain('לבשל את הפסטה.');
    expect(sections(html)[0]).not.toContain('dir=');
  });

  it('leaves photos and placeholders out when asked', () => {
    const html = buildCookbookDocument({
      title: 'Book',
      recipes: [recipe({}), recipe({ id: 'r2' })],
      images: ['https://cdn.example.com/a.jpg', null],
      language: 'en',
      measurementSystem: 'original',
      pageSize: 'a4',
      includePhotos: false,
      t,
    });
    expect(html).not.toContain('class="hero"');
    expect(html).not.toContain('data-cookbook-fallback');
  });
});
