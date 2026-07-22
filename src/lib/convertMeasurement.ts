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

export function applyMeasurementSystem(
  quantity: number,
  unit: string,
  system: MeasurementSystem,
): { quantity: number; unit: string } {
  if (system === 'original') return { quantity, unit };
  return convertToMetric(quantity, unit);
}
