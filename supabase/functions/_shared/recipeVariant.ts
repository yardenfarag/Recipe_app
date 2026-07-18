// Full-recipe dietary / lifestyle transforms via Gemini structured output.

import { normalizeStoredCalories } from './calories.ts';
import { AppError, FetchError } from './errors.ts';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
const REQUEST_TIMEOUT_MS = 30_000;

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
- Before setting calories, write calories_reasoning: brief estimate from main ingredients, confirm calories is TOTAL for all servings.
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
}

export async function transformRecipeWithGemini(
  input: TransformRecipeInput,
): Promise<TransformedRecipe> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new AppError(
      'recipeVariant.ts: transformRecipeWithGemini',
      'GEMINI_API_KEY is not configured',
    );
  }

  const goal = VARIANT_INSTRUCTIONS[input.variant];
  const text = buildTextContext(input, goal);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: TRANSFORM_SCHEMA,
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    throw new FetchError('recipeVariant.ts: transformRecipeWithGemini', 'Gemini request failed', {
      timedOut: isTimeout,
      timeoutMs: REQUEST_TIMEOUT_MS,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new FetchError('recipeVariant.ts: transformRecipeWithGemini', 'Gemini API returned an error', {
      status: res.status,
      body: errText,
    });
  }

  const data = await res.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new AppError('recipeVariant.ts: transformRecipeWithGemini', 'Gemini returned no content');
  }

  const parsed = JSON.parse(jsonText) as TransformedRecipe;
  const servings = parsed.servings > 0 ? parsed.servings : input.servings;

  return {
    ingredients: parsed.ingredients ?? [],
    instructions: parsed.instructions ?? [],
    servings,
    calories: normalizeStoredCalories(parsed.calories ?? null, servings) ?? undefined,
    calories_reasoning: parsed.calories_reasoning,
    summary: parsed.summary?.trim() || 'Recipe adapted to your chosen style.',
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
