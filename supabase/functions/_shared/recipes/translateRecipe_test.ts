import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { completion, withModel } from '../testing/applianceModelStub.ts';
import { localizeCulinaryUnit } from './culinaryUnits.ts';
import {
  recipeAlreadyInLanguage,
  resolveTranslatedUnit,
  translateRecipeWithLlm,
} from './translateRecipe.ts';
import { glossaryFor } from './translationGlossary.ts';

Deno.test('resolveTranslatedUnit keeps the model’s empty unit instead of the source unit (PIN-53)', () => {
  assertEquals(resolveTranslatedUnit('קישוא', '', 'en', 1), '');
  assertEquals(resolveTranslatedUnit('green cabbage', '', 'he', 1), '');
  assertEquals(resolveTranslatedUnit('saucisses', '', 'en', 6), '');
  assertEquals(resolveTranslatedUnit('adet', '', 'he', 2), '');
  assertEquals(resolveTranslatedUnit('bunch', '', 'he', 1), 'צרור');
  assertEquals(resolveTranslatedUnit('beau bouquet', 'bunch', 'en', 1), 'bunch');
  assertEquals(resolveTranslatedUnit('shot', 'מנה', 'he', 1), 'מנה');
  assertEquals(resolveTranslatedUnit('cups', 'כוסות', 'he', 0.5), 'כוס');
});

Deno.test('the server unit table follows the same plural rules as the app', () => {
  assertEquals(localizeCulinaryUnit('tsp', 'he', 0.5), 'כפית');
  assertEquals(localizeCulinaryUnit('cup', 'ru', 5), 'стаканов');
  assertEquals(localizeCulinaryUnit('יחידות', 'en', 2), '');
  assertEquals(localizeCulinaryUnit('to taste', 'he', 0), 'לפי הטעם');
});

Deno.test('recipeAlreadyInLanguage spots a recipe already in the target language', () => {
  const english = {
    title: 'Keto Brownies',
    ingredients: [{ name: 'almond flour', quantity: 120, unit: 'g' }],
    instructions: [
      { step: 1, text: 'Preheat the oven to 170°C and line the pan.' },
      { step: 2, text: 'Melt the chocolate and butter, then add the eggs and mix until smooth.' },
    ],
  };
  assert(recipeAlreadyInLanguage(english, 'en'));
  assert(!recipeAlreadyInLanguage(english, 'he'));
  assert(!recipeAlreadyInLanguage(english, 'es'));

  const hebrew = {
    title: 'עוגת שוקולד',
    ingredients: [{ name: 'קמח', quantity: 2, unit: 'כוסות' }],
    instructions: [{ step: 1, text: 'מערבבים את כל החומרים ואופים 30 דקות ב-180 מעלות.' }],
  };
  assert(recipeAlreadyInLanguage(hebrew, 'he'));
  assert(!recipeAlreadyInLanguage(hebrew, 'en'));

  const spanish = {
    title: 'Tarta de queso',
    ingredients: [{ name: 'queso crema', quantity: 300, unit: 'g' }],
    instructions: [{ step: 1, text: 'Mezcla el queso con los huevos y la nata, y hornea hasta que cuaje, unos 40 minutos.' }],
  };
  assert(recipeAlreadyInLanguage(spanish, 'es'));
  assert(!recipeAlreadyInLanguage(spanish, 'en'));
});

Deno.test('glossaryFor gives only the terms in the recipe, in the target language', () => {
  const lines = glossaryFor('1 cup heavy cream, 2 tbsp cornstarch, salt', 'he');
  assertEquals(lines, ['"heavy cream" → שמנת מתוקה', '"cornstarch" → קורנפלור']);
  assertEquals(glossaryFor('צנצנת סילאן', 'en'), ['"סילאן" → silan (date syrup)']);
  assertEquals(glossaryFor('lemon juice', 'es'), ['"lemon juice" → zumo de limón']);
  assertEquals(glossaryFor('heavy cream', 'en'), []);
});

Deno.test('translateRecipeWithLlm sends the style notes and glossary, and never puts the source unit back', async () => {
  await withModel(
    [
      completion({
        title: 'כרוב צלוי',
        ingredients: [
          { source_index: 0, name: 'כרוב ירוק', quantity: 1, unit: '' },
          { source_index: 1, name: 'שמנת מתוקה', quantity: 0.5, unit: 'כוסות' },
        ],
        instructions: [{ source_index: 0, step: 1, text: 'מחממים את התנור ל-350°F.' }],
      }),
    ],
    async ({ calls }) => {
      const result = await translateRecipeWithLlm({
        targetLanguage: 'he',
        title: 'Roasted Cabbage',
        ingredients: [
          { name: 'green cabbage', quantity: 1, unit: 'green cabbage' },
          { name: 'heavy cream', quantity: 0.5, unit: 'cup' },
        ],
        instructions: [{ step: 1, text: 'Preheat the oven to 350°F.' }],
      });
      assertEquals(result.ingredients.map((i) => i.unit), ['', 'כוס']);
      const messages = calls[0].messages as { role: string; content: string }[];
      const user = messages.find((m) => m.role === 'user')!.content;
      assertStringIncludes(user, 'impersonal present plural');
      assertStringIncludes(user, '"heavy cream" → שמנת מתוקה');
      const system = messages.find((m) => m.role === 'system')!.content;
      assertStringIncludes(system, '350°F stays 350°F');
    },
  );
});

Deno.test('the app expects the same translation version the function writes', async () => {
  const { TRANSLATION_VERSION } = await import('./translateRecipe.ts');
  const { CURRENT_TRANSLATION_VERSION } = await import('../../../../shared/lib/translationVersion.ts');
  assertEquals(CURRENT_TRANSLATION_VERSION, TRANSLATION_VERSION);
});
