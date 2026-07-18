// Gemini extraction via the generateContent REST endpoint.
// Uses structured output (responseSchema) so we get valid JSON without parsing prose.

import { AppError, FetchError } from './errors.ts';
import { isInstagramCdnUrl, resolveInstagramVideoForGemini } from './instagram.ts';
import type { Platform } from './platform.ts';

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
const TEXT_TIMEOUT_MS = 45_000;
const VIDEO_TIMEOUT_MS = 60_000;

const CALORIE_RULES = `- Before setting calories, write calories_reasoning: 1–3 sentences estimating kcal from the main caloric ingredients, show your per-portion math, and confirm whether calories will be TOTAL for all servings combined.
- For calories: return the combined kcal for ALL portions at the stated servings count (not per-portion). Example: 12 cookies at ~150 kcal each → servings=12, calories=1800.
- For servings: the number of equal portions the recipe yields (usually 1–12). Do not confuse grams or individual item counts with servings unless each item is one portion.`;

const TEXT_SYSTEM_PROMPT = `You are a master chef. Analyze the provided text from a social media post and extract a precise recipe.

Rules:
- Use ONLY the text provided — do not guess or invent ingredients/steps that are not present.
- Comments marked "(from the video's creator)" are especially likely to contain the complete recipe.
- Include ingredients with measurements, and step-by-step instructions when present.
- Estimate total time in minutes, a cost tier from 1-3 dollar signs, and an effort level when you can infer them.
${CALORIE_RULES}
- If the text genuinely contains no recipe, set found_recipe to false and leave other fields empty.
- Do NOT invent instructions if none are present — return what you found and leave instructions empty instead.
- Return ONLY data matching the schema.`;

const VIDEO_SYSTEM_PROMPT = `You are a master chef. Analyze the provided social media video together with any text context and extract a precise recipe.

Rules:
- Treat the video and text context as complementary sources — prefer explicit written measurements in text over visual guesses.
- Comments marked "(from the video's creator)" are especially likely to contain the authoritative recipe.
- Include ingredients with measurements, and step-by-step instructions.
- Estimate total time in minutes, a cost tier from 1-3 dollar signs, and an effort level.
${CALORIE_RULES}
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
    estimated_time_minutes: { type: 'integer' },
    cost_estimate: { type: 'string', enum: ['$', '$$', '$$$'] },
    effort_level: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
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
  estimated_time_minutes?: number;
  cost_estimate?: '$' | '$$' | '$$$';
  effort_level?: 'Easy' | 'Medium' | 'Hard';
}

export interface LadderResult {
  recipe: GeminiRecipe;
  source: ExtractionSource;
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

  console.log('[gemini] ladder start', {
    platform: input.platform,
    model: MODEL,
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
      console.log('[gemini] text step done', {
        ms: Date.now() - textStarted,
        found: geminiFoundRecipe(fromText),
        foundRecipe: fromText.found_recipe,
        ingredients: fromText.ingredients?.length ?? 0,
        instructions: fromText.instructions?.length ?? 0,
      });
      if (geminiFoundRecipe(fromText)) {
        return {
          recipe: fromText,
          source: hasCaptions ? 'captions' : hasComments ? 'comments' : 'description',
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
    console.log('[gemini] video step done', {
      found: geminiFoundRecipe(fromVideo),
      foundRecipe: fromVideo.found_recipe,
    });
    return { recipe: fromVideo, source: 'video' };
  } catch (err) {
    console.error('[gemini] video step failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    if (isGeminiTimeout(err)) {
      return { recipe: EMPTY_RECIPE, source: 'video' };
    }
    throw err;
  }
}

async function extractRecipeFromText(
  input: ExtractInput,
  sections: TextSections,
  timeoutMs: number,
): Promise<GeminiRecipe> {
  const textContext = buildTextContext(input, sections);
  return callGemini(TEXT_SYSTEM_PROMPT, [{ text: textContext }], timeoutMs);
}

async function extractRecipeWithVideo(input: ExtractInput): Promise<GeminiRecipe> {
  const textContext = buildTextContext(input, {
    description: true,
    comments: true,
    captions: true,
  });

  let videoUri = input.videoUrl?.trim();
  if (!videoUri) {
    console.log('[gemini] video step — no videoUrl, falling back to text-only');
    return callGemini(TEXT_SYSTEM_PROMPT, [{ text: textContext }], TEXT_TIMEOUT_MS);
  }

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
        } else {
          console.log('[gemini] skipping multimodal — no Gemini-fetchable Instagram video');
          return EMPTY_RECIPE;
        }
      } catch (err) {
        console.error('[gemini] hosted Instagram video resolve failed', {
          ms: Date.now() - resolveStarted,
          error: err instanceof Error ? err.message : String(err),
        });
        return EMPTY_RECIPE;
      }
    }
  }

  console.log('[gemini] multimodal call', {
    timeoutMs: VIDEO_TIMEOUT_MS,
    videoHost: safeUrlHost(videoUri),
    isCdn: isInstagramCdnUrl(videoUri),
  });

  return callGemini(
    VIDEO_SYSTEM_PROMPT,
    [{ fileData: { fileUri: videoUri } }, { text: textContext }],
    VIDEO_TIMEOUT_MS,
  );
}

async function callGemini(
  systemPrompt: string,
  parts: Array<{ text: string } | { fileData: { fileUri: string } }>,
  timeoutMs: number,
): Promise<GeminiRecipe> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new AppError('gemini.ts: callGemini', 'GEMINI_API_KEY is not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RECIPE_SCHEMA,
      // Gemini 3.5 defaults to medium thinking — too slow for Edge Function budgets.
      thinkingConfig: { thinkingLevel: 'minimal' },
    },
  };

  const hasFile = parts.some((p) => 'fileData' in p);
  console.log('[gemini] callGemini start', {
    model: MODEL,
    timeoutMs,
    hasFile,
    parts: parts.map((p) => ('text' in p ? `text:${p.text.length}` : `file:${safeUrlHost(p.fileData.fileUri)}`)),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

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
    console.error('[gemini] callGemini fetch failed', {
      ms: Date.now() - started,
      timedOut: isTimeout,
      timeoutMs,
      hasFile,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new FetchError('gemini.ts: callGemini', 'Gemini request failed', {
      timedOut: isTimeout,
      timeoutMs: timeoutMs,
      hasFile,
      originalError: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }

  console.log('[gemini] callGemini response', {
    ms: Date.now() - started,
    status: res.status,
    hasFile,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[gemini] callGemini HTTP error', {
      status: res.status,
      body: errText.slice(0, 500),
    });
    throw new FetchError('gemini.ts: callGemini', 'Gemini API returned an error', {
      status: res.status,
      body: errText,
    });
  }

  const data = await res.json();
  const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonText) {
    console.error('[gemini] callGemini empty content', {
      finishReason: data?.candidates?.[0]?.finishReason,
      blockReason: data?.promptFeedback?.blockReason,
    });
    throw new AppError('gemini.ts: callGemini', 'Gemini returned no content');
  }

  console.log('[gemini] callGemini ok', { ms: Date.now() - started, jsonLen: jsonText.length });
  return JSON.parse(jsonText) as GeminiRecipe;
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

function buildTextContext(input: ExtractInput, sections: TextSections): string {
  const parts: string[] = [];
  parts.push('Extract the recipe from the sources below.');

  if (sections.description && input.description?.trim()) {
    parts.push(`\n--- VIDEO DESCRIPTION ---\n${input.description.trim()}`);
  }

  if (sections.comments && input.topComments.length > 0) {
    const comments = input.topComments
      .map((c, i) => `${i + 1}. ${c.isCreator ? "(from the video's creator) " : ''}${c.text}`)
      .join('\n');
    parts.push(
      `\n--- TOP COMMENTS ---\nThe full recipe is often posted here rather than in the description, especially for Shorts.\n${comments}`,
    );
  }

  if (sections.captions && input.captions?.trim()) {
    parts.push(`\n--- VIDEO CAPTIONS / TRANSCRIPT ---\n${input.captions.trim()}`);
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
