/**
 * Rounds a scaled ingredient amount to what a home kitchen can measure. Scaling 6 g of salt from 18 to 19
 * servings gives 6.33 g, which no kitchen scale shows, and 2 eggs become 2.11 eggs. Each unit rounds to the
 * smallest step of the tool it's measured with: a scale reads whole grams, eggs only come whole.
 *
 * Only for amounts that were scaled: a recipe at its own servings shows what the author wrote. Spoons and cups
 * aren't rounded here; `formatQuantity` already snaps them to the fractions on a measuring spoon.
 */

import { canonicalUnitKey, isCountUnit, isKnownCulinaryUnit } from './culinaryUnits';

/** Grams and millilitres: the step grows with the amount, so the rounding stays within about 10%. */
const METRIC_STEPS: { below: number; step: number }[] = [
  { below: 1, step: 0.1 },
  { below: 5, step: 0.5 },
  { below: 50, step: 1 },
  { below: 250, step: 5 },
  { below: 1000, step: 10 },
  { below: Infinity, step: 25 },
];

/** Things you can't cut into pieces at the counter: a can, a garlic clove, a sachet. */
const WHOLE_UNITS = new Set(['clove', 'slice', 'can', 'package', 'sachet']);

/** Counted things that halve fine: an onion, a lemon, a stick of butter, a bunch of parsley. */
const HALF_UNITS = new Set(['stick', 'bunch', 'handful']);

/** Eggs (and yolks and whites) in the recipe languages, which only come whole. Not eggplant. */
const EGG =
  /(^|[^\p{L}])(eggs?|yolks?|[הו]?(ביצה|ביצים|חלמון|חלמונים)|huevos?|yemas?|яйц\p{L}*|яиц|желт(ок|к\p{L}*)|(ال)?(بيض\p{L}*)|œufs?|oeufs?|eier|ei|eigelb|yumurta\p{L}*)($|[^\p{L}])/iu;

export function isEgg(name: string): boolean {
  return EGG.test(name.trim());
}

function roundToStep(quantity: number, step: number): number {
  // The second rounding clears float noise (0.1 * 3 = 0.30000000000000004).
  return Math.round(Math.round(quantity / step) * step * 100) / 100;
}

function metricStep(quantity: number): number {
  return METRIC_STEPS.find(({ below }) => quantity < below)!.step;
}

/** A plain count: "2", "2 pcs", "2 יחידות". */
function isPlainCount(unit: string): boolean {
  return !unit.trim() || isCountUnit(unit);
}

/**
 * The amount to show for `quantity` of `name` in `unit` after scaling. Never rounds a real amount down to nothing:
 * a scaled-down garlic clove is still one clove.
 */
export function roundForKitchen(quantity: number, unit: string, name: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) return quantity;
  const key = canonicalUnitKey(unit);

  if (key === 'g' || key === 'ml') {
    return Math.max(0.1, roundToStep(quantity, metricStep(quantity)));
  }
  if (key === 'kg' || key === 'liter') {
    return Math.max(0.05, roundToStep(quantity, quantity < 10 ? 0.05 : 0.1));
  }
  // "2 large eggs" can arrive with "large" as the unit, so any unit that isn't a measure counts for eggs.
  const counted = isPlainCount(unit) || !isKnownCulinaryUnit(unit);
  if (WHOLE_UNITS.has(key) || (counted && isEgg(name))) {
    return Math.max(1, Math.round(quantity));
  }
  if (HALF_UNITS.has(key) || isPlainCount(unit)) {
    return Math.max(0.5, roundToStep(quantity, 0.5));
  }
  return quantity;
}
