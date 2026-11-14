/**
 * The `diets` task (PIN-83): a small model call that lists the diets a Hub recipe already fits as
 * written, so the Hub can show cards that fit a user's kitchen-profile diets first.
 *
 * It never throws. Any failure gives `diets: null`, which means "not checked yet", so the card is
 * still published and the backfill can try it again later.
 */

import { numberedSteps } from './appliances.ts';
import { generateLlmJson } from './llmClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

/**
 * Kitchen-profile diet keys a recipe can fit as written. Matches the app's variant keys
 * (src/lib/recipeVariants.ts) minus `healthier`, which is a direction, not a diet a recipe meets.
 */
export const HUB_DIET_KEYS = [
  'vegan',
  'vegetarian',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'low_carb',
  'high_protein',
  'keto',
  'paleo',
  'mediterranean',
] as const;

export type HubDietKey = (typeof HUB_DIET_KEYS)[number];

const DIET_KEY_SET = new Set<string>(HUB_DIET_KEYS);

/** A diet on the left always fits every diet on the right, so the model can't contradict itself. */
const IMPLIES: Partial<Record<HubDietKey, HubDietKey[]>> = {
  vegan: ['vegetarian', 'dairy_free'],
  vegetarian: ['pescatarian'],
  keto: ['low_carb'],
  paleo: ['gluten_free', 'dairy_free'],
};

export type DietsRecipeInput = {
  title?: unknown;
  ingredients?: unknown;
  instructions?: unknown;
};

export type DeriveDietsResult = {
  diets: HubDietKey[] | null;
  usages: GeminiUsageSnapshot[];
  error?: string;
};

const MAX_TITLE = 200;
const MAX_INGREDIENTS = 40;
const MAX_INGREDIENT_NAME = 80;
const MAX_STEPS = 20;
const MAX_STEP_CHARS = 300;

export const DIETS_SYSTEM_PROMPT = `You decide which diets a recipe already fits exactly as written, with no substitutions.
Answer every diet separately with true or false. Judge each one on its own rules; one diet failing says nothing about another.

Diets:
- vegan: no meat, poultry, fish, seafood, eggs, dairy, honey, gelatin or other animal products.
- vegetarian: no meat, poultry, fish or seafood, and no meat or fish stock, gelatin, lard or fish sauce. Eggs, dairy and honey are fine, so most cakes, pancakes, muffins, breads and pasta dishes without meat or fish ARE vegetarian.
- pescatarian: no meat or poultry (including their stock, gelatin and lard). Fish, seafood, eggs and dairy are fine.
- gluten_free: no wheat, barley, rye, spelt, regular pasta, bread, couscous, regular soy sauce, beer or other gluten sources.
- dairy_free: no milk, butter, cream, cheese, yogurt, ghee or whey.
- low_carb: few starchy carbs and little added sugar; mostly vegetables, protein and fat. Not low_carb: bread, cakes, cookies, pancakes, pasta, rice, couscous, potato dishes, or anything built on grains, pseudo-grains (quinoa, buckwheat, amaranth, oats) or wheat, rice or corn flour, or sweetened with sugar, honey, syrup, dates or banana. Nut, seed or coconut flour with little or no sugar is fine.
- high_protein: protein is clearly the main part of the dish (for example meat, fish, eggs, tofu, legumes or Greek yogurt in large amounts). Desserts, breads and crackers are not high_protein, even with seeds or quinoa.
- keto: very low net carbs and high fat; no sugar, honey, syrups, dates, grains, pseudo-grains, flour, rice, pasta, bread, potatoes, starchy vegetables, legumes or high-sugar fruit (bananas, mango, grapes). Chocolate counts only if it is sugar-free.
- paleo: only meat, fish, eggs, vegetables, fruit, nuts, seeds and natural fats (olive, avocado and coconut oil, animal fat). No grains or pseudo-grains (quinoa, buckwheat, amaranth, oats, rice, corn — so a quinoa bread is NOT paleo), legumes (including peanuts and soy), dairy, refined sugar, sweetened chocolate, or seed oils (sunflower, canola, vegetable oil) and things made with them, such as regular mayonnaise or store-bought dressings. Honey, maple syrup and dates are fine in small amounts.
- mediterranean: the dish itself follows the Mediterranean pattern: olive oil as the main fat, with vegetables, legumes, whole grains, fish or seafood at the centre, and herbs; little red meat, butter, cream or added sugar. Do not add it just because nothing breaks it: sweet bakes, desserts and snacks almost never qualify.

Rules:
- Judge the ingredients as listed. Do not assume a swap the recipe does not state.
- Be strict about what each diet forbids. Answer false when the whole recipe does not clearly fit, or when an ingredient of unknown kind could break that diet (for example "broth", "stock", "sauce", "mayonnaise" or "chocolate").
- A product name counts as what it normally is: "flour" is wheat flour, "chocolate" is sweetened, "oil" or "vegetable oil" is a seed oil.
- Optional garnishes count unless the recipe says they can be left out.
- Return ONLY data matching the schema.`;

/** One required boolean per diet, so the model has to judge every diet instead of listing a few. */
export const DIETS_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(HUB_DIET_KEYS.map((key) => [key, { type: 'boolean' }])),
  required: [...HUB_DIET_KEYS],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function ingredientLine(raw: unknown): string {
  if (!isRecord(raw)) return '';
  const name = clean(raw.name, MAX_INGREDIENT_NAME);
  if (!name) return '';
  const quantity = typeof raw.quantity === 'number' && Number.isFinite(raw.quantity) ? String(raw.quantity) : '';
  const unit = clean(raw.unit, 20);
  return [quantity, unit, name].filter(Boolean).join(' ');
}

export function ingredientLines(recipe: DietsRecipeInput): string[] {
  return Array.isArray(recipe.ingredients)
    ? recipe.ingredients.slice(0, MAX_INGREDIENTS).map(ingredientLine).filter(Boolean)
    : [];
}

export function buildDietsUserText(recipe: DietsRecipeInput): string {
  const steps = numberedSteps(recipe.instructions)
    .slice(0, MAX_STEPS)
    .map((s) => `${s.step}. ${s.text.slice(0, MAX_STEP_CHARS)}`);
  return [
    `Title: ${clean(recipe.title, MAX_TITLE) || '(untitled)'}`,
    `Ingredients:\n${ingredientLines(recipe).map((line) => `- ${line}`).join('\n')}`,
    `Steps:\n${steps.join('\n') || '(none listed)'}`,
  ].join('\n\n');
}

/**
 * Keeps only known keys, adds the diets they imply, and returns them in HUB_DIET_KEYS order.
 * Accepts the model's `{ vegan: true, keto: false, ... }` answer or a plain list of keys.
 * Returns null when the answer is neither (an object with no known diet key counts as neither).
 */
export function sanitizeDiets(value: unknown): HubDietKey[] | null {
  let list: unknown = isRecord(value) && 'diets' in value ? value.diets : value;
  if (isRecord(list)) {
    const record = list;
    if (!HUB_DIET_KEYS.some((key) => typeof record[key] === 'boolean')) return null;
    list = HUB_DIET_KEYS.filter((key) => record[key] === true);
  }
  if (!Array.isArray(list)) return null;
  const found = new Set<HubDietKey>();
  const add = (key: HubDietKey) => {
    if (found.has(key)) return;
    found.add(key);
    for (const implied of IMPLIES[key] ?? []) add(implied);
  };
  for (const raw of list) {
    const key = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (DIET_KEY_SET.has(key)) add(key as HubDietKey);
  }
  return HUB_DIET_KEYS.filter((key) => found.has(key));
}

export async function deriveRecipeDiets(
  recipe: DietsRecipeInput,
  options: { timeoutMs?: number } = {},
): Promise<DeriveDietsResult> {
  // Nothing to judge: leave it as not checked.
  if (ingredientLines(recipe).length === 0) return { diets: null, usages: [] };
  try {
    const { data, usage } = await generateLlmJson<unknown>({
      kind: 'diets',
      systemPrompt: DIETS_SYSTEM_PROMPT,
      parts: [{ text: buildDietsUserText(recipe) }],
      responseSchema: DIETS_SCHEMA,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxOutputTokens: 200,
      context: 'recipeDiets.ts: deriveRecipeDiets',
    });
    const diets = sanitizeDiets(data);
    return diets === null
      ? { diets: null, usages: [usage], error: 'diets_not_a_list' }
      : { diets, usages: [usage] };
  } catch (error) {
    console.warn('[diets] derive failed; leaving the card unchecked', error);
    return {
      diets: null,
      usages: [],
      error: error instanceof Error ? error.message.slice(0, 200) : 'diets_failed',
    };
  }
}
