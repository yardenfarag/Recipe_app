// Dual grams/spoons amounts extracted with each ingredient so the app toggle
// does not have to guess densities (cups of flour → grams, not milliliters).

import { canonicalUnitKey, isCountUnit, isKnownCulinaryUnit } from './culinaryUnits.ts';
import { sanitizeGeminiText } from './geminiClient.ts';

export const INGREDIENT_AMOUNT_SCHEMA = {
  type: 'object',
  properties: {
    quantity: { type: 'number' },
    unit: { type: 'string' },
  },
  required: ['quantity', 'unit'],
};

export const DUAL_INGREDIENT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    quantity: { type: 'number' },
    unit: { type: 'string' },
    metric: {
      ...INGREDIENT_AMOUNT_SCHEMA,
      description:
        'g/kg for solids; ml/liter for true liquids only. Never ml for flour, sugar, butter, cheese, meat, chocolate, or spices.',
    },
    spoons: {
      ...INGREDIENT_AMOUNT_SCHEMA,
      description:
        'cup/tbsp/tsp when that is a normal kitchen measure. Never oz, lb, or ml for solids. Copy counts/pinches as-is.',
    },
  },
  required: ['name', 'quantity', 'unit', 'metric', 'spoons'],
};

export const MEASUREMENT_RULES = `- Every ingredient MUST include quantity+unit (as written) AND metric AND spoons.
- quantity + unit: copy the source as written, in the source language. Do not convert this pair.
- metric and spoons units MUST be canonical English: g, kg, ml, liter, cup, tbsp, tsp, pinch, clove, slice, can, package, stick, or "" for countable pieces (eggs).
- metric — how a cook using a scale / measuring jug would measure this:
  - Solids, powders, pastes, butter, cheese, chocolate, meat, pasta, nuts, cocoa, spices, salt, baking powder/soda, honey, syrup → g or kg. NEVER milliliters.
  - True liquids only (water, milk, stock, broth, oil, vinegar, wine, juice, extracts, soy sauce) → ml or liter. NEVER grams unless the source already gave grams.
  - Typical cup/spoon densities when the source is volumetric: all-purpose flour 1 cup≈120 g; granulated sugar 1 cup≈200 g; packed brown sugar 1 cup≈220 g; butter 1 tbsp≈14 g / 1 cup≈227 g; cocoa 1 cup≈85 g; honey 1 tbsp≈21 g; salt 1 tsp≈6 g; baking powder/soda 1 tsp≈4–5 g; uncooked rice 1 cup≈185 g; oats 1 cup≈90 g; chopped onion 1 cup≈160 g.
  - Round grams to whole numbers (0.5 g allowed under 5 g). Round ml to whole numbers.
- spoons — how a cook using cups and spoons would measure this:
  - Use cup / tbsp / tsp whenever that is a normal kitchen measure (flour, sugar, spices, liquids, oils, butter, cocoa, salt, baking powder).
  - Liquids: 1 cup=240 ml, 1 tbsp=15 ml, 1 tsp=5 ml. Prefer cups at ≥¼ cup, tbsp at ≥1 tbsp, else tsp.
  - Solids given in grams: convert to cups/tbsp/tsp using the densities above — NOT to ounces or pounds.
  - If cups/spoons are unnatural (a steak, a whole chicken, dry pasta by package weight, a can), copy the source quantity into spoons with a canonical unit. Do not invent ounces.
  - Count items (eggs, cloves, slices), pinches, cans, packages: copy the same quantity into BOTH metric and spoons.
- NEVER put flour, sugar, butter, cheese, meat, chocolate, cocoa, spices, or other solids in ml.`;

export type IngredientAmount = { quantity: number; unit: string };

export type DualIngredient = {
  name: string;
  quantity: number;
  unit: string;
  metric?: IngredientAmount;
  spoons?: IngredientAmount;
};

const COUNT_LIKE = new Set([
  'clove',
  'slice',
  'pinch',
  'can',
  'package',
  'stick',
]);

function canonicalizeUnit(unit: string): string {
  const trimmed = unit.trim();
  if (!trimmed) return '';
  if (isKnownCulinaryUnit(trimmed)) return canonicalUnitKey(trimmed);
  return trimmed;
}

function parseAmount(value: unknown): IngredientAmount | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const quantity = Number(record.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) return undefined;
  const unit = typeof record.unit === 'string' ? canonicalizeUnit(sanitizeGeminiText(record.unit)) : '';
  return { quantity, unit };
}

export function parseIngredientAmount(value: unknown): IngredientAmount | undefined {
  return parseAmount(value);
}

function isCountLikeUnit(unit: string): boolean {
  const key = canonicalUnitKey(unit);
  return isCountUnit(unit) || COUNT_LIKE.has(key);
}

/**
 * Canonicalize dual amounts from Gemini. Count-like items that omitted
 * metric/spoons get the source copied into both so the toggle stays stable.
 */
export function normalizeDualIngredient(ingredient: DualIngredient): DualIngredient {
  const name = sanitizeGeminiText(ingredient.name ?? '');
  const quantity = Number(ingredient.quantity);
  const unit = typeof ingredient.unit === 'string' ? sanitizeGeminiText(ingredient.unit) : '';
  const source: DualIngredient = {
    name,
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit,
  };

  let metric = parseAmount(ingredient.metric);
  let spoons = parseAmount(ingredient.spoons);

  if (isCountLikeUnit(source.unit)) {
    const copied = { quantity: source.quantity, unit: canonicalizeUnit(source.unit) };
    if (!metric) metric = copied;
    if (!spoons) spoons = copied;
  }

  return {
    ...source,
    ...(metric ? { metric } : {}),
    ...(spoons ? { spoons } : {}),
  };
}

export function mapDualIngredients(ingredients: DualIngredient[] | undefined): DualIngredient[] {
  return (ingredients ?? []).map((ingredient) => normalizeDualIngredient(ingredient));
}
