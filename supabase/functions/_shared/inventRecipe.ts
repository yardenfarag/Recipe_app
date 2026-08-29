import { MEASUREMENT_RULES } from './ingredientAmounts.ts';
import {
  RECIPE_SCHEMA,
  geminiFoundRecipe,
  isFullGeminiRecipe,
  normalizeGeminiRecipe,
  type ExtractInput,
  type GeminiRecipe,
  type LadderResult,
} from './gemini.ts';
import { FetchError } from './errors.ts';
import { generateLlmJson } from './llmClient.ts';
import { isInstagramCdnUrl, resolveInstagramVideoForGemini } from './instagram.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';
import { formatMaxVideoDurationLabel, isVideoTooLong } from './videoLimits.ts';

const TEXT_TIMEOUT_MS = 45_000;
const VIDEO_TIMEOUT_MS = 120_000;
const IMAGE_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 6_144;
const MAX_DESCRIPTION_CHARS = 10_000;
const MAX_CAPTIONS_CHARS = 6_000;
const MAX_COMMENTS = 12;
const MAX_COMMENT_CHARS = 500;

const CALORIE_RULES = `- calories_reasoning: one short phrase naming the main caloric ingredients and confirming calories is TOTAL for all servings.
- calories: combined kcal for ALL portions at the stated servings (not per-portion).
- servings: equal portions the recipe yields (usually 1–12).`;

const TIME_RULES = `- time_reasoning: one short phrase (prep + cook/bake + waits).
- estimated_time_minutes: TOTAL wall-clock minutes until ready.`;

const TAG_RULES = `- tags: 3–6 short lowercase labels (cuisine, meal, dish type, method, traits). No hashtags.`;

const INVENT_RULES = `You invent a plausible home-cook recipe for a dish you can identify. This is a best-effort guess, not an extraction.

Rules:
- Identify the dish, drink, or dessert. Write a complete recipe a home cook can follow.
- Include ingredients with measurements and clear step-by-step instructions.
- Prefer common supermarket ingredients and standard home techniques. Do not claim this is the original chef's recipe.
- If the content is not food, a drink, or a recipe, set found_recipe to false and leave other fields empty.
${MEASUREMENT_RULES}
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
- source_language: lowercase ISO 639-1 of the recipe text you write (match the requested language).
- Return ONLY data matching the schema.`;

const EMPTY_RECIPE: GeminiRecipe = {
  found_recipe: false,
  source_language: 'en',
  title: '',
  servings: 0,
  ingredients: [],
  instructions: [],
};

function languageInstruction(language: string): string {
  const code = language.trim().toLowerCase().slice(0, 2) || 'en';
  return `Write title, ingredients, and instructions in language code "${code}".`;
}

export async function inventRecipeFromImage(input: {
  imageBase64: string;
  mimeType?: string;
  language?: string;
}): Promise<{ recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null }> {
  const { data, usage, durationMs } = await generateLlmJson<GeminiRecipe>({
    tier: 'standard',
    systemPrompt: INVENT_RULES,
    parts: [
      {
        imageBase64: input.imageBase64,
        mimeType: input.mimeType ?? 'image/jpeg',
      },
      {
        text: `${languageInstruction(input.language ?? 'en')}\nIdentify the dish in this photo and write a complete home-cook recipe.`,
      },
    ],
    responseSchema: RECIPE_SCHEMA,
    timeoutMs: IMAGE_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: 'invent_photo',
    context: 'inventRecipe.ts: inventRecipeFromImage',
  });
  console.log('[invent] photo ok', { ms: durationMs, usage });
  return { recipe: normalizeGeminiRecipe(data), usage };
}

export async function inventRecipeWithLadder(
  input: ExtractInput,
  language = 'en',
): Promise<LadderResult> {
  const hasDescription = Boolean(input.description?.trim());
  const hasComments = input.topComments.length > 0;
  const hasCaptions = Boolean(input.captions?.trim());
  const hasAnyText = hasDescription || hasComments || hasCaptions;
  const usages: GeminiUsageSnapshot[] = [];
  let usedInstagramVideoDownload = false;
  let textCandidate: GeminiRecipe | null = null;

  if (hasAnyText) {
    try {
      const fromText = await inventFromParts(input, language, TEXT_TIMEOUT_MS, 'text');
      if (fromText.usage) usages.push(fromText.usage);
      if (geminiFoundRecipe(fromText.recipe)) {
        if (isFullGeminiRecipe(fromText.recipe)) {
          return { recipe: fromText.recipe, source: 'description', usages };
        }
        textCandidate = fromText.recipe;
      }
    } catch (err) {
      console.error('[invent] text step failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!isTimeout(err)) throw err;
    }
  }

  if (input.platform === 'web') {
    return {
      recipe: textCandidate ?? EMPTY_RECIPE,
      source: 'web',
      usages,
    };
  }

  if (isVideoTooLong(input.durationSeconds)) {
    console.log('[invent] video skipped — too long', {
      durationSeconds: input.durationSeconds,
      limitLabel: formatMaxVideoDurationLabel(),
    });
    if (textCandidate) return { recipe: textCandidate, source: 'description', usages };
    return {
      recipe: EMPTY_RECIPE,
      source: 'video',
      usages,
      videoSkippedReason: 'too_long',
    };
  }

  try {
    const fromVideo = await inventWithVideo(input, language);
    if (fromVideo.usage) usages.push(fromVideo.usage);
    usedInstagramVideoDownload = fromVideo.usedInstagramVideoDownload === true;
    if (geminiFoundRecipe(fromVideo.recipe)) {
      return {
        recipe: fromVideo.recipe,
        source: 'video',
        usages,
        usedInstagramVideoDownload,
      };
    }
  } catch (err) {
    console.error('[invent] video step failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (textCandidate) return { recipe: textCandidate, source: 'description', usages };
    if (isTimeout(err)) {
      return { recipe: EMPTY_RECIPE, source: 'video', usages, usedInstagramVideoDownload };
    }
    throw err;
  }

  return {
    recipe: textCandidate ?? EMPTY_RECIPE,
    source: textCandidate ? 'description' : 'video',
    usages,
    usedInstagramVideoDownload,
  };
}

async function inventFromParts(
  input: ExtractInput,
  language: string,
  timeoutMs: number,
  kind: 'text' | 'video',
  extraParts: Array<{ fileData: { fileUri: string } }> = [],
): Promise<{ recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null }> {
  const textContext = buildInventContext(input);
  const { data, usage } = await generateLlmJson<GeminiRecipe>({
    tier: kind === 'video' ? 'standard' : 'fast',
    systemPrompt: INVENT_RULES,
    parts: [
      ...extraParts,
      {
        text: `${languageInstruction(language)}\n${textContext}`,
      },
    ],
    responseSchema: RECIPE_SCHEMA,
    timeoutMs,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: kind === 'video' ? 'invent_video' : 'invent_text',
    context: `inventRecipe.ts: ${kind}`,
  });
  return { recipe: normalizeGeminiRecipe(data), usage };
}

async function inventWithVideo(
  input: ExtractInput,
  language: string,
): Promise<{
  recipe: GeminiRecipe;
  usage: GeminiUsageSnapshot | null;
  usedInstagramVideoDownload?: boolean;
}> {
  let videoUri = input.videoUrl?.trim();
  if (!videoUri) {
    return inventFromParts(input, language, TEXT_TIMEOUT_MS, 'text');
  }

  let usedInstagramVideoDownload = false;
  if (input.platform === 'instagram' && isInstagramCdnUrl(videoUri)) {
    try {
      const hosted = await resolveInstagramVideoForGemini(input.sourceUrl);
      if (hosted && !isInstagramCdnUrl(hosted)) {
        videoUri = hosted;
        usedInstagramVideoDownload = true;
      } else {
        return { recipe: EMPTY_RECIPE, usage: null, usedInstagramVideoDownload };
      }
    } catch {
      return { recipe: EMPTY_RECIPE, usage: null, usedInstagramVideoDownload };
    }
  }

  const result = await inventFromParts(input, language, VIDEO_TIMEOUT_MS, 'video', [
    { fileData: { fileUri: videoUri } },
  ]);
  return { ...result, usedInstagramVideoDownload };
}

function buildInventContext(input: ExtractInput): string {
  const parts = [
    'Identify the dish from these sources and write a complete home-cook recipe. Invent missing measurements and steps when the source does not include a written recipe.',
  ];
  if (input.description?.trim()) {
    parts.push(`\n--- DESCRIPTION / PAGE ---\n${truncate(input.description, MAX_DESCRIPTION_CHARS)}`);
  }
  if (input.topComments.length > 0) {
    const ranked = [...input.topComments].sort((a, b) => Number(b.isCreator) - Number(a.isCreator));
    const comments = ranked
      .slice(0, MAX_COMMENTS)
      .map(
        (c, i) =>
          `${i + 1}. ${c.isCreator ? "(from the video's creator) " : ''}${truncate(c.text, MAX_COMMENT_CHARS)}`,
      )
      .join('\n');
    parts.push(`\n--- TOP COMMENTS ---\n${comments}`);
  }
  if (input.captions?.trim()) {
    parts.push(`\n--- CAPTIONS ---\n${truncate(input.captions, MAX_CAPTIONS_CHARS)}`);
  }
  return parts.join('\n');
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

function isTimeout(err: unknown): boolean {
  return err instanceof FetchError && err.message.toLowerCase().includes('timedout=true');
}
