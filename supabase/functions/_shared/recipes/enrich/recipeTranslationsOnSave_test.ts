import { assertEquals } from 'jsr:@std/assert@1';

import type { HubPublishDecision } from '../recipeCards.ts';
import type { TranslateRecipeInput } from '../translateRecipe.ts';
import type { AppLanguage, TranslationContent } from '../translationTargets.ts';
import { type CardTranslationsState, translationsAfterExtract, type TranslationsOnSaveDeps } from './recipeTranslationsOnSave.ts';

const recipe = {
  title: 'Lentil soup',
  source_language: 'en',
  ingredients: [{ name: 'red lentils', quantity: 1, unit: 'cup' }, { name: 'onion', quantity: 1, unit: '' }],
  instructions: [{ step: 1, text: 'Chop the onion and fry it until soft.' }, { step: 2, text: 'Add the lentils and simmer.' }],
};

const content = (title: string): TranslationContent => ({ title, ingredients: [], instructions: [] });

const published: HubPublishDecision = { status: 'published', cardId: 'c1', canonicalKey: 'k', needsDiets: true, replaced: false };
const existing: HubPublishDecision = { status: 'existing', cardId: 'c1', canonicalKey: 'k', needsDiets: false, filled: [] };
const skipped: HubPublishDecision = { status: 'skipped', reason: 'opted_out' };

function fake(card: CardTranslationsState | null, failOn: AppLanguage[] = []) {
  const calls: string[] = [];
  const cardSaves: string[] = [];
  const remembered: Partial<Record<AppLanguage, TranslationContent>>[] = [];
  const deps: TranslationsOnSaveDeps = {
    readCard: (id) => {
      calls.push(`read:${id}`);
      return Promise.resolve(card);
    },
    translate: (input: TranslateRecipeInput) => {
      calls.push(`translate:${input.title}:${input.targetLanguage}`);
      if (failOn.includes(input.targetLanguage as AppLanguage)) return Promise.reject(new Error('timeout'));
      return Promise.resolve({ ...content(`${input.title} (${input.targetLanguage})`), usage: { model: 'm' } as never });
    },
    saveCard: (id, language, value) => {
      cardSaves.push(`${id}/${language}:${value.title}`);
      return Promise.resolve();
    },
    remember: (translations) => {
      remembered.push(translations);
      return Promise.resolve(0);
    },
  };
  return { deps, calls, cardSaves, remembered };
}

const sameCard = (translations: CardTranslationsState['translations'] = {}): CardTranslationsState => ({
  id: 'c1',
  text: { ...recipe, title: 'Lentil Soup ' },
  translations,
});

Deno.test('a new card with the same text: four calls serve the card and the cook', async () => {
  const { deps, calls, cardSaves, remembered } = fake(sameCard());
  const outcome = await translationsAfterExtract(published, recipe, 'u1', deps);
  assertEquals(calls.filter((c) => c.startsWith('translate')).length, 4);
  assertEquals(calls.includes('translate:Lentil Soup:en'), false);
  assertEquals(cardSaves.sort(), ['c1/ar:Lentil Soup (ar)', 'c1/es:Lentil Soup (es)', 'c1/he:Lentil Soup (he)', 'c1/ru:Lentil Soup (ru)']);
  assertEquals(Object.keys(remembered[0]).sort(), ['ar', 'es', 'he', 'ru']);
  assertEquals(outcome.sharedWithCard, true);
  assertEquals(outcome.calls, 4);
  assertEquals(outcome.cookLanguages, ['ar', 'es', 'he', 'ru']);
});

Deno.test('a card translated before: no model call, the cook takes its translations', async () => {
  const { deps, calls, cardSaves, remembered } = fake(
    sameCard({ he: content('מרק'), ar: content('شوربة'), ru: content('Суп'), es: content('Sopa') }),
  );
  const outcome = await translationsAfterExtract(existing, recipe, 'u1', deps);
  assertEquals(calls, ['read:c1']);
  assertEquals(cardSaves, []);
  assertEquals(remembered[0].he?.title, 'מרק');
  assertEquals(outcome.reusedFromCard.sort(), ['ar', 'es', 'he', 'ru']);
  assertEquals(outcome.calls, 0);
});

Deno.test('a card missing one language: only that one is made, and the cook gets all four', async () => {
  const { deps, calls, remembered } = fake(sameCard({ he: content('מרק'), ar: content('شوربة'), ru: content('Суп') }));
  await translationsAfterExtract(existing, recipe, 'u1', deps);
  assertEquals(calls.filter((c) => c.startsWith('translate')), ['translate:Lentil Soup:es']);
  assertEquals(Object.keys(remembered[0]).sort(), ['ar', 'es', 'he', 'ru']);
});

Deno.test("a card with other text: its own missing languages, and the cook's recipe on its own", async () => {
  const other: CardTranslationsState = {
    id: 'c1',
    text: { ...recipe, ingredients: [{ name: 'red lentils', quantity: 2, unit: 'cup' }] },
    translations: { he: content('מרק'), ar: content('شوربة'), ru: content('Суп'), es: content('Sopa') },
  };
  const { deps, calls, cardSaves, remembered } = fake(other);
  const outcome = await translationsAfterExtract(existing, recipe, 'u1', deps);
  assertEquals(cardSaves, []);
  assertEquals(calls.filter((c) => c.startsWith('translate')).length, 4);
  assertEquals(remembered[0].he?.title, 'Lentil soup (he)');
  assertEquals(outcome.sharedWithCard, false);
  assertEquals(outcome.reusedFromCard, []);
});

Deno.test('a guest: the card is translated, nothing is handed to a copy', async () => {
  const { deps, cardSaves, remembered } = fake(sameCard());
  const outcome = await translationsAfterExtract(published, recipe, null, deps);
  assertEquals(cardSaves.length, 4);
  assertEquals(remembered, []);
  assertEquals(outcome.cookLanguages, []);
});

Deno.test('a guest with no card: no model call', async () => {
  const { deps, calls } = fake(null);
  await translationsAfterExtract(skipped, recipe, null, deps);
  assertEquals(calls, []);
});

Deno.test('no card (the cook does not share): the recipe on its own, for the cook', async () => {
  const { deps, calls, remembered } = fake(null);
  const outcome = await translationsAfterExtract(skipped, recipe, 'u1', deps);
  assertEquals(calls.filter((c) => c.startsWith('translate')).length, 4);
  assertEquals(Object.keys(remembered[0]).sort(), ['ar', 'es', 'he', 'ru']);
  assertEquals(outcome.cardId, null);
});

Deno.test("a Hebrew recipe labelled English: Hebrew is its own language, and isn't made", async () => {
  const hebrew = {
    title: 'מרק עדשים',
    source_language: 'en',
    ingredients: [{ name: 'עדשים כתומות', quantity: 1, unit: 'כוס' }],
    instructions: [{ step: 1, text: 'מבשלים את העדשים עד שהן רכות לגמרי.' }],
  };
  const { deps, calls } = fake(null);
  await translationsAfterExtract(skipped, hebrew, 'u1', deps);
  assertEquals(calls.map((c) => c.split(':').at(-1)).sort(), ['ar', 'en', 'es', 'ru']);
});

Deno.test('a failed language is reported; the others still reach the card and the cook', async () => {
  const { deps, cardSaves, remembered } = fake(sameCard(), ['ru']);
  const outcome = await translationsAfterExtract(published, recipe, 'u1', deps);
  assertEquals(cardSaves.length, 3);
  assertEquals(Object.keys(remembered[0]).sort(), ['ar', 'es', 'he']);
  assertEquals(outcome.failed, ['card/ru: timeout']);
});

Deno.test('a hidden or vanished card (null): the cook still gets a translation', async () => {
  const { deps, cardSaves, remembered } = fake(null);
  await translationsAfterExtract(existing, recipe, 'u1', deps);
  assertEquals(cardSaves, []);
  assertEquals(Object.keys(remembered[0]).length, 4);
});

Deno.test('nothing to translate (no ingredients or steps): no call, nothing handed over', async () => {
  const { deps, calls, remembered } = fake(null);
  await translationsAfterExtract(skipped, { title: 'Soup', ingredients: [], instructions: [] }, 'u1', deps);
  assertEquals(calls, []);
  assertEquals(remembered, []);
});
