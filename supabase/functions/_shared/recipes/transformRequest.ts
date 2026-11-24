import { HttpError } from '../core/httpError.ts';
import { parseRecipeId, parseSourceUrl } from '../core/remixUsage.ts';
import { isRecipeVariantKey, type RecipeVariantKey } from './recipeVariant.ts';

export const MAX_TRANSFORM_BODY_BYTES = 64_000;
const MAX_TITLE_CHARS = 200;
const MAX_INGREDIENTS = 60;
const MAX_INSTRUCTIONS = 50;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_INSTRUCTION_CHARS = 1_000;

interface RequestBody {
  variant?: string;
  instruction?: string;
  kitchen_auto_apply?: boolean;
  recipe_id?: string;
  original_url?: string;
  recipe?: {
    id?: string;
    original_url?: string;
    title?: string;
    servings?: number;
    ingredients?: { name?: string; quantity?: number; unit?: string }[];
    instructions?: { step?: number; text?: string }[];
    calories?: number;
  };
}

export interface TransformRequest {
  instruction?: string;
  variant?: RecipeVariantKey;
  /** What the app asked for. The handler still checks the user's kitchen setting. */
  kitchenAutoApply: boolean;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
  calories?: number;
  recipeId: string | null;
  sourceUrl: string | null;
}

const bad = (message: string) => HttpError.legacy(400, message);

/**
 * transform-recipe's request: `{ variant | instruction, recipe, recipe_id?, original_url?, kitchen_auto_apply? }`,
 * checked and trimmed. Bad requests get the old `{ error }` 400 bodies. Like the code it came from, a body that isn't
 * an object (`null`, say) or a non-string `variant` / `instruction` throws a TypeError, which is a 500.
 */
export function parseTransformRequest(raw: unknown): TransformRequest {
  const body = raw as RequestBody;

  const instruction = body.instruction?.trim().slice(0, 400) || undefined;
  const variantRaw = body.variant?.trim();
  const variant = variantRaw && isRecipeVariantKey(variantRaw) ? variantRaw : undefined;
  const kitchenAutoApply = body.kitchen_auto_apply === true;
  if (!instruction && !variant) throw bad('Missing "variant" or "instruction" in request body');

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
    recipe.ingredients.some(
      (ingredient) =>
        typeof ingredient?.name !== 'string' ||
        !ingredient.name.trim() ||
        ingredient.name.trim().length > MAX_INGREDIENT_NAME_CHARS ||
        typeof ingredient?.unit !== 'string' ||
        !ingredient.unit.trim() ||
        ingredient.unit.trim().length > MAX_UNIT_CHARS ||
        typeof ingredient?.quantity !== 'number' ||
        !Number.isFinite(ingredient.quantity) ||
        ingredient.quantity < 0 ||
        ingredient.quantity > 1_000_000,
    )
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
  if (
    recipe.servings != null &&
    (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 1_000)
  ) {
    throw bad('Recipe servings must be between 1 and 1000');
  }
  if (
    recipe.calories != null &&
    (!Number.isFinite(recipe.calories) || recipe.calories < 0 || recipe.calories > 10_000_000)
  ) {
    throw bad('Recipe calories are invalid');
  }

  const ingredients = (recipe.ingredients ?? [])
    .filter(
      (i): i is { name: string; quantity: number; unit: string } =>
        Boolean(i.name?.trim()) && i.quantity != null && Boolean(i.unit?.trim()),
    )
    .map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: i.unit.trim() }));

  const instructions = (recipe.instructions ?? [])
    .filter(
      (s): s is { step: number; text: string } =>
        s.step != null && typeof s.text === 'string' && s.text.trim().length > 0,
    )
    .map((s) => ({ step: s.step, text: s.text.trim() }));

  if (ingredients.length === 0) throw bad('Recipe must include at least one ingredient');

  return {
    instruction,
    variant,
    kitchenAutoApply,
    title: recipe.title.trim(),
    servings: recipe.servings && recipe.servings > 0 ? recipe.servings : 1,
    ingredients,
    instructions,
    calories: recipe.calories,
    recipeId: parseRecipeId(body.recipe_id) ?? parseRecipeId(recipe.id),
    sourceUrl: parseSourceUrl(body.original_url) ?? parseSourceUrl(recipe.original_url),
  };
}
