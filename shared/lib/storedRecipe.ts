import { readIngredientAmount } from './ingredientAmounts';
import { parseRecipeNutrition } from './recipeNutrition';
import { LOCKABLE_FIELDS, type LockedField, Recipe, RecipeTranslationContent } from '../types/recipe';

/*
 * Checking a recipe record that came from outside the database: the mobile app's guest storage, or a backup file
 * (Settings → Your recipes). Shared so the web app can restore backups too (PIN-146).
 */

/** Validates an untrusted recipe record (guest storage, backup files). Returns null when unusable. */
export function sanitizeStoredRecipe(value: unknown): Recipe | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const title = readString(value.title);
  const servings = readPositiveNumber(value.servings);
  const extractionStatus =
    value.extraction_status === 'full' || value.extraction_status === 'partial'
      ? value.extraction_status
      : null;
  const ingredients = sanitizeIngredients(value.ingredients);
  const instructions = sanitizeInstructions(value.instructions);

  if (!id || !title || !servings || !extractionStatus || !ingredients || !instructions) {
    return null;
  }

  const recipe: Recipe = {
    id,
    title,
    servings,
    extraction_status: extractionStatus,
    ingredients,
    instructions,
  };

  assignString(recipe, 'user_id', value.user_id);
  assignString(recipe, 'original_url', value.original_url);
  assignString(recipe, 'image_url', value.image_url);
  assignString(recipe, 'source_video_url', value.source_video_url);
  assignString(recipe, 'calories_reasoning', value.calories_reasoning);
  assignString(recipe, 'time_reasoning', value.time_reasoning);
  assignString(recipe, 'created_at', value.created_at);
  assignString(recipe, 'source_language', value.source_language);
  assignNumber(recipe, 'calories', value.calories);
  assignNumber(recipe, 'estimated_time_minutes', value.estimated_time_minutes);
  // PIN-80: macros only next to calories, in the stored shape.
  const nutrition = recipe.calories != null ? parseRecipeNutrition(value.nutrition) : null;
  if (nutrition) recipe.nutrition = nutrition;

  const translations = sanitizeTranslations(value.translations);
  if (translations) recipe.translations = translations;

  if (
    ['youtube', 'instagram', 'tiktok', 'facebook', 'pinterest', 'web', 'photo', 'unknown'].includes(
      String(value.platform),
    )
  ) {
    recipe.platform = value.platform as Recipe['platform'];
  }
  if (['$', '$$', '$$$'].includes(String(value.cost_estimate))) {
    recipe.cost_estimate = value.cost_estimate as Recipe['cost_estimate'];
  }
  if (['Easy', 'Medium', 'Hard'].includes(String(value.effort_level))) {
    recipe.effort_level = value.effort_level as Recipe['effort_level'];
  }
  if (['description', 'comments', 'captions', 'video', 'web', 'photo', 'invented', 'manual'].includes(String(value.extraction_source))) {
    recipe.extraction_source = value.extraction_source as Recipe['extraction_source'];
  }
  if (typeof value.is_favorite === 'boolean') recipe.is_favorite = value.is_favorite;
  if (typeof value.migrated_from_guest === 'boolean') {
    recipe.migrated_from_guest = value.migrated_from_guest;
  }
  assignString(recipe, 'last_cooked_at', value.last_cooked_at);
  if (typeof value.cook_note === 'string') {
    const note = value.cook_note.trim().slice(0, 160);
    if (note) recipe.cook_note = note;
  }
  assignString(recipe, 'kitchen_adapted_summary', value.kitchen_adapted_summary);
  const kitchenOriginal = sanitizeKitchenOriginal(value.kitchen_original);
  if (kitchenOriginal) recipe.kitchen_original = kitchenOriginal;

  const tags = sanitizeStringArray(value.tags);
  if (tags) recipe.tags = tags;
  const missingFields = sanitizeStringArray(value.missing_fields);
  if (missingFields) recipe.missing_fields = missingFields;
  // ADR 018: fields the user set by hand. Never recalc_pending: a copy starts with nothing pending.
  const lockable = new Set<string>(LOCKABLE_FIELDS);
  const locked = sanitizeStringArray(value.locked_fields)?.filter((field): field is LockedField =>
    lockable.has(field),
  );
  if (locked && locked.length > 0) recipe.locked_fields = [...new Set(locked)];

  return recipe;
}

function sanitizeKitchenOriginal(value: unknown): Recipe['kitchen_original'] | undefined {
  if (!isRecord(value)) return undefined;
  const title = readString(value.title);
  const servings = readPositiveNumber(value.servings);
  const ingredients = sanitizeIngredients(value.ingredients);
  const instructions = sanitizeInstructions(value.instructions);
  if (!title || !servings || !ingredients || !instructions) return undefined;
  const original: NonNullable<Recipe['kitchen_original']> = {
    title,
    servings,
    ingredients,
    instructions,
  };
  const calories = readFiniteNumber(value.calories);
  if (calories !== null) original.calories = calories;
  const nutrition = calories !== null ? parseRecipeNutrition(value.nutrition) : null;
  if (nutrition) original.nutrition = nutrition;
  return original;
}

function sanitizeIngredients(value: unknown): Recipe['ingredients'] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const ingredients: Recipe['ingredients'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const name = readString(item.name);
    // Unit may be empty string for countable items after translation.
    const unit = typeof item.unit === 'string' ? item.unit.trim() : null;
    const quantity = readFiniteNumber(item.quantity);
    if (!name || unit === null || quantity === null) return null;
    const metric = readIngredientAmount(item.metric);
    const spoons = readIngredientAmount(item.spoons);
    ingredients.push({
      name,
      unit,
      quantity,
      ...(metric ? { metric } : {}),
      ...(spoons ? { spoons } : {}),
    });
  }
  return ingredients;
}

function sanitizeInstructions(value: unknown): Recipe['instructions'] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const instructions: Recipe['instructions'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const text = readString(item.text);
    const step = readFiniteNumber(item.step);
    if (!text || step === null) return null;
    const instruction: Recipe['instructions'][number] = { text, step };
    const timestamp = readFiniteNumber(item.timestamp_seconds);
    if (timestamp !== null && timestamp >= 0) {
      instruction.timestamp_seconds = Math.round(timestamp);
    }
    instructions.push(instruction);
  }
  return instructions;
}

function sanitizeStringArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value) || value.length > 100) return null;
  const strings = value.map(readString);
  return strings.every((item): item is string => item !== null) ? strings : null;
}

function sanitizeTranslations(
  value: unknown,
): Record<string, RecipeTranslationContent> | null {
  if (value == null || !isRecord(value)) return null;
  const out: Record<string, RecipeTranslationContent> = {};
  for (const [code, entry] of Object.entries(value)) {
    if (!code.trim() || !isRecord(entry)) continue;
    const title = readString(entry.title);
    const ingredients = sanitizeIngredients(entry.ingredients);
    const instructions = sanitizeInstructions(entry.instructions);
    if (!title || !ingredients || !instructions) continue;
    out[code] = { title, ingredients, instructions };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function assignString<K extends keyof Recipe>(
  recipe: Recipe,
  key: K,
  value: unknown,
): void {
  const stringValue = readString(value);
  if (stringValue) Object.assign(recipe, { [key]: stringValue });
}

function assignNumber<K extends keyof Recipe>(
  recipe: Recipe,
  key: K,
  value: unknown,
): void {
  const numberValue = readFiniteNumber(value);
  if (numberValue !== null) Object.assign(recipe, { [key]: numberValue });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPositiveNumber(value: unknown): number | null {
  const number = readFiniteNumber(value);
  return number !== null && number > 0 ? number : null;
}
