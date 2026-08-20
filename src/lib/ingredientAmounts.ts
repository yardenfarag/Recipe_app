import { applyMeasurementSystem, type MeasurementSystem } from '@/lib/convertMeasurement';
import type { Ingredient, IngredientAmount } from '@/types/recipe';

export function isValidIngredientAmount(
  amount?: IngredientAmount | null,
): amount is IngredientAmount {
  return Boolean(
    amount &&
      Number.isFinite(amount.quantity) &&
      amount.quantity >= 0 &&
      typeof amount.unit === 'string',
  );
}

/** Reads a stored `{ quantity, unit }` object; returns undefined when malformed. */
export function readIngredientAmount(value: unknown): IngredientAmount | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.quantity !== 'number' || !Number.isFinite(record.quantity) || record.quantity < 0) {
    return undefined;
  }
  if (typeof record.unit !== 'string') return undefined;
  return { quantity: record.quantity, unit: record.unit.trim() };
}

/**
 * Amount to show for the grams/spoons toggle.
 * Prefers extracted dual amounts; falls back to unit conversion for older recipes.
 */
export function pickIngredientAmount(
  ingredient: Pick<Ingredient, 'quantity' | 'unit' | 'metric' | 'spoons'>,
  system: MeasurementSystem,
): IngredientAmount {
  if (system === 'metric' && isValidIngredientAmount(ingredient.metric)) {
    return ingredient.metric;
  }
  if (system === 'original' && isValidIngredientAmount(ingredient.spoons)) {
    return ingredient.spoons;
  }
  return applyMeasurementSystem(ingredient.quantity, ingredient.unit, system);
}

export function scaleQuantity(quantity: number, factor: number): number {
  return Math.round(quantity * factor * 100) / 100;
}

function scaleOptionalAmount(
  amount: IngredientAmount | undefined,
  factor: number,
): IngredientAmount | undefined {
  if (!isValidIngredientAmount(amount)) return undefined;
  return { quantity: scaleQuantity(amount.quantity, factor), unit: amount.unit };
}

/** Scales source + dual amounts together so the toggle stays consistent. */
export function scaleIngredient<T extends Ingredient>(ingredient: T, factor: number): T {
  return {
    ...ingredient,
    quantity: scaleQuantity(ingredient.quantity, factor),
    metric: scaleOptionalAmount(ingredient.metric, factor),
    spoons: scaleOptionalAmount(ingredient.spoons, factor),
  };
}

export function scaleIngredients<T extends Ingredient>(
  ingredients: T[],
  baseServings: number,
  target: number,
): T[] {
  const factor = target / Math.max(1, baseServings);
  return ingredients.map((ingredient) => scaleIngredient(ingredient, factor));
}
