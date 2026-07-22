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
import { formatMaxVideoDurationLabel, isVideoTooLong } from './videoLimits.ts';

export type { GeminiUsageSnapshot } from './pricing.ts';

/** Text extract is simple structured IO — use Flash-Lite. Video needs standard Flash. */
const TEXT_TIMEOUT_MS = 35_000;
const VIDEO_TIMEOUT_MS = 120_000;
const TIMESTAMP_MAP_TIMEOUT_MS = 90_000;
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
- For each instruction, set timestamp_seconds to when that step begins in the video (whole seconds from 0). Omit if unclear.
- Steps must follow video chronology. Skip sponsor intros — first step may start after 0:15.
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
  required: ['found_recipe', 'title', 'servings', 'ingredients', 'instructions'],
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

export type ExtractionSource = 'description' | 'comments' | 'captions' | 'video';

export interface GeminiRecipe {
  found_recipe: boolean;
  title: string;
  servings: number;
  ingredients: { name: string; quantity: number; unit: string }[];
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
        foundRecipe: fromText.recipe.found_recipe,
        ingredients: fromText.recipe.ingredients?.length ?? 0,
        instructions: fromText.recipe.instructions?.length ?? 0,
        usage: fromText.usage,
      });
      if (geminiFoundRecipe(fromText.recipe)) {
        let recipe = normalizeGeminiRecipe(fromText.recipe);
        const textSource: ExtractionSource = hasCaptions
          ? 'captions'
          : hasComments
            ? 'comments'
            : 'description';
        const shouldMapTimestamps =
          recipe.instructions.length > 0 &&
          !isVideoTooLong(input.durationSeconds) &&
          textSource !== 'captions';
        if (shouldMapTimestamps) {
          const mapped = await tryMapInstructionTimestamps(input, recipe.instructions, usages);
          recipe = { ...recipe, instructions: mapped.instructions };
        }
        return {
          recipe,
          source: textSource,
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
  if (isVideoTooLong(input.durationSeconds)) {
    console.log('[gemini] video step skipped — duration over limit', {
      durationSeconds: input.durationSeconds,
      limitLabel: formatMaxVideoDurationLabel(),
    });
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
    console.log('[gemini] video step done', {
      found: geminiFoundRecipe(fromVideo.recipe),
      foundRecipe: fromVideo.recipe.found_recipe,
      usage: fromVideo.usage,
    });
    return {
      recipe: normalizeGeminiRecipe(fromVideo.recipe),
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

function normalizeGeminiRecipe(recipe: GeminiRecipe): GeminiRecipe {
  return {
    ...recipe,
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

  const { data, usage } = await generateGeminiJson<{ steps: { step: number; timestamp_seconds: number }[] }>({
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
