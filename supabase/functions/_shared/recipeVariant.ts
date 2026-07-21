// Full-recipe dietary / lifestyle transforms via Gemini structured output.

import { normalizeStoredCalories } from './calories.ts';
import {
  generateGeminiJson,
  sanitizeGeminiText,
} from './geminiClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

const REQUEST_TIMEOUT_MS = 35_000;
const MAX_OUTPUT_TOKENS = 4_096;

export type RecipeVariantKey =
  | 'healthier'
  | 'vegan'
  | 'vegetarian'
  | 'gluten_free'
  | 'dairy_free'
  | 'low_carb'
  | 'high_protein';

const VARIANT_INSTRUCTIONS: Record<RecipeVariantKey, string> = {
  healthier:
    'Make this recipe meaningfully healthier: reduce fat, sugar, and sodium; prefer whole grains, lean proteins, and lighter cooking methods. Keep the same dish identity and appeal.',
  vegan:
    'Make this recipe fully vegan. Replace all animal products (meat, fish, dairy, eggs, honey) with practical plant-based alternatives.',
  vegetarian:
    'Make this recipe vegetarian. Remove meat and fish; eggs and dairy may remain unless they conflict with the goal.',
  gluten_free:
    'Make this recipe gluten-free. Replace wheat flour, regular pasta, soy sauce, and other gluten sources with safe alternatives.',
  dairy_free:
    'Make this recipe dairy-free. Replace milk, butter, cream, cheese, and yogurt with suitable non-dairy alternatives.',
  low_carb:
    'Make this recipe lower in carbohydrates. Reduce starchy carbs and added sugars; favor vegetables, proteins, and healthy fats.',
  high_protein:
    'Make this recipe higher in protein while keeping it practical and delicious. Increase lean protein portions or add protein-rich ingredients.',
};

const SYSTEM_PROMPT = `You are a culinary expert adapting home-cooking recipes for dietary and lifestyle goals.

Rules:
- Preserve the spirit of the original dish — this should still feel like the same recipe, adapted.
- Update ingredients with realistic quantities and units; adjust instructions to match any swaps.
- Keep the same number of servings unless a change is required for the variant.
- calories_reasoning: one short phrase estimating kcal from main ingredients; calories is TOTAL for all servings.
- Write a concise summary (1–2 sentences) of what you changed.
- Return ONLY data matching the schema.`;

const TRANSFORM_SCHEMA = {
  type: 'object',
  properties: {
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['step', 'text'],
      },
    },
    servings: { type: 'integer' },
    calories_reasoning: { type: 'string' },
    calories: { type: 'integer' },
    summary: { type: 'string' },
  },
  required: ['ingredients', 'instructions', 'servings', 'summary'],
};

export interface TransformRecipeInput {
  variant: RecipeVariantKey;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
  calories?: number;
}

export interface TransformedRecipe {
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
  servings: number;
  calories?: number;
  calories_reasoning?: string;
  summary: string;
  usage?: GeminiUsageSnapshot | null;
}

export async function transformRecipeWithGemini(
  input: TransformRecipeInput,
): Promise<TransformedRecipe> {
  const goal = VARIANT_INSTRUCTIONS[input.variant];
  const text = buildTextContext(input, goal);

  const { data: parsed, usage } = await generateGeminiJson<TransformedRecipe>({
    tier: 'fast',
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text }],
    responseSchema: TRANSFORM_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: 'transform',
    context: 'recipeVariant.ts: transformRecipeWithGemini',
  });

  const servings = parsed.servings > 0 ? parsed.servings : input.servings;

  return {
    ingredients: (parsed.ingredients ?? []).map((ing) => ({
      name: sanitizeGeminiText(ing.name ?? ''),
      quantity: Number(ing.quantity),
      unit: sanitizeGeminiText(ing.unit ?? ''),
    })),
    instructions: (parsed.instructions ?? []).map((step) => ({
      step: Number(step.step),
      text: sanitizeGeminiText(step.text ?? ''),
    })),
    servings,
    calories: normalizeStoredCalories(parsed.calories ?? null, servings) ?? undefined,
    calories_reasoning: parsed.calories_reasoning
      ? sanitizeGeminiText(parsed.calories_reasoning)
      : undefined,
    summary: sanitizeGeminiText(
      parsed.summary?.trim() || 'Recipe adapted to your chosen style.',
    ),
    usage,
  };
}

function buildTextContext(input: TransformRecipeInput, goal: string): string {
  const lines: string[] = [
    `Goal: ${goal}`,
    `\nRecipe title: ${input.title}`,
    `Servings: ${input.servings}`,
  ];

  if (input.calories != null) {
    lines.push(`Original total calories (all servings): ~${input.calories} kcal`);
  }

  lines.push('\n--- INGREDIENTS ---');
  for (const ing of input.ingredients) {
    lines.push(`- ${ing.quantity} ${ing.unit} ${ing.name}`);
  }

  lines.push('\n--- INSTRUCTIONS ---');
  for (const step of input.instructions) {
    lines.push(`${step.step}. ${step.text}`);
  }

  return lines.join('\n');
}

export function isRecipeVariantKey(value: string): value is RecipeVariantKey {
  return value in VARIANT_INSTRUCTIONS;
}
