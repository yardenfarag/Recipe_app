import { generateLlmJson } from './llmClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

const TIMEOUT_MS = 35_000;

export type FridgeCatalogItem = {
  id: string;
  title: string;
  ingredientNames?: string[];
  tags?: string[];
  time?: number | null;
};

export type FridgeMatchRow = {
  id: string;
  score: number;
  matched: string[];
  missing: string[];
  reason: string;
};

const SYSTEM_PROMPT = `You match a photo of ingredients (fridge, counter, pantry) against a user's saved recipe catalog.

Rules:
- Rank only recipes from the catalog. Never invent a new recipe or an id that is not listed.
- Prefer recipes that use several visible ingredients. Missing pantry staples (salt, oil, water) are fine.
- score is 0–100 how well the photo covers that recipe.
- matched / missing are short ingredient names.
- reason is one short sentence in the same language as the recipe titles when possible.
- Return at most 8 matches, highest score first. Return an empty list if nothing is a reasonable cook tonight.
- Return ONLY data matching the schema.`;

const SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          score: { type: 'number' },
          matched: { type: 'array', items: { type: 'string' } },
          missing: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
        required: ['id', 'score', 'matched', 'missing', 'reason'],
      },
    },
  },
  required: ['matches'],
};

export async function matchFridgeToCatalog(input: {
  imageBase64: string;
  mimeType?: string;
  catalog: FridgeCatalogItem[];
}): Promise<{ matches: FridgeMatchRow[]; usage: GeminiUsageSnapshot | null }> {
  const allowed = new Set(input.catalog.map((row) => row.id));
  const catalogText = JSON.stringify(input.catalog);

  const { data, usage } = await generateLlmJson<{ matches?: FridgeMatchRow[] }>({
    tier: 'fast',
    systemPrompt: SYSTEM_PROMPT,
    parts: [
      {
        imageBase64: input.imageBase64,
        mimeType: input.mimeType ?? 'image/jpeg',
      },
      { text: `Saved recipes:\n${catalogText}\n\nWhich of these can they cook from this photo?` },
    ],
    responseSchema: SCHEMA,
    timeoutMs: TIMEOUT_MS,
    maxOutputTokens: 2_048,
    kind: 'fridge_match',
    context: 'fridgeMatch.ts: matchFridgeToCatalog',
  });

  const matches = (data.matches ?? [])
    .filter((row) => row && allowed.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      score: clampScore(row.score),
      matched: stringList(row.matched),
      missing: stringList(row.missing),
      reason: typeof row.reason === 'string' ? row.reason.trim().slice(0, 200) : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return { matches, usage };
}

function clampScore(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 80))
    .slice(0, 12);
}
