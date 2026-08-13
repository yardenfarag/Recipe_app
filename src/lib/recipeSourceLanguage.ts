import { DEFAULT_SOURCE_LANGUAGE } from '@/lib/appLanguages';
import type { Ingredient, Instruction } from '@/types/recipe';

type RecipeText = {
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  source_language?: string | null;
};

const LATIN_MARKERS: Record<string, readonly string[]> = {
  es: [
    ' añadir ',
    ' agrega ',
    ' ingredientes ',
    ' cucharada ',
    ' cucharadita ',
    ' horno ',
    ' mezcla ',
    ' precalienta ',
    ' taza ',
  ],
  fr: [
    ' ajouter ',
    ' cuillère ',
    ' ingrédients ',
    ' mélanger ',
    ' préchauffer ',
    ' tasse ',
  ],
  de: [
    ' hinzufügen ',
    ' esslöffel ',
    ' teelöffel ',
    ' zutaten ',
    ' mischen ',
    ' vorheizen ',
  ],
};

/**
 * Repairs historical recipes that were saved as English before extraction
 * reported a source language. Script detection is exact; Latin languages need
 * at least two culinary markers to avoid changing valid English recipes.
 */
export function resolveRecipeSourceLanguage(recipe: RecipeText): string {
  const declared =
    recipe.source_language?.trim().toLowerCase().split(/[-_]/)[0] || DEFAULT_SOURCE_LANGUAGE;
  const text = ` ${[
    recipe.title,
    ...recipe.ingredients.flatMap((ingredient) => [ingredient.name, ingredient.unit]),
    ...recipe.instructions.map((instruction) => instruction.text),
  ]
    .join(' ')
    .toLowerCase()} `;

  if (/[\u0590-\u05ff]/u.test(text)) return 'he';
  if (/[\u0600-\u06ff]/u.test(text)) return 'ar';
  if (/[\u0400-\u04ff]/u.test(text)) return 'ru';

  if (declared === DEFAULT_SOURCE_LANGUAGE) {
    let best: { language: string; score: number } | null = null;
    for (const [language, markers] of Object.entries(LATIN_MARKERS)) {
      const score = markers.reduce(
        (total, marker) => total + (text.includes(marker) ? 1 : 0),
        0,
      );
      if (score >= 2 && (!best || score > best.score)) {
        best = { language, score };
      }
    }
    if (best) return best.language;
  }

  return declared;
}
