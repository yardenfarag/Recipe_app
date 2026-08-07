import { canonicalUnitKey, isCountUnit } from '@/lib/culinaryUnits';

export type MeasurementSystem = 'original' | 'metric';

/** Count-style units we leave unchanged in metric mode. */
const COUNT_LIKE = new Set([
  'clove',
  'slice',
  'pinch',
  'can',
  'package',
  'stick',
]);

const ML_PER_UNIT: Record<string, number> = {
  cup: 240,
  tbsp: 15,
  tablespoon: 15,
  tsp: 5,
  teaspoon: 5,
};

const G_PER_UNIT: Record<string, number> = {
  oz: 28.3495,
  lb: 453.592,
  stick: 113,
};

/** Volume units shown in "Spoons" mode. */
const CUP_ML = 240;
const TBSP_ML = 15;
const TSP_ML = 5;

function normalizeMetricWeight(grams: number): { quantity: number; unit: string } {
  if (grams >= 1000) {
    const kg = Math.round((grams / 1000) * 100) / 100;
    return { quantity: kg, unit: 'kg' };
  }
  return { quantity: Math.round(grams), unit: 'g' };
}

function normalizeMetricVolume(ml: number): { quantity: number; unit: string } {
  if (ml >= 1000) {
    const liters = Math.round((ml / 1000) * 100) / 100;
    return { quantity: liters, unit: 'liter' };
  }
  return { quantity: Math.round(ml), unit: 'ml' };
}

function roundCookingQuantity(value: number): number {
  if (value >= 10) return Math.round(value * 10) / 10;
  // Snap near common cooking fractions.
  const whole = Math.floor(value);
  const frac = value - whole;
  const snaps = [0, 1 / 8, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 5 / 8, 2 / 3, 3 / 4, 7 / 8, 1];
  let best = snaps[0];
  let bestDiff = Math.abs(frac - best);
  for (const s of snaps) {
    const d = Math.abs(frac - s);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  const snapped = whole + best;
  return Math.round(snapped * 1000) / 1000;
}

/**
 * Converts imperial / spoon units to grams or milliliters.
 * Count units (cloves, slices, pinch) and unknown units stay as-is.
 */
export function convertToMetric(
  quantity: number,
  unit: string,
): { quantity: number; unit: string } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { quantity, unit };
  }

  const key = canonicalUnitKey(unit);

  if (isCountUnit(unit) || COUNT_LIKE.has(key)) {
    return { quantity, unit };
  }

  if (key === 'g') return normalizeMetricWeight(quantity);
  if (key === 'kg') return normalizeMetricWeight(quantity * 1000);
  if (key === 'ml') return normalizeMetricVolume(quantity);
  if (key === 'liter') return normalizeMetricVolume(quantity * 1000);

  const mlFactor = ML_PER_UNIT[key];
  if (mlFactor != null) {
    return normalizeMetricVolume(quantity * mlFactor);
  }

  const gFactor = G_PER_UNIT[key];
  if (gFactor != null) {
    return normalizeMetricWeight(quantity * gFactor);
  }

  return { quantity, unit };
}

/**
 * Converts metric amounts toward cups / spoons / ounces for "Spoons" mode.
 * Volume (ml) → cup/tbsp/tsp; weight (g) → oz/lb. Already-imperial stays put.
 */
export function convertToSpoons(
  quantity: number,
  unit: string,
): { quantity: number; unit: string } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { quantity, unit };
  }

  const key = canonicalUnitKey(unit);

  if (isCountUnit(unit) || COUNT_LIKE.has(key)) {
    return { quantity, unit };
  }

  // Already volumetric / imperial — keep as written (normalize aliases).
  if (key in ML_PER_UNIT || key === 'oz' || key === 'lb') {
    return { quantity, unit: key === 'tablespoon' ? 'tbsp' : key === 'teaspoon' ? 'tsp' : key };
  }

  let ml: number | null = null;
  if (key === 'ml') ml = quantity;
  else if (key === 'liter') ml = quantity * 1000;

  if (ml != null) {
    // Prefer cups for ≥ ¼ cup, tablespoons for ≥ 1 tbsp, else teaspoons.
    if (ml >= CUP_ML / 4) {
      return { quantity: roundCookingQuantity(ml / CUP_ML), unit: 'cup' };
    }
    if (ml >= TBSP_ML) {
      return { quantity: roundCookingQuantity(ml / TBSP_ML), unit: 'tbsp' };
    }
    return { quantity: roundCookingQuantity(ml / TSP_ML), unit: 'tsp' };
  }

  let grams: number | null = null;
  if (key === 'g') grams = quantity;
  else if (key === 'kg') grams = quantity * 1000;

  if (grams != null) {
    if (grams >= 453.592) {
      return { quantity: roundCookingQuantity(grams / 453.592), unit: 'lb' };
    }
    return { quantity: roundCookingQuantity(grams / 28.3495), unit: 'oz' };
  }

  return { quantity, unit };
}

/**
 * Display conversion only — never mutates stored recipe units.
 * `metric` → g/ml; `original` (Spoons) → cups/tbsp/tsp/oz when convertible.
 */
export function applyMeasurementSystem(
  quantity: number,
  unit: string,
  system: MeasurementSystem,
): { quantity: number; unit: string } {
  if (system === 'metric') return convertToMetric(quantity, unit);
  return convertToSpoons(quantity, unit);
}
