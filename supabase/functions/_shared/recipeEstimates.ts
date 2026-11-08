/**
 * The `recipe_estimates` task (PIN-79, ADR 018): re-estimates the AI-derived fields a hand edit
 * made stale, over the recipe as the user saved it. One call returns only the fields asked for:
 * calories, cooking time, effort, cost tier, tags, and metric/spoons amounts for given rows.
 * Appliances have their own task (recipeAppliances.ts).
 *
 * The rules are the extraction prompt's own (CALORIE_RULES, TIME_RULES, TAG_RULES,
 * MEASUREMENT_RULES), so an edited recipe is estimated the way an extracted one was.
 * Output is normalised and fitted to the database limits here, so callers can store it as is.
 */

import { normalizeStoredCalories } from './calories.ts';
import { CALORIE_RULES, TAG_RULES, TIME_RULES } from './gemini.ts';
import {
  INGREDIENT_AMOUNT_SCHEMA,
  MEASUREMENT_RULES,
  normalizeDualIngredient,
  type IngredientAmount,
} from './ingredientAmounts.ts';
import { generateLlmJson } from './llmClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';
import type { CostEstimate, EffortLevel, Ingredient, Instruction, RecalcField } from './recipeEditTypes.ts';
import { fitRecipeToLimits } from './recipeLimits.ts';
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

/** Only the fields that came back valid. A field missing here failed and stays pending. */
export interface EstimateValues {
  calories?: { calories: number; reasoning: string | null };
  estimated_time_minutes?: { minutes: number; reasoning: string | null };
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

  if (fields.has('calories') && typeof data.calories === 'number') {
    const total = normalizeStoredCalories(data.calories, input.servings);
    const fitted = fitRecipeToLimits({ calories: total }).calories;
    if (typeof fitted === 'number') values.calories = { calories: fitted, reasoning: reasoning(data.calories_reasoning) };
  }
  if (fields.has('estimated_time_minutes') && typeof data.estimated_time_minutes === 'number') {
    const minutes = fitRecipeToLimits({ estimated_time_minutes: data.estimated_time_minutes }).estimated_time_minutes;
    if (typeof minutes === 'number') {
      values.estimated_time_minutes = { minutes, reasoning: reasoning(data.time_reasoning) };
    }
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
