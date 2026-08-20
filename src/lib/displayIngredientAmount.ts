import { CulinaryUnitLanguage } from '@/lib/culinaryUnits';
import { pickIngredientAmount } from '@/lib/ingredientAmounts';
import { type MeasurementSystem } from '@/lib/convertMeasurement';
import { formatQuantity } from '@/lib/formatQuantity';
import type { Ingredient } from '@/types/recipe';

/** Renders an ingredient amount, preferring extracted grams/spoons when present. */
export function displayIngredientAmount(
  ingredient: Pick<Ingredient, 'quantity' | 'unit' | 'metric' | 'spoons'>,
  options?: {
    system?: MeasurementSystem;
    language?: CulinaryUnitLanguage | null;
  },
): string {
  const amount = pickIngredientAmount(ingredient, options?.system ?? 'original');
  return formatQuantity(amount.quantity, amount.unit, options?.language);
}
