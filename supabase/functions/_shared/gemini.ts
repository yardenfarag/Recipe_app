// Gemini extraction via the generateContent REST endpoint.
// Uses structured output (responseSchema) so we get valid JSON without parsing prose.

import { FetchError } from './errors.ts';
import {
  DUAL_INGREDIENT_SCHEMA,
  MEASUREMENT_RULES,
  mapDualIngredients,
  type DualIngredient,
} from './ingredientAmounts.ts';
import {
  resolveGeminiModel,
  type GeminiPart,
  type GeminiTier,
} from './geminiClient.ts';
import { filledFieldsSummary } from './classifyRecipe.ts';
import { generateLlmJson } from './llmClient.ts';
import { isInstagramCdnUrl, resolveInstagramVideoForGemini } from './instagram.ts';
import type { Platform } from './platform.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';
import { formatMaxVideoDurationLabel, isVideoTooLong } from './videoLimits.ts';

export type { GeminiUsageSnapshot } from './pricing.ts';

/** Text extract is simple structured IO — use Flash-Lite. Video needs standard Flash. */
const TEXT_TIMEOUT_MS = 35_000;
const VIDEO_TIMEOUT_MS = 120_000;
const TIMESTAMP_MAP_TIMEOUT_MS = 90_000;
const TEXT_MAX_OUTPUT_TOKENS = 6_144;
const VIDEO_MAX_OUTPUT_TOKENS = 6_144;
const MAX_DESCRIPTION_CHARS = 10_000;
const MAX_CAPTIONS_CHARS = 6_000;
const MAX_COMMENTS = 12;
const MAX_COMMENT_CHARS = 500;

const CALORIE_RULES = `- calories_reasoning: one short phrase naming the main caloric ingredients and confirming calories is TOTAL for all servings.
- calories: combined kcal for ALL portions at the stated servings (not per-portion). Example: 12 cookies ≈150 kcal each → servings=12, calories=1800.
- servings: equal portions the recipe yields (usually 1–12). Do not confuse grams or item counts with servings unless each item is one portion.`;

const TIME_RULES = `- time_reasoning: one short phrase (prep + cook/bake + waits).
- estimated_time_minutes: TOTAL wall-clock minutes until ready — include oven and mandatory waits, not just hands-on time. Example: mix 15 + chill 30 + bake 12 + cool 5 → 62.`;

const TAG_RULES = `- tags: 3–6 short lowercase labels (cuisine, meal, dish type, method, traits). Example: ["dessert","cookies","baked","american"]. No hashtags or invented diet claims.`;
const LANGUAGE_RULE =
  '- source_language: the lowercase ISO 639-1 language code used by the extracted title, ingredients, and instructions (for example en, es, he, ru, ar, de, or fr).';

const INSTRUCTION_RULES = `- Rewrite the source directions as clear, complete, plain-language instructions for a home cook.
- Preserve every explicit cooking action and keep the steps in the correct order. Split dense directions into separate steps when that makes them easier to follow.
- Make each step actionable: name what to add or do, where to do it, and include any stated time, temperature, texture, or visual cue.
- Whenever an ingredient is used, include its stated quantity and unit directly in that instruction (for example, "Add the 80 grams of sugar to the mixing bowl"). Keep the ingredient list and instructions consistent.
- Never invent a quantity, ingredient, technique, time, temperature, equipment, or missing action. If a detail is absent, write the clearest faithful step possible without adding it.
- Use short, simple sentences and direct verbs. Avoid vague wording such as "mix everything" when the source identifies the ingredients.`;

const TEXT_SYSTEM_PROMPT = `You are a master chef. Analyze the provided text from a social media post or recipe webpage and extract a precise recipe.

Rules:
- Use ONLY the text provided — do not guess or invent ingredients/steps that are not present.
- Comments marked "(from the video's creator)" are especially likely to contain the complete recipe.
- When a structured recipe (schema.org JSON-LD) is present, prefer it over surrounding page chrome (ads, navigation, related posts).
- Include ingredients with measurements, and step-by-step instructions when present.
${MEASUREMENT_RULES}
${INSTRUCTION_RULES}
- Estimate a cost tier from 1-3 dollar signs and an effort level when you can infer them.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
${LANGUAGE_RULE}
- If the text genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

const VIDEO_SYSTEM_PROMPT = `You are a master chef. Analyze the provided social media video together with any text context and extract a precise recipe.

Rules:
- Treat the video and text context as complementary sources — prefer explicit written measurements in text over visual guesses.
- Comments marked "(from the video's creator)" are especially likely to contain the authoritative recipe.
- Include ingredients with measurements, and step-by-step instructions.
${MEASUREMENT_RULES}
${INSTRUCTION_RULES}
- For each instruction, set timestamp_seconds to when that step begins in the video (whole seconds from 0). Omit if unclear.
- Steps must follow video chronology. Skip sponsor intros — first step may start after 0:15.
- Estimate a cost tier from 1-3 dollar signs and an effort level.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
${LANGUAGE_RULE}
- If the content genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

// A JSON-Schema subset supported by Gemini structured output.
export const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    found_recipe: { type: 'boolean' },
    source_language: { type: 'string' },
    title: { type: 'string' },
    servings: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: DUAL_INGREDIENT_SCHEMA,
    },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          text: {
            type: 'string',
            description:
              'Clear, complete, plain-language cooking direction with stated ingredient quantities included where used.',
          },
          timestamp_seconds: {
            type: 'integer',
            description:
              'Video only: second in the source video when this step begins. Omit when unknown.',
          },
        },
        required: ['step', 'text'],
      },
    },
    calories_reasoning: {
      type: 'string',
      description:
        'Brief chain-of-thought: key caloric ingredients, per-portion math, confirm total vs per-serving before setting calories.',
    },
    calories: { type: 'integer' },
    time_reasoning: {
      type: 'string',
      description:
        'Brief chain-of-thought: break down prep + cook/bake + required waits with minutes each, then sum to total wall-clock time before setting estimated_time_minutes.',
    },
    estimated_time_minutes: { type: 'integer' },
    cost_estimate: { type: 'string', enum: ['$', '$$', '$$$'] },
    effort_level: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description:
        '3–6 short lowercase labels: cuisine, meal, dish type, method, traits. Stable for trends.',
    },
  },
  required: [
    'found_recipe',
    'source_language',
    'title',
    'servings',
    'ingredients',
    'instructions',
  ],
};

const TIMESTAMP_MAP_PROMPT = `You map recipe steps to timestamps in a cooking video.

Rules:
- Watch the video and find when each listed step BEGINS (seconds from the start).
- Match step numbers exactly to the provided list.
- Include only steps with a clear visual or spoken moment.
- Return ONLY data matching the schema.`;

const TIMESTAMP_MAP_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          timestamp_seconds: { type: 'integer' },
        },
        required: ['step', 'timestamp_seconds'],
      },
    },
  },
  required: ['steps'],
};

export type ExtractionSource =
  | 'description'
  | 'comments'
  | 'captions'
  | 'video'
  | 'web'
  | 'photo';

export interface GeminiRecipe {
  found_recipe: boolean;
  source_language: string;
  title: string;
  servings: number;
  ingredients: DualIngredient[];
  instructions: { step: number; text: string; timestamp_seconds?: number }[];
  calories_reasoning?: string;
  calories?: number;
  time_reasoning?: string;
  estimated_time_minutes?: number;
  cost_estimate?: '$' | '$$' | '$$$';
  effort_level?: 'Easy' | 'Medium' | 'Hard';
  tags?: string[];
}

export interface LadderResult {
  recipe: GeminiRecipe;
  source: ExtractionSource;
  usages: GeminiUsageSnapshot[];
  /** True when Instagram download_media was needed for the video rung. */
  usedInstagramVideoDownload?: boolean;
  /** Set when multimodal video was skipped (e.g. duration cap). */
  videoSkippedReason?: 'too_long';
}

const EMPTY_RECIPE: GeminiRecipe = {
  found_recipe: false,
  source_language: 'en',
  title: '',
  servings: 0,
  ingredients: [],
  instructions: [],
};

export interface ExtractInput {
  platform: Platform;
  /** Canonical or source page URL persisted to the database. */
  sourceUrl: string;
  /** Direct video URL for multimodal fallback (IG/TikTok CDN). Falls back to sourceUrl. */
  videoUrl?: string;
  /** Source video length in seconds — skips multimodal when over the app limit. */
  durationSeconds?: number;
  description?: string;
  captions?: string;
  topComments: { text: string; isCreator: boolean }[];
}

type TextSections = {
  description?: boolean;
  comments?: boolean;
  captions?: boolean;
};

/** True when Gemini found anything worth keeping (full or partial). */
export function geminiFoundRecipe(r: GeminiRecipe): boolean {
  const hasTitle = Boolean(r.found_recipe && r.title?.trim());
  const hasIngredients = r.ingredients?.length > 0;
  const hasInstructions = r.instructions?.length > 0;
  return hasTitle && (hasIngredients || hasInstructions);
}

/** Title + ingredients + steps — skip the video rung. */
export function isFullGeminiRecipe(r: GeminiRecipe): boolean {
  return Boolean(
    r.found_recipe &&
      r.title?.trim() &&
      r.ingredients?.length > 0 &&
      r.instructions?.length > 0,
  );
}

function recipeCompleteness(r: GeminiRecipe): number {
  let score = 0;
  if (r.found_recipe && r.title?.trim()) score += 1;
  if (r.ingredients?.length) score += 2;
  if (r.instructions?.length) score += 2;
  return score;
}

function textExtractionSource(
  input: ExtractInput,
  hasCaptions: boolean,
  hasComments: boolean,
): ExtractionSource {
  if (input.platform === 'web') return 'web';
  if (hasCaptions) return 'captions';
  if (hasComments) return 'comments';
  return 'description';
}

async function attachTimestampsIfNeeded(
  input: ExtractInput,
  recipe: GeminiRecipe,
  source: ExtractionSource,
  usages: GeminiUsageSnapshot[],
): Promise<GeminiRecipe> {
  const shouldMapTimestamps =
    recipe.instructions.length > 0 &&
    input.platform !== 'web' &&
    !isVideoTooLong(input.durationSeconds) &&
    source !== 'captions' &&
    source !== 'web';
  if (!shouldMapTimestamps) return recipe;
  const mapped = await tryMapInstructionTimestamps(input, recipe.instructions, usages);
  return { ...recipe, instructions: mapped.instructions };
}

/**
 * Content ladder (cheapest first): all text sources in one call, then video.
 * Partial text results still try video so missing steps can be filled (ADR 013).
 */
export async function extractRecipeWithLadder(input: ExtractInput): Promise<LadderResult> {
  const hasDescription = Boolean(input.description?.trim());
  const hasComments = input.topComments.length > 0;
  const hasCaptions = Boolean(input.captions?.trim());
  const hasAnyText = hasDescription || hasComments || hasCaptions;
  const usages: GeminiUsageSnapshot[] = [];
  let usedInstagramVideoDownload = false;
  let textCandidate: { recipe: GeminiRecipe; source: ExtractionSource } | null = null;

  console.log('[gemini] ladder start', {
    platform: input.platform,
    fastModel: resolveGeminiModel('fast'),
    standardModel: resolveGeminiModel('standard'),
    hasDescription,
    descriptionLen: input.description?.trim().length ?? 0,
    comments: input.topComments.length,
    hasCaptions,
    hasVideoUrl: Boolean(input.videoUrl?.trim()),
    videoUrlHost: input.videoUrl ? safeUrlHost(input.videoUrl) : null,
    durationSeconds: input.durationSeconds ?? null,
    videoTooLong: isVideoTooLong(input.durationSeconds),
  });

  if (hasAnyText) {
    console.log('[gemini] text step start', { timeoutMs: TEXT_TIMEOUT_MS });
    const textStarted = Date.now();
    try {
      const fromText = await extractRecipeFromText(
        input,
        {
          description: hasDescription,
          comments: hasComments,
          captions: hasCaptions,
        },
        TEXT_TIMEOUT_MS,
      );
      if (fromText.usage) usages.push(fromText.usage);
      console.log('[gemini] text step done', {
        ms: Date.now() - textStarted,
        found: geminiFoundRecipe(fromText.recipe),
        full: isFullGeminiRecipe(fromText.recipe),
        foundRecipe: fromText.recipe.found_recipe,
        ingredients: fromText.recipe.ingredients?.length ?? 0,
        instructions: fromText.recipe.instructions?.length ?? 0,
        usage: fromText.usage,
      });
      if (geminiFoundRecipe(fromText.recipe)) {
        const source = textExtractionSource(input, hasCaptions, hasComments);
        let recipe = normalizeGeminiRecipe(fromText.recipe);
        if (isFullGeminiRecipe(recipe)) {
          recipe = await attachTimestampsIfNeeded(input, recipe, source, usages);
          return { recipe, source, usages };
        }
        textCandidate = { recipe, source };
        console.log('[gemini] text step partial — trying video before returning');
      }
    } catch (err) {
      console.error('[gemini] text step failed', {
        ms: Date.now() - textStarted,
        error: err instanceof Error ? err.message : String(err),
      });
      // Fall through to video / empty rather than surface a raw timeout to the user.
      if (!isGeminiTimeout(err)) throw err;
    }
  } else {
    console.log('[gemini] skipping text step — no description/comments/captions');
  }

  if (input.platform === 'web') {
    console.log('[gemini] web platform — skipping multimodal video step');
    return textCandidate
      ? { recipe: textCandidate.recipe, source: textCandidate.source, usages }
      : { recipe: EMPTY_RECIPE, source: 'web', usages };
  }

  if (!input.videoUrl?.trim() && textCandidate) {
    console.log('[gemini] skipping video step — no videoUrl, keeping partial text');
    return { recipe: textCandidate.recipe, source: textCandidate.source, usages };
  }

  console.log('[gemini] video step start');
  if (isVideoTooLong(input.durationSeconds)) {
    console.log('[gemini] video step skipped — duration over limit', {
      durationSeconds: input.durationSeconds,
      limitLabel: formatMaxVideoDurationLabel(),
    });
    if (textCandidate) {
      return { recipe: textCandidate.recipe, source: textCandidate.source, usages };
    }
    return {
      recipe: EMPTY_RECIPE,
      source: 'video',
      usages,
      usedInstagramVideoDownload,
      videoSkippedReason: 'too_long',
    };
  }

  try {
    const fromVideo = await extractRecipeWithVideo(input);
    if (fromVideo.usage) usages.push(fromVideo.usage);
    usedInstagramVideoDownload = fromVideo.usedInstagramVideoDownload === true;
    const videoRecipe = normalizeGeminiRecipe(fromVideo.recipe);
    console.log('[gemini] video step done', {
      found: geminiFoundRecipe(videoRecipe),
      full: isFullGeminiRecipe(videoRecipe),
      foundRecipe: videoRecipe.found_recipe,
      usage: fromVideo.usage,
    });
    if (
      geminiFoundRecipe(videoRecipe) &&
      (!textCandidate || recipeCompleteness(videoRecipe) >= recipeCompleteness(textCandidate.recipe))
    ) {
      return {
        recipe: videoRecipe,
        source: 'video',
        usages,
        usedInstagramVideoDownload,
      };
    }
    if (textCandidate) {
      return { recipe: textCandidate.recipe, source: textCandidate.source, usages };
    }
    return {
      recipe: videoRecipe,
      source: 'video',
      usages,
      usedInstagramVideoDownload,
    };
  } catch (err) {
    console.error('[gemini] video step failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (textCandidate) {
      return { recipe: textCandidate.recipe, source: textCandidate.source, usages };
    }
    if (isGeminiTimeout(err)) {
      return { recipe: EMPTY_RECIPE, source: 'video', usages, usedInstagramVideoDownload };
    }
    throw err;
  }
}

async function extractRecipeFromText(
  input: ExtractInput,
  sections: TextSections,
  timeoutMs: number,
): Promise<{ recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null }> {
  const textContext = buildTextContext(input, sections);
  return callGemini(TEXT_SYSTEM_PROMPT, [{ text: textContext }], timeoutMs, 'text');
}

const IMAGE_SYSTEM_PROMPT = `You are a master chef. Analyze the provided photo of a recipe (cookbook page, handwritten card, screenshot, or menu) and extract a precise recipe.

Rules:
- Use ONLY what is visible in the image — do not guess or invent ingredients/steps that are not present.
- Include ingredients with measurements, and step-by-step instructions when present.
${MEASUREMENT_RULES}
${INSTRUCTION_RULES}
- Estimate a cost tier from 1-3 dollar signs and an effort level when you can infer them.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
${LANGUAGE_RULE}
- If the image genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

const IMAGE_TIMEOUT_MS = 45_000;

export async function extractRecipeFromImage(input: {
  imageBase64: string;
  mimeType?: string;
}): Promise<{ recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null }> {
  const { data: recipe, usage, durationMs } = await generateLlmJson<GeminiRecipe>({
    tier: 'standard',
    systemPrompt: IMAGE_SYSTEM_PROMPT,
    parts: [
      {
        imageBase64: input.imageBase64,
        mimeType: input.mimeType ?? 'image/jpeg',
      },
      { text: 'Extract the recipe from this photo.' },
    ],
    responseSchema: RECIPE_SCHEMA,
    timeoutMs: IMAGE_TIMEOUT_MS,
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    kind: 'photo',
    context: 'gemini.ts: extractRecipeFromImage',
  });
  console.log('[gemini] photo extract ok', { ms: durationMs, usage });
  return { recipe: normalizeGeminiRecipe(recipe), usage };
}

const REPAIR_TIMEOUT_MS = 60_000;

const REPAIR_SYSTEM_PROMPT = `You repair an incomplete recipe extraction. Fill ONLY missing fields from the source text (and the current draft). Do not invent a different dish.

Rules:
- Keep the same dish identity, title spirit, and language as the current draft.
- If ingredients are missing, add them from the source. If steps are missing, write them from the source.
- Do not replace a complete ingredients or steps list with a different recipe.
- Never invent quantities, techniques, times, or equipment that are not in the source or draft.
${MEASUREMENT_RULES}
${INSTRUCTION_RULES}
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
${LANGUAGE_RULE}
- If the sources still do not contain the missing parts, keep the draft and leave those lists empty rather than guessing.
- Return ONLY data matching the schema.`;

const REPAIR_SCHEMA = {
  ...RECIPE_SCHEMA,
  properties: {
    ...RECIPE_SCHEMA.properties,
    filled_summary: {
      type: 'string',
      description: 'One short sentence of what you filled in (English is fine).',
    },
  },
};

export async function repairPartialRecipe(input: {
  current: GeminiRecipe;
  extraText?: string;
}): Promise<{
  recipe: GeminiRecipe;
  usage: GeminiUsageSnapshot | null;
  filledSummary: string;
}> {
  const draft = JSON.stringify(
    {
      title: input.current.title,
      servings: input.current.servings,
      ingredients: input.current.ingredients,
      instructions: input.current.instructions.map((step) => ({
        step: step.step,
        text: step.text,
      })),
      calories: input.current.calories ?? null,
      estimated_time_minutes: input.current.estimated_time_minutes ?? null,
      cost_estimate: input.current.cost_estimate ?? null,
      effort_level: input.current.effort_level ?? null,
      tags: input.current.tags ?? [],
      source_language: input.current.source_language,
    },
    null,
    2,
  );

  const extra = input.extraText?.trim()
    ? `\n\n--- SOURCE TEXT ---\n${truncate(input.extraText, MAX_DESCRIPTION_CHARS + MAX_CAPTIONS_CHARS)}`
    : '\n\nNo extra source text was available. Use only the current draft; do not invent missing parts.';

  const { data, usage, durationMs } = await generateLlmJson<
    GeminiRecipe & { filled_summary?: string }
  >({
    tier: 'standard',
    systemPrompt: REPAIR_SYSTEM_PROMPT,
    parts: [
      {
        text: `Current incomplete recipe draft:\n${draft}${extra}\n\nFill missing ingredients and/or steps only.`,
      },
    ],
    responseSchema: REPAIR_SCHEMA,
    timeoutMs: REPAIR_TIMEOUT_MS,
    maxOutputTokens: TEXT_MAX_OUTPUT_TOKENS,
    kind: 'repair',
    context: 'gemini.ts: repairPartialRecipe',
  });

  const recipe = normalizeGeminiRecipe(data);
  const modelSummary = typeof data.filled_summary === 'string' ? data.filled_summary.trim() : '';
  const filled = filledFieldsSummary(input.current, recipe);
  const filledSummary =
    modelSummary ||
    (filled.length > 0 ? `Filled: ${filled.join(', ')}.` : '');

  console.log('[gemini] repair ok', { ms: durationMs, usage, filled });
  return { recipe, usage, filledSummary };
}

async function extractRecipeWithVideo(
  input: ExtractInput,
): Promise<{
  recipe: GeminiRecipe;
  usage: GeminiUsageSnapshot | null;
  usedInstagramVideoDownload?: boolean;
}> {
  const textContext = buildTextContext(input, {
    description: true,
    comments: true,
    captions: true,
  });

  let videoUri = input.videoUrl?.trim();
  if (!videoUri) {
    console.log('[gemini] video step — no videoUrl, falling back to text-only');
    return callGemini(TEXT_SYSTEM_PROMPT, [{ text: textContext }], TEXT_TIMEOUT_MS, 'text');
  }

  let usedInstagramVideoDownload = false;

  // Instagram CDN URLs hang Gemini forever — only use hosted (download_media) URLs.
  if (input.platform === 'instagram') {
    if (isInstagramCdnUrl(videoUri)) {
      console.log('[gemini] resolving hosted Instagram video for Gemini', {
        cdnHost: safeUrlHost(videoUri),
      });
      const resolveStarted = Date.now();
      try {
        const hosted = await resolveInstagramVideoForGemini(input.sourceUrl);
        console.log('[gemini] hosted Instagram video resolve done', {
          ms: Date.now() - resolveStarted,
          gotHosted: Boolean(hosted),
          hostedHost: hosted ? safeUrlHost(hosted) : null,
          stillCdn: hosted ? isInstagramCdnUrl(hosted) : null,
        });
        if (hosted && !isInstagramCdnUrl(hosted)) {
          videoUri = hosted;
          usedInstagramVideoDownload = true;
        } else {
          console.log('[gemini] skipping multimodal — no Gemini-fetchable Instagram video');
          return { recipe: EMPTY_RECIPE, usage: null, usedInstagramVideoDownload };
        }
      } catch (err) {
        console.error('[gemini] hosted Instagram video resolve failed', {
          ms: Date.now() - resolveStarted,
          error: err instanceof Error ? err.message : String(err),
        });
        return { recipe: EMPTY_RECIPE, usage: null, usedInstagramVideoDownload };
      }
    }
  }

  console.log('[gemini] multimodal call', {
    timeoutMs: VIDEO_TIMEOUT_MS,
    videoHost: safeUrlHost(videoUri),
    isCdn: isInstagramCdnUrl(videoUri),
  });

  const result = await callGemini(
    VIDEO_SYSTEM_PROMPT,
    [{ fileData: { fileUri: videoUri } }, { text: textContext }],
    VIDEO_TIMEOUT_MS,
    'video',
  );
  return { ...result, usedInstagramVideoDownload };
}

export function normalizeGeminiRecipe(recipe: GeminiRecipe): GeminiRecipe {
  return {
    ...recipe,
    ingredients: mapDualIngredients(recipe.ingredients),
    instructions: normalizeInstructions(recipe.instructions ?? []),
  };
}

function normalizeInstructions(
  instructions: { step: number; text: string; timestamp_seconds?: number }[],
): GeminiRecipe['instructions'] {
  return instructions.map((step, index) => {
    const normalized: GeminiRecipe['instructions'][number] = {
      step: Number.isFinite(step.step) ? step.step : index + 1,
      text: step.text ?? '',
    };
    if (
      typeof step.timestamp_seconds === 'number' &&
      Number.isFinite(step.timestamp_seconds) &&
      step.timestamp_seconds >= 0
    ) {
      normalized.timestamp_seconds = Math.round(step.timestamp_seconds);
    }
    return normalized;
  });
}

async function resolvePlayableVideoUri(input: ExtractInput): Promise<string | null> {
  let videoUri = input.videoUrl?.trim();
  if (!videoUri) return null;

  if (input.platform === 'instagram' && isInstagramCdnUrl(videoUri)) {
    try {
      const hosted = await resolveInstagramVideoForGemini(input.sourceUrl);
      if (hosted && !isInstagramCdnUrl(hosted)) {
        videoUri = hosted;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  return videoUri;
}

async function tryMapInstructionTimestamps(
  input: ExtractInput,
  instructions: GeminiRecipe['instructions'],
  usages: GeminiUsageSnapshot[],
): Promise<{ instructions: GeminiRecipe['instructions'] }> {
  const videoUri = await resolvePlayableVideoUri(input);
  if (!videoUri) {
    return { instructions };
  }

  try {
    const mapped = await mapInstructionTimestampsFromVideo(input, instructions, videoUri);
    if (mapped.usage) usages.push(mapped.usage);
    return { instructions: mapped.instructions };
  } catch (err) {
    console.error('[gemini] timestamp map failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { instructions };
  }
}

async function mapInstructionTimestampsFromVideo(
  input: ExtractInput,
  instructions: GeminiRecipe['instructions'],
  videoUri: string,
): Promise<{ instructions: GeminiRecipe['instructions']; usage: GeminiUsageSnapshot | null }> {
  const stepList = instructions.map((step) => `${step.step}. ${step.text}`).join('\n');
  const prompt = `Find when each recipe step below begins in the video.\n\n--- STEPS ---\n${stepList}`;

  console.log('[gemini] timestamp map start', {
    platform: input.platform,
    steps: instructions.length,
    videoHost: safeUrlHost(videoUri),
  });

  const { data, usage } = await generateLlmJson<{ steps: { step: number; timestamp_seconds: number }[] }>({
    tier: 'standard',
    systemPrompt: TIMESTAMP_MAP_PROMPT,
    parts: [{ fileData: { fileUri: videoUri } }, { text: prompt }],
    responseSchema: TIMESTAMP_MAP_SCHEMA,
    timeoutMs: TIMESTAMP_MAP_TIMEOUT_MS,
    maxOutputTokens: 1_024,
    kind: 'timestamp_map',
    context: 'gemini.ts: mapInstructionTimestampsFromVideo',
  });

  const byStep = new Map<number, number>();
  for (const row of data.steps ?? []) {
    const step = Number(row.step);
    const seconds = Number(row.timestamp_seconds);
    if (Number.isFinite(step) && Number.isFinite(seconds) && seconds >= 0) {
      byStep.set(step, Math.round(seconds));
    }
  }

  return {
    instructions: instructions.map((inst) => {
      const timestamp = byStep.get(inst.step);
      return timestamp != null ? { ...inst, timestamp_seconds: timestamp } : inst;
    }),
    usage,
  };
}

async function callGemini(
  systemPrompt: string,
  parts: GeminiPart[],
  timeoutMs: number,
  kind: 'text' | 'video',
): Promise<{ recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null }> {
  const tier: GeminiTier = kind === 'video' ? 'standard' : 'fast';
  const { data: recipe, usage, durationMs } = await generateLlmJson<GeminiRecipe>({
    tier,
    systemPrompt,
    parts,
    responseSchema: RECIPE_SCHEMA,
    timeoutMs,
    maxOutputTokens: kind === 'video' ? VIDEO_MAX_OUTPUT_TOKENS : TEXT_MAX_OUTPUT_TOKENS,
    kind,
    context: 'gemini.ts: callGemini',
  });

  console.log('[gemini] callGemini ok', {
    kind,
    tier,
    ms: durationMs,
    usage,
  });
  return { recipe: normalizeGeminiRecipe(recipe), usage };
}

function safeUrlHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function isGeminiTimeout(err: unknown): boolean {
  return err instanceof FetchError && err.message.toLowerCase().includes('timedout=true');
}

function truncate(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars)}…`;
}

function buildTextContext(input: ExtractInput, sections: TextSections): string {
  const parts: string[] = [];
  parts.push('Extract the recipe from the sources below.');

  if (sections.description && input.description?.trim()) {
    parts.push(
      input.platform === 'web'
        ? `\n--- WEBPAGE CONTENT ---\n${truncate(input.description, MAX_DESCRIPTION_CHARS)}`
        : `\n--- VIDEO DESCRIPTION ---\n${truncate(input.description, MAX_DESCRIPTION_CHARS)}`,
    );
  }

  if (sections.comments && input.topComments.length > 0) {
    // Creator comments first — they usually hold the full recipe.
    const ranked = [...input.topComments].sort(
      (a, b) => Number(b.isCreator) - Number(a.isCreator),
    );
    const comments = ranked
      .slice(0, MAX_COMMENTS)
      .map(
        (c, i) =>
          `${i + 1}. ${c.isCreator ? "(from the video's creator) " : ''}${truncate(c.text, MAX_COMMENT_CHARS)}`,
      )
      .join('\n');
    parts.push(
      `\n--- TOP COMMENTS ---\nThe full recipe is often posted here rather than in the description, especially for Shorts.\n${comments}`,
    );
  }

  if (sections.captions && input.captions?.trim()) {
    parts.push(
      `\n--- VIDEO CAPTIONS / TRANSCRIPT ---\n${truncate(input.captions, MAX_CAPTIONS_CHARS)}`,
    );
  }

  if (sections.description === false && sections.comments === false && sections.captions) {
    parts.unshift('No description or comments were available — rely on the transcript below.');
  }

  return parts.join('\n');
}

/** @deprecated Use extractRecipeWithLadder — kept for import stability. */
export async function extractRecipeWithGemini(input: ExtractInput): Promise<GeminiRecipe> {
  return (await extractRecipeWithLadder(input)).recipe;
}
