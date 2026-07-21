// Gemini extraction via the generateContent REST endpoint.
// Uses structured output (responseSchema) so we get valid JSON without parsing prose.

import { FetchError } from './errors.ts';
import {
  generateGeminiJson,
  resolveGeminiModel,
  type GeminiPart,
  type GeminiTier,
} from './geminiClient.ts';
import { isInstagramCdnUrl, resolveInstagramVideoForGemini } from './instagram.ts';
import type { Platform } from './platform.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

export type { GeminiUsageSnapshot } from './pricing.ts';

/** Text extract is simple structured IO — use Flash-Lite. Video needs standard Flash. */
const TEXT_TIMEOUT_MS = 35_000;
const VIDEO_TIMEOUT_MS = 60_000;
const TEXT_MAX_OUTPUT_TOKENS = 4_096;
const VIDEO_MAX_OUTPUT_TOKENS = 4_096;
const MAX_DESCRIPTION_CHARS = 4_000;
const MAX_CAPTIONS_CHARS = 6_000;
const MAX_COMMENTS = 12;
const MAX_COMMENT_CHARS = 500;

const CALORIE_RULES = `- calories_reasoning: one short phrase naming the main caloric ingredients and confirming calories is TOTAL for all servings.
- calories: combined kcal for ALL portions at the stated servings (not per-portion). Example: 12 cookies ≈150 kcal each → servings=12, calories=1800.
- servings: equal portions the recipe yields (usually 1–12). Do not confuse grams or item counts with servings unless each item is one portion.`;

const TIME_RULES = `- time_reasoning: one short phrase (prep + cook/bake + waits).
- estimated_time_minutes: TOTAL wall-clock minutes until ready — include oven and mandatory waits, not just hands-on time. Example: mix 15 + chill 30 + bake 12 + cool 5 → 62.`;

const TAG_RULES = `- tags: 3–6 short lowercase labels (cuisine, meal, dish type, method, traits). Example: ["dessert","cookies","baked","american"]. No hashtags or invented diet claims.`;

const TEXT_SYSTEM_PROMPT = `You are a master chef. Analyze the provided text from a social media post and extract a precise recipe.

Rules:
- Use ONLY the text provided — do not guess or invent ingredients/steps that are not present.
- Comments marked "(from the video's creator)" are especially likely to contain the complete recipe.
- Include ingredients with measurements, and step-by-step instructions when present.
- Estimate a cost tier from 1-3 dollar signs and an effort level when you can infer them.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
- If the text genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

const VIDEO_SYSTEM_PROMPT = `You are a master chef. Analyze the provided social media video together with any text context and extract a precise recipe.

Rules:
- Treat the video and text context as complementary sources — prefer explicit written measurements in text over visual guesses.
- Comments marked "(from the video's creator)" are especially likely to contain the authoritative recipe.
- Include ingredients with measurements, and step-by-step instructions.
- Estimate a cost tier from 1-3 dollar signs and an effort level.
${TIME_RULES}
${CALORIE_RULES}
${TAG_RULES}
- If the content genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

// A JSON-Schema subset supported by Gemini structured output.
const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    found_recipe: { type: 'boolean' },
    title: { type: 'string' },
    servings: { type: 'integer' },
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
  required: ['found_recipe', 'title', 'servings', 'ingredients', 'instructions'],
};

export type ExtractionSource = 'description' | 'comments' | 'captions' | 'video';

export interface GeminiRecipe {
  found_recipe: boolean;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
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
}

const EMPTY_RECIPE: GeminiRecipe = {
  found_recipe: false,
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

/**
 * Content ladder (cheapest first): all text sources in one call, then video.
 * A single combined text request avoids stacking multiple Gemini timeouts.
 */
export async function extractRecipeWithLadder(input: ExtractInput): Promise<LadderResult> {
  const hasDescription = Boolean(input.description?.trim());
  const hasComments = input.topComments.length > 0;
  const hasCaptions = Boolean(input.captions?.trim());
  const hasAnyText = hasDescription || hasComments || hasCaptions;
  const usages: GeminiUsageSnapshot[] = [];
  let usedInstagramVideoDownload = false;

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
        foundRecipe: fromText.recipe.found_recipe,
        ingredients: fromText.recipe.ingredients?.length ?? 0,
        instructions: fromText.recipe.instructions?.length ?? 0,
        usage: fromText.usage,
      });
      if (geminiFoundRecipe(fromText.recipe)) {
        return {
          recipe: fromText.recipe,
          source: hasCaptions ? 'captions' : hasComments ? 'comments' : 'description',
          usages,
        };
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

  console.log('[gemini] video step start');
  try {
    const fromVideo = await extractRecipeWithVideo(input);
    if (fromVideo.usage) usages.push(fromVideo.usage);
    usedInstagramVideoDownload = fromVideo.usedInstagramVideoDownload === true;
    console.log('[gemini] video step done', {
      found: geminiFoundRecipe(fromVideo.recipe),
      foundRecipe: fromVideo.recipe.found_recipe,
      usage: fromVideo.usage,
    });
    return {
      recipe: fromVideo.recipe,
      source: 'video',
      usages,
      usedInstagramVideoDownload,
    };
  } catch (err) {
    console.error('[gemini] video step failed', {
      error: err instanceof Error ? err.message : String(err),
    });
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

async function callGemini(
  systemPrompt: string,
  parts: GeminiPart[],
  timeoutMs: number,
  kind: 'text' | 'video',
): Promise<{ recipe: GeminiRecipe; usage: GeminiUsageSnapshot | null }> {
  const tier: GeminiTier = kind === 'video' ? 'standard' : 'fast';
  const { data: recipe, usage, durationMs } = await generateGeminiJson<GeminiRecipe>({
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
  return { recipe, usage };
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
      `\n--- VIDEO DESCRIPTION ---\n${truncate(input.description, MAX_DESCRIPTION_CHARS)}`,
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
