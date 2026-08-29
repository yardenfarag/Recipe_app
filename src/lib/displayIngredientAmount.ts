import { CulinaryUnitLanguage } from '@/lib/culinaryUnits';
import { pickIngredientAmount } from '@/lib/ingredientAmounts';
import { type MeasurementSystem } from '@/lib/convertMeasurement';
import { formatQuantity, quantityReadsAsPinch } from '@/lib/formatQuantity';
import type { Ingredient } from '@/types/recipe';

const TASTE_UNITS = /^(to taste|al gusto|au goût|לפי הטעם|по вкусу|حسب الذوق)$/i;

function isTasteUnit(unit: string): boolean {
  return TASTE_UNITS.test(unit.trim());
}

/** True when the source never stated an amount — show a blank, not "0 tsp". */
export function ingredientAmountIsUnknown(
  ingredient: Pick<Ingredient, 'quantity' | 'unit' | 'metric' | 'spoons'>,
  system: MeasurementSystem = 'original',
): boolean {
  if (isTasteUnit(ingredient.unit)) return false;
  const amount = pickIngredientAmount(ingredient, system);
  if (isTasteUnit(amount.unit)) return false;
  return !Number.isFinite(amount.quantity) || amount.quantity <= 0;
}

export function recipeHasUnknownAmounts(
  ingredients: Pick<Ingredient, 'quantity' | 'unit' | 'metric' | 'spoons'>[],
  system: MeasurementSystem = 'original',
): boolean {
  return ingredients.some((ingredient) => ingredientAmountIsUnknown(ingredient, system));
}

/** Renders an ingredient amount, preferring extracted grams/spoons when present. */
export function displayIngredientAmount(
  ingredient: Pick<Ingredient, 'quantity' | 'unit' | 'metric' | 'spoons'>,
  options?: {
    system?: MeasurementSystem;
    language?: CulinaryUnitLanguage | null;
  },
): string {
  const system = options?.system ?? 'original';
  const amount = pickIngredientAmount(ingredient, system);
  if (isTasteUnit(ingredient.unit) || isTasteUnit(amount.unit)) {
    return (amount.unit || ingredient.unit).trim();
  }
  if (ingredientAmountIsUnknown(ingredient, system)) {
    return '';
  }
  return formatQuantity(amount.quantity, amount.unit, options?.language);
}

/** True when the visible amount will be the word pinch (after scale / unit pick). */
export function displayedAmountIsPinch(
  ingredient: Pick<Ingredient, 'quantity' | 'unit' | 'metric' | 'spoons'>,
  options?: {
    system?: MeasurementSystem;
  },
): boolean {
  const system = options?.system ?? 'original';
  const amount = pickIngredientAmount(ingredient, system);
  if (isTasteUnit(ingredient.unit) || isTasteUnit(amount.unit)) return false;
  if (ingredientAmountIsUnknown(ingredient, system)) return false;
  return quantityReadsAsPinch(amount.quantity, amount.unit);
}
