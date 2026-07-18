// Ingredient substitution via Gemini's generateContent REST endpoint.
// Text-only (no video), reuses the same model/key as recipe extraction.

import { AppError, FetchError } from './errors.ts';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
const REQUEST_TIMEOUT_MS = 25_000;

const SYSTEM_PROMPT = `You are a culinary expert helping a home cook who is missing an ingredient.

Rules:
- Suggest 2-3 practical substitutes for the given ingredient, using common pantry staples where possible.
- For each substitute, adjust the quantity/unit so it achieves a similar result in the recipe (not necessarily a 1:1 swap).
- Give a short "why this works" reason covering flavor, texture, or dietary fit — one sentence, plain language.
- Consider the recipe title and the other ingredients already in the dish so suggestions fit the dish.
- Return ONLY data matching the schema.`;

const SUBSTITUTION_SCHEMA = {
  type: 'object',
  properties: {
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit', 'reason'],
      },
    },
  },
  required: ['alternatives'],
};

export interface SubstitutionAlternative {
  name: string;
  quantity: number;
  unit: string;
  reason: string;
}

export interface SuggestSubstitutionInput {
  ingredient: { name: string; quantity: number; unit: string };
  recipeTitle: string;
  otherIngredients: string[];
}

export async function suggestSubstitutionsWithGemini(
  input: SuggestSubstitutionInput,
): Promise<SubstitutionAlternative[]> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new AppError(
      'substitution.ts: suggestSubstitutionsWithGemini',
      'GEMINI_API_KEY is not configured',
    );
  }

  const text = buildTextContext(input);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: SUBSTITUTION_SCHEMA,
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
    throw new FetchError(
      'substitution.ts: suggestSubstitutionsWithGemini',
      'Gemini request failed',
      {
        timedOut: isTimeout,
        timeoutMs: REQUEST_TIMEOUT_MS,
        originalError: err instanceof Error ? err.message : String(err),
      },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new FetchError(
      'substitution.ts: suggestSubstitutionsWithGemini',
      'Gemini API returned an error',
      { status: res.status, body: errText },
    );
  }

  const data = await res.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    throw new AppError(
      'substitution.ts: suggestSubstitutionsWithGemini',
      'Gemini returned no content',
    );
  }

  const parsed = JSON.parse(jsonText) as { alternatives: SubstitutionAlternative[] };
  return parsed.alternatives ?? [];
}

function buildTextContext(input: SuggestSubstitutionInput): string {
  const parts: string[] = [];
  parts.push(`Recipe: ${input.recipeTitle}`);
  parts.push(
    `Ingredient to substitute: ${input.ingredient.quantity} ${input.ingredient.unit} ${input.ingredient.name}`,
  );

  if (input.otherIngredients.length > 0) {
    parts.push(`Other ingredients in the recipe: ${input.otherIngredients.join(', ')}`);
  }

  return parts.join('\n');
}
