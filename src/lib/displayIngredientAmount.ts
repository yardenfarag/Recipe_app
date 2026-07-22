import { CulinaryUnitLanguage } from '@/lib/culinaryUnits';
import { applyMeasurementSystem, type MeasurementSystem } from '@/lib/convertMeasurement';
import { formatQuantity } from '@/lib/formatQuantity';

/** Renders an ingredient amount, optionally converted to metric (g / ml). */
export function displayIngredientAmount(
  quantity: number,
  unit: string,
  options?: {
    system?: MeasurementSystem;
    language?: CulinaryUnitLanguage | null;
  },
): string {
  const { quantity: displayQty, unit: displayUnit } = applyMeasurementSystem(
    quantity,
    unit,
    options?.system ?? 'original',
  );
  return formatQuantity(displayQty, displayUnit, options?.language);
}
