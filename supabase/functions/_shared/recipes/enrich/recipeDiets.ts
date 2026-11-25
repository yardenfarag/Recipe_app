/**
 * The `diets` task (PIN-83): a small model call that lists the diets a Hub recipe already fits as
 * written, so the Hub can show cards that fit a user's kitchen-profile diets first. The same call
 * lists which allergens and common dislikes the recipe contains (PIN-180), so the Hub can put
 * recipes with a cook's allergies last and the ones with foods they don't like lower.
 *
 * It never throws. Any failure gives `diets: null` and `contains: null`, which means "not checked
 * yet", so the card is still published and the backfill can try it again later.
 */

import { numberedSteps } from './appliances.ts';
import { generateLlmJson } from '../../llm/llmClient.ts';
import type { LlmUsageSnapshot } from '../../llm/pricing.ts';

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
  'halal',
  'kosher',
] as const;

export type HubDietKey = (typeof HUB_DIET_KEYS)[number];

const DIET_KEY_SET = new Set<string>(HUB_DIET_KEYS);

/**
 * Foods a card can contain: the avoid list's allergens, then its one-tap dislikes. The same keys,
 * in the same order, as ALLERGEN_KEYS and DISLIKE_SUGGESTION_KEYS in shared/lib/avoidList.ts
 * (shared/lib/hubAvoid.test.ts checks).
 */
export const HUB_CONTAINS_KEYS = [
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'gluten',
  'soy',
  'sesame',
  'cilantro',
  'mushrooms',
  'olives',
  'onion',
  'garlic',
  'eggplant',
  'tomato',
  'chili',
  'coconut',
  'pork',
] as const;

export type HubContainsKey = (typeof HUB_CONTAINS_KEYS)[number];

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
  /** Both lists come from one answer: either both are set or both are null. */
  contains: HubContainsKey[] | null;
  usages: LlmUsageSnapshot[];
  error?: string;
};

const MAX_TITLE = 200;
const MAX_INGREDIENTS = 40;
const MAX_INGREDIENT_NAME = 80;
const MAX_STEPS = 20;
const MAX_STEP_CHARS = 300;

export const DIETS_SYSTEM_PROMPT = `You decide which diets a recipe already fits exactly as written, with no substitutions, and which foods it contains.
Under "diets", answer every diet separately with true or false. Judge each one on its own rules; one diet failing says nothing about another.

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
- halal: no pork or pork products (bacon, ham, lard, pork sausage, prosciutto, chorizo, pork gelatin), no alcohol in the dish (wine, beer, mirin, sake, spirits, cooking wine), and no blood. Fish and seafood are fine. Assume any other meat comes from a halal source. Gelatin of unknown source breaks it. So a cheeseburger IS halal and a beef stew with red wine is NOT.
- kosher: no pork, rabbit or other non-kosher animals; no shellfish or fish without fins and scales (shrimp, prawns, crab, lobster, clams, mussels, oysters, scallops, squid, octopus, catfish, eel, monkfish, shark); and never meat or poultry together with dairy in the same dish (butter, cream, cheese, milk or yogurt with meat or poultry). Wine is fine. Assume the meat comes from a kosher source. Gelatin of unknown source breaks it. So a cheeseburger is NOT kosher, a shrimp pasta is NOT kosher, and a beef stew with red wine IS kosher.

Under "contains", answer every food with true when the recipe has it in any ingredient, sauce, stock or product normally made with it, else false:
- milk: milk or dairy (butter, cream, cheese, yogurt, ghee, whey). Plant milks, coconut milk and peanut butter are not milk.
- eggs: eggs, including mayonnaise, aioli, meringue and fresh egg pasta.
- fish: fish, including anchovies, fish sauce, Worcestershire sauce and dashi.
- shellfish: shrimp, prawns, crab, lobster, clams, mussels, oysters, scallops, squid or octopus.
- tree_nuts: almonds, walnuts, cashews, pistachios, hazelnuts, pecans, pine nuts or macadamias, including pesto, marzipan, nut flours and nut milks. Coconut and nutmeg are not tree nuts.
- peanuts: peanuts, peanut butter or peanut oil.
- gluten: wheat, barley, rye or spelt and anything made with them (flour, bread, regular pasta, couscous, bulgur, regular soy sauce, beer), and oats unless they are gluten-free.
- soy: soybeans, tofu, tempeh, edamame, miso, soy sauce or tamari.
- sesame: sesame seeds or oil, tahini, hummus, halva or za'atar.
- cilantro: fresh cilantro (coriander leaves). Ground coriander seed does not count.
- mushrooms: any mushrooms.
- olives: olives or tapenade. Olive oil does not count.
- onion: onions, shallots, spring onions or onion powder.
- garlic: garlic in any form, including garlic powder.
- eggplant: eggplant (aubergine).
- tomato: tomatoes in any form, including tomato paste, passata, tomato sauce and ketchup.
- chili: hot chili peppers in any form (fresh, dried, flakes, chili powder, hot sauce). Sweet bell peppers and paprika do not count.
- coconut: coconut in any form, including coconut milk, cream, oil and flakes.
- pork: pork in any form, including bacon, ham, lard, pork sausage, prosciutto, chorizo and pork gelatin.

Rules:
- Judge the ingredients as listed. Do not assume a swap the recipe does not state.
- Be strict about what each diet forbids. Answer false when the whole recipe does not clearly fit, or when an ingredient of unknown kind could break that diet (for example "broth", "stock", "sauce", "mayonnaise" or "chocolate").
- A product name counts as what it normally is: "flour" is wheat flour, "chocolate" is sweetened, "oil" or "vegetable oil" is a seed oil.
- Optional garnishes count unless the recipe says they can be left out.
- For the allergens (milk to sesame), answer true when an ingredient of unknown kind could contain it.
- Return ONLY data matching the schema.`;

function booleans(keys: readonly string[]) {
  return {
    type: 'object',
    properties: Object.fromEntries(keys.map((key) => [key, { type: 'boolean' }])),
    required: [...keys],
  };
}

/**
 * One required boolean per diet and per food, so the model has to judge each of them instead of
 * listing a few.
 */
export const DIETS_SCHEMA = {
  type: 'object',
  properties: { diets: booleans(HUB_DIET_KEYS), contains: booleans(HUB_CONTAINS_KEYS) },
  required: ['diets', 'contains'],
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

/**
 * The foods the model says the recipe contains, in HUB_CONTAINS_KEYS order. Reads
 * `{ contains: { milk: true, ... } }` or a plain list; null when the answer is neither.
 */
export function sanitizeContains(value: unknown): HubContainsKey[] | null {
  const list: unknown = isRecord(value) && 'contains' in value ? value.contains : value;
  if (isRecord(list)) {
    if (!HUB_CONTAINS_KEYS.some((key) => typeof list[key] === 'boolean')) return null;
    return HUB_CONTAINS_KEYS.filter((key) => list[key] === true);
  }
  if (!Array.isArray(list)) return null;
  const found = new Set(list.map((raw) => (typeof raw === 'string' ? raw.trim().toLowerCase() : '')));
  return HUB_CONTAINS_KEYS.filter((key) => found.has(key));
}

export async function deriveRecipeDiets(
  recipe: DietsRecipeInput,
  options: { timeoutMs?: number } = {},
): Promise<DeriveDietsResult> {
  // Nothing to judge: leave it as not checked.
  if (ingredientLines(recipe).length === 0) return { diets: null, contains: null, usages: [] };
  try {
    const { data, usage } = await generateLlmJson<unknown>({
      kind: 'diets',
      systemPrompt: DIETS_SYSTEM_PROMPT,
      parts: [{ text: buildDietsUserText(recipe) }],
      responseSchema: DIETS_SCHEMA,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxOutputTokens: 600,
      context: 'recipeDiets.ts: deriveRecipeDiets',
    });
    const diets = isRecord(data) && 'diets' in data ? sanitizeDiets(data.diets) : null;
    const contains = sanitizeContains(data);
    return diets === null || contains === null
      ? { diets: null, contains: null, usages: [usage], error: 'diets_not_a_list' }
      : { diets, contains, usages: [usage] };
  } catch (error) {
    console.warn('[diets] derive failed; leaving the card unchecked', error);
    return {
      diets: null,
      contains: null,
      usages: [],
      error: error instanceof Error ? error.message.slice(0, 200) : 'diets_failed',
    };
  }
}
