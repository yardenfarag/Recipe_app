/**
 * The `recipe_estimates` task (PIN-79, ADR 018): re-estimates the AI-derived fields a hand edit
 * made stale, over the recipe as the user saved it. One call returns only the fields asked for:
 * calories (with protein, carbs and fat, PIN-80), cooking time, effort, cost tier, tags, and
 * metric/spoons amounts for given rows.
 * Appliances have their own task (recipeAppliances.ts).
 *
 * The rules are the extraction prompt's own (CALORIE_RULES, TIME_RULES, TAG_RULES,
 * MEASUREMENT_RULES), so an edited recipe is estimated the way an extracted one was.
 * Output is normalised and fitted to the database limits here, so callers can store it as is.
 */

import { normalizeStoredCalories } from './calories.ts';
import {
  normalizeStoredNutrition,
  NUTRITION_SCHEMA_PROPERTIES,
  nutritionFitsCalories,
  type RecipeNutrition,
} from './nutrition.ts';
import { CALORIE_RULES, TAG_RULES, TIME_RULES } from '../extraction/gemini.ts';
import {
  INGREDIENT_AMOUNT_SCHEMA,
  MEASUREMENT_RULES,
  normalizeDualIngredient,
  type IngredientAmount,
} from './ingredientAmounts.ts';
import { generateLlmJson } from '../llm/llmClient.ts';
import type { GeminiUsageSnapshot } from '../llm/pricing.ts';
import type { CostEstimate, EffortLevel, Ingredient, Instruction, RecalcField } from './recipeEditTypes.ts';
import { fitNutrition, fitRecipeToLimits } from './recipeLimits.ts';
import { normalizeRecipeTags } from './tags.ts';

export type EstimateField = Exclude<RecalcField, 'appliances'>;

export interface EstimateInput {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  fields: EstimateField[];
  /** 0-based rows that need metric/spoons, when `ingredient_amounts` is asked for. */
  amountRows: number[];
}

/**
 * The fields the call settled. A field missing here failed and stays pending for a retry.
 * Calories and time can settle as null: the model answered, but with no estimate or one outside
 * the database range (an estimate outside its range is no estimate). Retrying would only repeat it.
 */
export interface EstimateValues {
  /** Macros ride with calories: null when the model left them out or they don't fit the calories. */
  calories?: { calories: number | null; reasoning: string | null; nutrition: RecipeNutrition | null };
  estimated_time_minutes?: { minutes: number | null; reasoning: string | null };
  effort_level?: EffortLevel;
  cost_estimate?: CostEstimate;
  tags?: string[];
  /** By 0-based row. An entry without metric/spoons means the row has no measurable amount. */
  ingredient_amounts?: Map<number, { metric?: IngredientAmount; spoons?: IngredientAmount }>;
}

const SYSTEM_PROMPT = `You are a master chef. A home cook has edited this recipe by hand. Estimate only the fields the schema asks for, from the recipe exactly as written. Do not change the recipe.

Rules:
${CALORIE_RULES}
${TIME_RULES}
- effort_level: Easy, Medium or Hard for a home cook.
- cost_estimate: "$", "$$" or "$$$" for the whole recipe's ingredients.
${TAG_RULES}
- ingredient_amounts: one entry per listed row number, with metric and spoons for that ingredient's quantity and unit.
${MEASUREMENT_RULES}
- Return ONLY data matching the schema.`;

function schemaFor(fields: Set<EstimateField>, hasRows: boolean): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const add = (key: string, schema: unknown) => {
    properties[key] = schema;
    required.push(key);
  };
  if (fields.has('calories')) {
    add('calories_reasoning', { type: 'string' });
    add('calories', { type: 'integer' });
    // After calories, and not required: a missing split never fails the calorie estimate.
    Object.assign(properties, NUTRITION_SCHEMA_PROPERTIES);
  }
  if (fields.has('estimated_time_minutes')) {
    add('time_reasoning', { type: 'string' });
    add('estimated_time_minutes', { type: 'integer' });
  }
  if (fields.has('effort_level')) add('effort_level', { type: 'string', enum: ['Easy', 'Medium', 'Hard'] });
  if (fields.has('cost_estimate')) add('cost_estimate', { type: 'string', enum: ['$', '$$', '$$$'] });
  if (fields.has('tags')) add('tags', { type: 'array', items: { type: 'string' } });
  if (fields.has('ingredient_amounts') && hasRows) {
    add('ingredient_amounts', {
      type: 'array',
      items: {
        type: 'object',
        properties: { row: { type: 'integer' }, metric: INGREDIENT_AMOUNT_SCHEMA, spoons: INGREDIENT_AMOUNT_SCHEMA },
        required: ['row', 'metric', 'spoons'],
      },
    });
  }
  return { type: 'object', properties, required };
}

function userText(input: EstimateInput, rows: number[]): string {
  const lines = [
    `Title: ${input.title}`,
    `Servings: ${input.servings}`,
    'Ingredients:',
    ...input.ingredients.map((item, i) => `${i + 1}. ${item.quantity || ''} ${item.unit} ${item.name}`.replace(/\s+/g, ' ').trim()),
    'Steps:',
    ...input.instructions.map((step, i) => `${i + 1}. ${step.text}`),
  ];
  if (rows.length) lines.push('', `ingredient_amounts rows: ${rows.map((r) => r + 1).join(', ')}`);
  return lines.join('\n');
}

type Raw = {
  calories?: unknown;
  calories_reasoning?: unknown;
  protein_g?: unknown;
  carbs_g?: unknown;
  fat_g?: unknown;
  estimated_time_minutes?: unknown;
  time_reasoning?: unknown;
  effort_level?: unknown;
  cost_estimate?: unknown;
  tags?: unknown;
  ingredient_amounts?: unknown;
};

const reasoning = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 500) : null);

/** Throws on a failed call; a field that comes back unusable is left out of the values. */
export async function estimateRecipeFields(
  input: EstimateInput,
): Promise<{ values: EstimateValues; usage: GeminiUsageSnapshot | null }> {
  const fields = new Set(input.fields);
  const rows = fields.has('ingredient_amounts')
    ? input.amountRows.filter((row) => row >= 0 && row < input.ingredients.length)
    : [];
  const values: EstimateValues = {};
  if (fields.has('ingredient_amounts') && rows.length === 0) values.ingredient_amounts = new Map();
  if ([...fields].every((f) => f === 'ingredient_amounts') && rows.length === 0) return { values, usage: null };

  const { data, usage } = await generateLlmJson<Raw>({
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text: userText(input, rows) }],
    responseSchema: schemaFor(fields, rows.length > 0),
    timeoutMs: 30_000,
    maxOutputTokens: 2_048,
    kind: 'recipe_estimates',
    context: 'recipeEstimates.ts: estimateRecipeFields',
  });

  if (fields.has('calories')) {
    const total = typeof data.calories === 'number' ? normalizeStoredCalories(data.calories, input.servings) : null;
    const fitted = total === null ? null : fitRecipeToLimits({ calories: total }).calories ?? null;
    const nutrition = fitted === null ? null : normalizeStoredNutrition(data, input.servings);
    values.calories = { calories: fitted, reasoning: reasoning(data.calories_reasoning), nutrition };
  }
  if (fields.has('estimated_time_minutes')) {
    const minutes = typeof data.estimated_time_minutes === 'number'
      ? fitRecipeToLimits({ estimated_time_minutes: data.estimated_time_minutes }).estimated_time_minutes ?? null
      : null;
    values.estimated_time_minutes = { minutes, reasoning: reasoning(data.time_reasoning) };
  }
  if (fields.has('effort_level') && (data.effort_level === 'Easy' || data.effort_level === 'Medium' || data.effort_level === 'Hard')) {
    values.effort_level = data.effort_level;
  }
  if (fields.has('cost_estimate') && (data.cost_estimate === '$' || data.cost_estimate === '$$' || data.cost_estimate === '$$$')) {
    values.cost_estimate = data.cost_estimate;
  }
  if (fields.has('tags') && Array.isArray(data.tags)) {
    const tags = fitRecipeToLimits({
      tags: normalizeRecipeTags(data.tags.filter((t): t is string => typeof t === 'string')),
    }).tags as string[];
    if (tags.length) values.tags = tags;
  }
  if (rows.length && Array.isArray(data.ingredient_amounts)) {
    const byRow = new Map<number, { metric?: IngredientAmount; spoons?: IngredientAmount }>();
    for (const entry of data.ingredient_amounts) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      const row = Number(e.row) - 1;
      if (!rows.includes(row) || byRow.has(row)) continue;
      const source = input.ingredients[row];
      const normalized = normalizeDualIngredient({
        name: source.name,
        quantity: source.quantity,
        unit: source.unit,
        metric: e.metric as IngredientAmount | undefined,
        spoons: e.spoons as IngredientAmount | undefined,
      });
      byRow.set(row, {
        ...(normalized.metric ? { metric: normalized.metric } : {}),
        ...(normalized.spoons ? { spoons: normalized.spoons } : {}),
      });
    }
    // Every row must come back, or the field stays pending for a retry.
    if (rows.every((row) => byRow.has(row))) values.ingredient_amounts = byRow;
  }
  return { values, usage };
}

// --- Macros for a recipe that already has calories (the PIN-80 backfill) ----------------------

const NUTRITION_PROMPT = `You are a nutritionist. Split this recipe's stated total calories into protein, carbs and fat.

Rules:
- protein_g, carbs_g, fat_g: grams for ALL portions at the stated servings (totals), from the ingredient amounts.
- They must fit the stated total calories: protein×4 + carbs×4 + fat×9 ≈ calories. Do not re-estimate the calories.
- Return ONLY data matching the schema.`;

const NUTRITION_ONLY_SCHEMA = {
  type: 'object',
  properties: NUTRITION_SCHEMA_PROPERTIES,
  required: ['protein_g', 'carbs_g', 'fat_g'],
};

export interface NutritionInput {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  /** The stored total for all servings. The split must fit it. */
  calories: number;
}

/**
 * Protein, carbs and fat for a recipe whose calories are already stored, so the calories people
 * see don't change. Throws on a failed call; `nutrition` is null when the answer doesn't fit.
 */
export async function estimateRecipeNutrition(
  input: NutritionInput,
): Promise<{ nutrition: RecipeNutrition | null; usage: GeminiUsageSnapshot | null }> {
  const lines = [
    `Title: ${input.title}`,
    `Servings: ${input.servings}`,
    `Total calories (all servings): ${input.calories} kcal`,
    'Ingredients:',
    ...input.ingredients.map((item, i) => `${i + 1}. ${item.quantity || ''} ${item.unit} ${item.name}`.replace(/\s+/g, ' ').trim()),
    'Steps:',
    ...input.instructions.map((step, i) => `${i + 1}. ${step.text}`),
  ];
  const { data, usage } = await generateLlmJson<Raw>({
    systemPrompt: NUTRITION_PROMPT,
    parts: [{ text: lines.join('\n') }],
    responseSchema: NUTRITION_ONLY_SCHEMA,
    timeoutMs: 30_000,
    maxOutputTokens: 256,
    kind: 'recipe_estimates',
    context: 'recipeEstimates.ts: estimateRecipeNutrition',
  });
  const nutrition = fitNutrition({ protein_g: data.protein_g, carbs_g: data.carbs_g, fat_g: data.fat_g });
  return { nutrition: nutrition && nutritionFitsCalories(nutrition, input.calories) ? nutrition : null, usage };
}
