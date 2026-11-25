import { HttpError } from '../core/httpError.ts';
import { parseIngredientAmount } from './ingredientAmounts.ts';
import { isTranslateLanguageCode, type TranslateRecipeInput } from './translateRecipe.ts';

export const MAX_TRANSLATE_BODY_BYTES = 64_000;
const MAX_TITLE_CHARS = 200;
const MAX_INGREDIENTS = 60;
const MAX_INSTRUCTIONS = 50;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_INSTRUCTION_CHARS = 1_000;

interface RequestBody {
  target_language?: string;
  recipe?: {
    title?: string;
    ingredients?: {
      name?: string;
      quantity?: number;
      unit?: string;
      metric?: { quantity?: number; unit?: string };
      spoons?: { quantity?: number; unit?: string };
    }[];
    instructions?: { step?: number; text?: string; timestamp_seconds?: number }[];
  };
}

const bad = (message: string) => HttpError.legacy(400, message);

/**
 * translate-recipe's request: `{ target_language, recipe }`, checked and trimmed. Bad requests get the old
 * `{ error }` 400 bodies. Like the code it came from, a body that isn't an object (`null`, say) throws a TypeError,
 * which is a 500.
 */
export function parseTranslateRequest(raw: unknown): TranslateRecipeInput {
  const body = raw as RequestBody;

  const targetLanguage = body.target_language?.trim().toLowerCase();
  if (!targetLanguage || !isTranslateLanguageCode(targetLanguage)) {
    throw bad('Missing or invalid "target_language". Use: en, es, he, ru, ar, de, fr.');
  }

  const recipe = body.recipe;
  if (!recipe?.title?.trim()) throw bad('Missing "recipe.title" in request body');
  if (recipe.title.trim().length > MAX_TITLE_CHARS) {
    throw bad(`Recipe title must be ${MAX_TITLE_CHARS} characters or fewer`);
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length > MAX_INGREDIENTS) {
    throw bad(`Recipe may include at most ${MAX_INGREDIENTS} ingredients`);
  }
  if (!Array.isArray(recipe.instructions) || recipe.instructions.length > MAX_INSTRUCTIONS) {
    throw bad(`Recipe may include at most ${MAX_INSTRUCTIONS} instructions`);
  }
  if (
    recipe.ingredients.some((ingredient) => {
      const quantity = Number(ingredient?.quantity);
      return (
        typeof ingredient?.name !== 'string' ||
        !ingredient.name.trim() ||
        ingredient.name.trim().length > MAX_INGREDIENT_NAME_CHARS ||
        (ingredient.unit != null && typeof ingredient.unit !== 'string') ||
        (typeof ingredient.unit === 'string' && ingredient.unit.trim().length > MAX_UNIT_CHARS) ||
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        quantity > 1_000_000
      );
    })
  ) {
    throw bad('Recipe contains an invalid ingredient');
  }
  if (
    recipe.instructions.some(
      (instruction) =>
        typeof instruction?.step !== 'number' ||
        !Number.isInteger(instruction.step) ||
        instruction.step < 1 ||
        typeof instruction?.text !== 'string' ||
        !instruction.text.trim() ||
        instruction.text.trim().length > MAX_INSTRUCTION_CHARS,
    )
  ) {
    throw bad('Recipe contains an invalid instruction');
  }

  const ingredients = (recipe.ingredients ?? [])
    .filter((i) => Boolean(i.name?.trim()) && Number.isFinite(Number(i.quantity)))
    .map((i) => {
      const metric = parseIngredientAmount(i.metric);
      const spoons = parseIngredientAmount(i.spoons);
      return {
        name: i.name!.trim(),
        quantity: Number(i.quantity),
        unit: typeof i.unit === 'string' ? i.unit.trim() : '',
        ...(metric ? { metric } : {}),
        ...(spoons ? { spoons } : {}),
      };
    });

  const instructions = (recipe.instructions ?? [])
    .filter(
      (s): s is { step: number; text: string; timestamp_seconds?: number } =>
        s.step != null && typeof s.text === 'string' && s.text.trim().length > 0,
    )
    .map((s) => ({
      step: s.step,
      text: s.text.trim(),
      ...(Number.isFinite(s.timestamp_seconds)
        ? { timestamp_seconds: Math.max(0, Math.round(s.timestamp_seconds!)) }
        : {}),
    }));

  if (ingredients.length === 0 && instructions.length === 0) {
    throw bad('Recipe must include ingredients or instructions to translate');
  }

  return { targetLanguage, title: recipe.title.trim(), ingredients, instructions };
}
