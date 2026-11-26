import { assertEquals } from 'jsr:@std/assert@1';

import { resolveRecipeSourceLanguage } from './recipeSourceLanguage.ts';
import { languagesToTranslate, sameTranslationText, translateOrKeep, translationSourceFrom } from './translationTargets.ts';

const soup = {
  title: 'Lentil soup',
  ingredients: [{ name: 'lentils', quantity: 1, unit: 'cup' }],
  instructions: [{ step: 1, text: 'Simmer' }],
};

Deno.test('languagesToTranslate: every app language but its own and those it has', () => {
  assertEquals(languagesToTranslate('en', []), ['he', 'ar', 'ru', 'es']);
  assertEquals(languagesToTranslate('he', ['en', 'ru']), ['ar', 'es']);
  // A recipe in a language the apps aren't in goes into all five.
  assertEquals(languagesToTranslate('fr', []), ['en', 'he', 'ar', 'ru', 'es']);
});

Deno.test('sameTranslationText: case and spaces aside, the same title, ingredients and steps', () => {
  assertEquals(
    sameTranslationText(soup, {
      title: ' lentil Soup',
      ingredients: [{ name: 'Lentils ', quantity: 1, unit: 'CUP' }, { name: '' }],
      instructions: [{ step: 1, text: 'simmer ' }],
    }),
    true,
  );
  assertEquals(sameTranslationText(soup, { ...soup, title: 'Dal' }), false);
  assertEquals(sameTranslationText(soup, { ...soup, ingredients: [{ name: 'lentils', quantity: 2, unit: 'cup' }] }), false);
  assertEquals(sameTranslationText(soup, { ...soup, instructions: [{ step: 1, text: 'Boil' }] }), false);
  assertEquals(sameTranslationText({ title: 'Soup', ingredients: [], instructions: [] }, { title: 'Soup', ingredients: [], instructions: [] }), false);
});

Deno.test('translationSourceFrom: named ingredients with a number and steps with text', () => {
  assertEquals(
    translationSourceFrom({
      title: ' Soup ',
      ingredients: [{ name: 'salt', quantity: 1, unit: ' tsp ' }, { name: ' ', quantity: 1 }, { name: 'water', quantity: 'lots' }],
      instructions: [{ step: 1, text: ' Stir ', timestamp_seconds: 12.4 }, { step: 2, text: '' }],
    }),
    {
      title: 'Soup',
      ingredients: [{ name: 'salt', quantity: 1, unit: 'tsp' }],
      instructions: [{ step: 1, text: 'Stir', timestamp_seconds: 12 }],
    },
  );
  assertEquals(translationSourceFrom({ title: '', ingredients: soup.ingredients, instructions: [] }), null);
  assertEquals(translationSourceFrom({ title: 'Soup', ingredients: [], instructions: [] }), null);
});

Deno.test('translateOrKeep: text already in the language is kept, with no call', async () => {
  let calls = 0;
  const translate = () => {
    calls += 1;
    return Promise.resolve({ title: 'x', ingredients: [], instructions: [], usage: null });
  };
  const hebrew = {
    title: 'מרק עדשים',
    ingredients: [{ name: 'עדשים כתומות', quantity: 1, unit: 'כוס' }],
    instructions: [{ step: 1, text: 'מבשלים את העדשים עד שהן רכות.' }],
  };
  assertEquals((await translateOrKeep(hebrew, 'he', translate)).title, 'מרק עדשים');
  assertEquals(calls, 0);
  await translateOrKeep(hebrew, 'en', translate);
  assertEquals(calls, 1);
});

Deno.test('resolveRecipeSourceLanguage: script wins, a wrong script label is not trusted, Latin markers', () => {
  assertEquals(resolveRecipeSourceLanguage({ ...soup, title: 'מרק', source_language: 'en' }), 'he');
  assertEquals(resolveRecipeSourceLanguage({ ...soup, source_language: 'he' }), 'en');
  assertEquals(resolveRecipeSourceLanguage({ ...soup, source_language: 'es-ES' }), 'es');
  assertEquals(
    resolveRecipeSourceLanguage({
      title: 'Mercimek çorbası',
      ingredients: [{ name: 'mercimek', unit: 'su bardağı' }],
      instructions: [{ text: 'Soğanı ekleyin ve 10 dakika pişirin.' }],
      source_language: 'en',
    }),
    'tr',
  );
  assertEquals(resolveRecipeSourceLanguage({ ...soup, source_language: null }), 'en');
});
