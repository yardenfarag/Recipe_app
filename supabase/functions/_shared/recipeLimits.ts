/**
 * Hard limits on recipe content (PIN-79, ADR 018). The database enforces the same limits with
 * CHECK constraints (migration 20261108130000_hand_edited_recipes), so every writer that turns
 * model output into recipe content must pass it through fitRecipeToLimits, or the save fails.
 */
export const RECIPE_LIMITS = {
  titleChars: 120,
  ingredients: 60,
  ingredientNameChars: 100,
  quantityMax: 10_000,
  steps: 40,
  stepChars: 800,
  tags: 10,
  tagChars: 30,
  servingsMin: 1,
  servingsMax: 100,
  timeMinutesMin: 1,
  timeMinutesMax: 2_880,
  caloriesMax: 10_000,
  cookNoteChars: 160,
} as const;

/** Cuts by character, like Postgres char_length, so a cut never splits an emoji. */
export function truncateChars(value: string, max: number): string {
  if (value.length <= max) return value;
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

// Lists are `unknown` so stored JSON (a Hub card) can be fitted as well as typed model output.
type LimitedFields = {
  title?: string;
  ingredients?: unknown;
  instructions?: unknown;
  tags?: unknown;
  servings?: number;
  estimated_time_minutes?: number | null;
  calories?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A whole number in range, or null: an estimate outside the range is no estimate. */
function estimateInRange(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

/**
 * Returns a copy that fits the database limits. Only the fields present are touched.
 * Text and lists are cut, servings and quantities are clamped, and a cooking time or calorie
 * estimate outside its range becomes null (unknown): models return 0 minutes when unsure.
 */
export function fitRecipeToLimits<T extends LimitedFields>(recipe: T): T {
  const L = RECIPE_LIMITS;
  const out: LimitedFields = { ...recipe };

  if (typeof recipe.title === 'string') {
    out.title = truncateChars(recipe.title.trim(), L.titleChars);
  }
  if (Array.isArray(recipe.ingredients)) {
    out.ingredients = recipe.ingredients.slice(0, L.ingredients).map((item: unknown) => {
      if (!isRecord(item)) return item;
      const quantity = typeof item.quantity === 'number' ? item.quantity : Number.NaN;
      return {
        ...item,
        ...(typeof item.name === 'string'
          ? { name: truncateChars(item.name, L.ingredientNameChars) }
          : {}),
        quantity: Number.isFinite(quantity) ? Math.min(Math.max(quantity, 0), L.quantityMax) : 0,
      };
    });
  }
  if (Array.isArray(recipe.instructions)) {
    out.instructions = recipe.instructions.slice(0, L.steps).map((step: unknown) =>
      isRecord(step) && typeof step.text === 'string'
        ? { ...step, text: truncateChars(step.text, L.stepChars) }
        : step
    );
  }
  if (Array.isArray(recipe.tags)) {
    out.tags = recipe.tags
      .filter((tag: unknown): tag is string => typeof tag === 'string')
      .slice(0, L.tags)
      .map((tag) => truncateChars(tag, L.tagChars));
  }
  if (typeof recipe.servings === 'number') {
    const servings = Number.isFinite(recipe.servings) ? Math.round(recipe.servings) : L.servingsMin;
    out.servings = Math.min(Math.max(servings, L.servingsMin), L.servingsMax);
  }
  if (typeof recipe.estimated_time_minutes === 'number') {
    out.estimated_time_minutes = estimateInRange(
      recipe.estimated_time_minutes,
      L.timeMinutesMin,
      L.timeMinutesMax,
    );
  }
  if (typeof recipe.calories === 'number') {
    out.calories = estimateInRange(recipe.calories, 0, L.caloriesMax);
  }

  return out as T;
}
