import { type MeasurementSystem } from '@/lib/convertMeasurement';
import {
  canonicalUnitKey,
  culinaryUnitSurfaceForms,
  type CulinaryUnitLanguage,
} from '@/lib/culinaryUnits';
import { formatQuantity } from '@/lib/formatQuantity';
import { isValidIngredientAmount } from '@/lib/ingredientAmounts';
import type { Ingredient, IngredientAmount } from '@/types/recipe';

/** Units an amount in a step can be converted between. */
const MEASURE_KEYS = new Set(['cup', 'tbsp', 'tsp', 'g', 'kg', 'ml', 'liter', 'oz', 'lb']);
/** One-letter aliases ("t", "c") are too ambiguous to find in prose. */
const MIN_FORM_LENGTH = 2;
/** How far after an amount to look for the ingredient it measures. */
const NAME_WINDOW = 48;

const GLYPHS: Record<string, number> = {
  '½': 1 / 2,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const GLYPH_CLASS = `[${Object.keys(GLYPHS).join('')}]`;
const NUMBER = `(?:\\d+\\s*${GLYPH_CLASS}|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|${GLYPH_CLASS})`;

function unitKey(unit: string): string {
  const key = canonicalUnitKey(unit);
  if (key === 'tablespoon') return 'tbsp';
  if (key === 'teaspoon') return 'tsp';
  return key;
}

function escapeForm(form: string): string {
  // Dots are optional ("ст. л." / "ст л") and spacing is loose.
  return form
    .replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === '.' ? '' : `\\${char}`))
    .split(/\s+/)
    .map((part) => `${part}\\.?`)
    .join('\\s*');
}

let amountPattern: RegExp | null = null;
const formKeys = new Map<string, string>();

function getAmountPattern(): RegExp {
  if (amountPattern) return amountPattern;
  const forms = culinaryUnitSurfaceForms().filter(
    ({ form, key }) => form.length >= MIN_FORM_LENGTH || key === 'g',
  );
  const usable = forms.filter(({ key }) => MEASURE_KEYS.has(unitKey(key)));
  for (const { form, key } of usable) formKeys.set(form.toLowerCase().replace(/[.\s]/g, ''), unitKey(key));
  const alternation = usable
    .map(({ form }) => form)
    .sort((a, b) => b.length - a.length)
    .map(escapeForm)
    .join('|');
  amountPattern = new RegExp(
    `(${NUMBER})(?:\\s*[-–]\\s*(${NUMBER}))?\\s*(${alternation})(?![\\p{L}\\p{M}])`,
    'giu',
  );
  return amountPattern;
}

function parseNumber(raw: string): number {
  const text = raw.trim();
  const glyph = text.match(new RegExp(`^(\\d*)\\s*(${GLYPH_CLASS})$`, 'u'));
  if (glyph) return Number(glyph[1] || 0) + GLYPHS[glyph[2]];
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text.replace(',', '.'));
}

function nameWords(name: string): string[] {
  const words = name
    .toLowerCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter(Boolean);
  const long = words.filter((word) => word.length >= 3);
  return long.length > 0 ? long : words;
}

type Match = { ingredient: Ingredient; from: IngredientAmount; to: IngredientAmount };

/** The ingredient this amount measures: same unit, name right after it. */
function findIngredient(
  ingredients: Ingredient[],
  key: string,
  window: string,
  system: MeasurementSystem,
): Match | null {
  let best: { match: Match; hits: number; position: number } | null = null;
  for (const ingredient of ingredients) {
    const to = system === 'metric' ? ingredient.metric : ingredient.spoons;
    if (!isValidIngredientAmount(to) || to.quantity <= 0) continue;
    if (unitKey(to.unit) === key) continue;
    const sides = [ingredient.metric, ingredient.spoons, { quantity: ingredient.quantity, unit: ingredient.unit }];
    const from = sides.find(
      (side): side is IngredientAmount =>
        isValidIngredientAmount(side) && side.quantity > 0 && unitKey(side.unit) === key,
    );
    if (!from) continue;

    let hits = 0;
    let position = Infinity;
    for (const word of nameWords(ingredient.name)) {
      const index = window.indexOf(word);
      if (index === -1) continue;
      hits += 1;
      position = Math.min(position, index);
    }
    if (hits === 0) continue;
    if (!best || hits > best.hits || (hits === best.hits && position < best.position)) {
      best = { match: { ingredient, from, to }, hits, position };
    }
  }
  return best?.match ?? null;
}

function roundTo(quantity: number, unit: string): number {
  const key = unitKey(unit);
  if (key === 'g' || key === 'ml') {
    return quantity < 5 ? Math.round(quantity * 2) / 2 : Math.round(quantity);
  }
  return quantity;
}

function formatConverted(quantity: number, unit: string, language: CulinaryUnitLanguage | null) {
  return formatQuantity(roundTo(quantity, unit), unit, language);
}

/**
 * Rewrites amounts inside a step ("3 tbsp butter") into the reader's chosen
 * grams/spoons system, using that ingredient's own dual amounts so solids
 * become grams rather than milliliters. Amounts that don't clearly belong to
 * an ingredient (a "4 liter pot") are left as written.
 */
export function convertStepAmounts(
  text: string,
  ingredients: Ingredient[],
  system: MeasurementSystem,
  language: CulinaryUnitLanguage | null = null,
): string {
  if (!text || ingredients.length === 0) return text;
  const pattern = getAmountPattern();
  pattern.lastIndex = 0;
  const lower = text.toLowerCase();

  return text.replace(pattern, (whole, low: string, high: string | undefined, unit: string, offset: number) => {
    const key = formKeys.get(unit.toLowerCase().replace(/[.\s]/g, ''));
    if (!key) return whole;
    const end = offset + whole.length;
    const match = findIngredient(ingredients, key, lower.slice(end, end + NAME_WINDOW), system);
    if (!match) return whole;

    const ratio = match.to.quantity / match.from.quantity;
    const lowValue = parseNumber(low) * ratio;
    if (!Number.isFinite(lowValue) || lowValue <= 0) return whole;
    if (!high) return formatConverted(lowValue, match.to.unit, language);

    const highValue = parseNumber(high) * ratio;
    if (!Number.isFinite(highValue) || highValue <= 0) return whole;
    const highLabel = formatConverted(highValue, match.to.unit, language);
    const lowLabel = formatConverted(lowValue, match.to.unit, language);
    // "30–45 ml": keep the unit once, on the upper bound.
    const lowNumber = lowLabel.split(/\s+/)[0];
    return `${lowNumber}–${highLabel}`;
  });
}
