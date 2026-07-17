/**
 * Cooking fractions people actually measure with, mapped to their Unicode
 * glyphs. Sixteenths and finer aren't included — nobody measures 1/16 tsp,
 * that's what `formatQuantity` collapses into "a pinch" instead.
 */
const NICE_FRACTIONS: { value: number; glyph: string }[] = [
  { value: 1 / 8, glyph: '⅛' },
  { value: 1 / 4, glyph: '¼' },
  { value: 1 / 3, glyph: '⅓' },
  { value: 3 / 8, glyph: '⅜' },
  { value: 1 / 2, glyph: '½' },
  { value: 5 / 8, glyph: '⅝' },
  { value: 2 / 3, glyph: '⅔' },
  { value: 3 / 4, glyph: '¾' },
  { value: 7 / 8, glyph: '⅞' },
];

/** Below this, a fraction is finer than anyone actually measures. */
const PINCH_THRESHOLD = 1 / 16;

/** Units small enough that "a pinch" reads naturally in place of a number. */
const PINCHABLE_UNITS = new Set(['tsp', 'tsps', 'teaspoon', 'teaspoons']);

/**
 * Formats a raw decimal ingredient quantity (e.g. `0.13`, from AI extraction
 * or serving-scaling math) the way a recipe actually reads: snapped to the
 * nearest common cooking fraction ("¼ tsp", "1½ cups"), or — for genuinely
 * tiny seasoning amounts — a qualitative word ("a pinch") instead of a
 * fraction nobody would actually measure out.
 *
 * Returns the full amount string (including unit, or standing alone for
 * "a pinch"), ready to render next to the ingredient name.
 */
export function formatQuantity(quantity: number, unit: string): string {
  if (!Number.isFinite(quantity) || quantity <= 0) return `${quantity} ${unit}`.trim();

  const normalizedUnit = unit.trim().toLowerCase();

  if (quantity < PINCH_THRESHOLD && PINCHABLE_UNITS.has(normalizedUnit)) {
    return 'a pinch';
  }

  const whole = Math.floor(quantity);
  const remainder = quantity - whole;

  // Snap the fractional part to the nearest of {0, ⅛, ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾, ⅞, 1}
  // rather than showing the raw decimal.
  let bestWhole = whole;
  let bestGlyph = '';
  let bestDiff = remainder; // candidate: drop the fraction, keep the whole number

  if (1 - remainder < bestDiff) {
    bestDiff = 1 - remainder;
    bestWhole = whole + 1;
  }

  for (const { value, glyph } of NICE_FRACTIONS) {
    const diff = Math.abs(remainder - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestGlyph = glyph;
      bestWhole = whole;
    }
  }

  // Rounds to zero but isn't a "pinch"-eligible unit (e.g. a scaled-down
  // "g" or "cup" amount) — showing "0" would look broken, so floor it to
  // the smallest fraction we recognize instead.
  if (bestWhole === 0 && !bestGlyph) {
    return `${NICE_FRACTIONS[0].glyph} ${unit}`.trim();
  }

  const amount = bestWhole > 0 ? `${bestWhole}${bestGlyph}` : bestGlyph;
  return `${amount} ${unit}`.trim();
}
