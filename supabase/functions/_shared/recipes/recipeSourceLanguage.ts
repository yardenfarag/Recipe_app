/**
 * The language a recipe is written in, worked out the way the apps do (shared/lib/recipeSourceLanguage.ts): the
 * functions can't import `shared/`, so this is the same rule, kept in step by hand (like culinaryUnits.ts). The
 * server uses it to leave out a recipe's own language when it translates in the background (PIN-77), so a recipe
 * isn't "translated" into the language the app shows it in as written.
 */

const DEFAULT_SOURCE_LANGUAGE = 'en';

type RecipeText = {
  title: string;
  ingredients: { name?: unknown; unit?: unknown }[];
  instructions: { text?: unknown }[];
  source_language?: string | null;
};

const LATIN_MARKERS: Record<string, readonly string[]> = {
  es: [' añadir ', ' agrega ', ' ingredientes ', ' cucharada ', ' cucharadita ', ' horno ', ' mezcla ', ' precalienta ', ' taza '],
  fr: [' ajouter ', ' cuillère ', ' ingrédients ', ' mélanger ', ' préchauffer ', ' tasse '],
  de: [' hinzufügen ', ' esslöffel ', ' teelöffel ', ' zutaten ', ' mischen ', ' vorheizen '],
  // PIN-53: Turkish recipes were saved as English, so English readers never got a translation.
  tr: [' ekleyin ', ' karıştırın ', ' dakika ', ' fırında ', ' yemek kaşığı ', ' çay kaşığı ', ' su bardağı ', ' adet '],
};

const SCRIPT_LANGUAGES = new Set(['he', 'ar', 'ru']);

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Script detection is exact; Latin languages need at least two culinary markers to avoid changing valid English
 * recipes. A Hebrew, Arabic or Russian label on text without that script isn't trusted.
 */
export function resolveRecipeSourceLanguage(recipe: RecipeText): string {
  const declared = recipe.source_language?.trim().toLowerCase().split(/[-_]/)[0] || DEFAULT_SOURCE_LANGUAGE;
  const text = ` ${
    [
      recipe.title,
      ...recipe.ingredients.flatMap((ingredient) => [str(ingredient.name), str(ingredient.unit)]),
      ...recipe.instructions.map((instruction) => str(instruction.text)),
    ]
      .join(' ')
      .toLowerCase()
  } `;

  if (/[֐-׿]/u.test(text)) return 'he';
  if (/[؀-ۿ]/u.test(text)) return 'ar';
  if (/[Ѐ-ӿ]/u.test(text)) return 'ru';

  const trusted = SCRIPT_LANGUAGES.has(declared) ? DEFAULT_SOURCE_LANGUAGE : declared;

  if (trusted === DEFAULT_SOURCE_LANGUAGE) {
    let best: { language: string; score: number } | null = null;
    for (const [language, markers] of Object.entries(LATIN_MARKERS)) {
      const score = markers.reduce((total, marker) => total + (text.includes(marker) ? 1 : 0), 0);
      if (score >= 2 && (!best || score > best.score)) best = { language, score };
    }
    if (best) return best.language;
  }

  return trusted;
}
