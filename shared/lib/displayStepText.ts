import type { MeasurementSystem } from './convertMeasurement';
import { convertStepAmounts } from './convertStepAmounts';
import { convertStepUnits } from './convertStepUnits';
import type { CulinaryUnitLanguage } from './culinaryUnits';
import type { UnitSystem } from './unitSystem';
import type { Ingredient } from '../types/recipe';

/**
 * A step as the reader sees it: amounts in their spoons-or-grams choice (`convertStepAmounts`), then temperatures and
 * pan sizes in their Metric-or-US choice (`convertStepUnits`). Display only.
 */
export function displayStepText(
  text: string,
  ingredients: Ingredient[],
  system: MeasurementSystem,
  language: CulinaryUnitLanguage | null,
  units: UnitSystem,
): string {
  return convertStepUnits(convertStepAmounts(text, ingredients, system, language, units), units, language);
}
