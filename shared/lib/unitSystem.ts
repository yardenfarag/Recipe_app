/**
 * Metric (°C, g, cm) or US (°F, oz, in): how temperatures, weights and lengths are shown (PIN-53).
 *
 * It sits next to the spoons-or-grams choice (`MeasurementSystem`), which picks cups and spoons or grams and
 * milliliters for the ingredient list. This one decides the rest: whether Spoons mode shows weights in grams or
 * ounces, and whether a step's oven temperature and pan size read in °C and cm or °F and inches. Both are display
 * only; the stored recipe never changes.
 *
 * Until the cook picks one, it follows the app language: US for English, Metric for the others.
 */
export type UnitSystem = 'metric' | 'us';

export const UNIT_SYSTEMS: readonly UnitSystem[] = ['metric', 'us'];

export function parseUnitSystem(value: unknown): UnitSystem | undefined {
  return value === 'metric' || value === 'us' ? value : undefined;
}

/** The default before a pick: US for English, Metric for Hebrew, Arabic, Spanish and Russian (and anything else). */
export function defaultUnitSystem(language: string | null | undefined): UnitSystem {
  const code = language?.toLowerCase().split(/[-_]/)[0];
  return code === 'en' ? 'us' : 'metric';
}

/** The cook's pick, or the language's default when there is none. */
export function resolveUnitSystem(choice: UnitSystem | null | undefined, language: string | null | undefined): UnitSystem {
  return parseUnitSystem(choice) ?? defaultUnitSystem(language);
}
