import type { Db } from '../core/supabaseAdmin.ts';

import {
  currentUtcDate,
  refundDailyAiUsage,
  refundGuestDailyAiUsage,
  reserveDailyAiUsage,
  reserveGuestDailyAiUsage,
} from '../core/dailyAiUsage.ts';
import { generateLlmJson } from '../llm/llmClient.ts';
import {
  type ClarifyingQuestion,
  cleanClarifyingText,
  MAX_OPTION_LENGTH,
  sanitizeClarifyingQuestions,
} from './clarifyingQuestions.ts';
import { fetchImageAsBase64 } from './persistThumbnail.ts';
import {
  CONTENT_GATE_DAILY_LIMIT,
  GUEST_CONTENT_GATE_DAILY_LIMIT,
  type GeminiUsageSnapshot,
} from '../llm/pricing.ts';

export { CONTENT_GATE_DAILY_LIMIT, GUEST_CONTENT_GATE_DAILY_LIMIT };

export type ContentKind = 'written_recipe' | 'plated_dish' | 'mixed' | 'unrelated';

export type ClassifyContentInput = {
  imageBase64?: string | null;
  mimeType?: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  thumbnailReferer?: string | null;
};

/**
 * Ask clarifying questions only below this confidence, and only when the model wrote some
 * (ADR 031, PIN-64). Starting value; eval/clarify.ts picks the final one.
 */
export const CLARIFY_CONFIDENCE_THRESHOLD = 0.7;
export const MAX_DISH_CANDIDATES = 3;

/** How sure the gate is of the dish, asked for only by Guess from a photo (`clarify` option). */
export type DishClarification = {
  /** 0–1, or null when the model gave no usable number. */
  confidence: number | null;
  /** Most likely first. */
  candidates: string[];
  questions: ClarifyingQuestion[];
};

export type ClassifyContentOptions = {
  /** Also rate the dish guess and write clarifying questions, in this language code. */
  clarify?: { language: string };
};

export type ContentGateOk = {
  status: 'ok';
  kind: ContentKind;
  dishGuess: string;
  usage: GeminiUsageSnapshot | null;
  /** Only when `clarify` was asked for and the content is food. */
  clarification?: DishClarification;
};

export type ContentGateResult =
  | ContentGateOk
  | { status: 'limited' }
  | { status: 'error'; error: string };

const KINDS: ContentKind[] = ['written_recipe', 'plated_dish', 'mixed', 'unrelated'];

const SYSTEM_PROMPT = `You decide whether content can become a cooking recipe.

Allow only food, meals, drinks, desserts, snacks, cookable ingredients, written recipes (cookbook pages, cards, screenshots), or cooking/plating videos.

Reject people with no food, pets, landscapes, memes, products, documents, UI screenshots, NSFW, DIY, vehicles, and random objects. A person holding a plate of food is allow.

kind:
- written_recipe: readable recipe text (ingredients/steps) is the main content
- plated_dish: a dish, drink, or dessert with no readable recipe
- mixed: food plus visible recipe text
- unrelated: not something we can make a recipe from

dish_guess: short name of the dish or drink when kind is not unrelated, else empty.
Return ONLY data matching the schema.`;

const SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: KINDS,
    },
    dish_guess: { type: 'string' },
  },
  required: ['kind', 'dish_guess'],
};

function clarifyPrompt(language: string): string {
  const code = /^[a-z]{2}$/i.test(language.trim()) ? language.trim().toLowerCase() : 'en';
  return `

Also say how sure you are of the dish, for a cook who will write its recipe.
confidence: 0 to 1, how likely dish_guess is the right dish.
candidates: your 1-${MAX_DISH_CANDIDATES} most likely dishes, most likely first, as short names.
questions: ask only when the candidates would be cooked clearly differently (a different main ingredient or protein, cooking method, sweet vs savoury, or cuisine). Then write 1-3 short multiple-choice questions whose 2-4 options come from the candidates. Never ask about garnish, plating or small details. Most photos need no questions: return [] when one dish is clearly most likely, or when the candidates would be cooked the same way.
Write candidates, questions and options in language code "${code}". Keep each question under 80 characters and each option under 40.
When kind is unrelated: confidence 0, candidates [], questions [].`;
}

const CLARIFY_SCHEMA = {
  type: 'object',
  properties: {
    ...SCHEMA.properties,
    confidence: { type: 'number' },
    candidates: { type: 'array', items: { type: 'string' } },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['question', 'options'],
      },
    },
  },
  required: [...SCHEMA.required, 'confidence', 'candidates', 'questions'],
};

/** Reads the clarify fields of a gate answer. Never throws: missing or invalid parts come back empty. */
export function parseDishClarification(data: Record<string, unknown>): DishClarification {
  const rawConfidence = data.confidence;
  const confidence =
    typeof rawConfidence === 'number' && Number.isFinite(rawConfidence)
      ? Math.min(1, Math.max(0, rawConfidence))
      : null;

  const candidates: string[] = [];
  if (Array.isArray(data.candidates)) {
    for (const raw of data.candidates) {
      const name = cleanClarifyingText(raw, MAX_OPTION_LENGTH);
      if (!name || candidates.some((c) => c.toLocaleLowerCase() === name.toLocaleLowerCase())) continue;
      candidates.push(name);
      if (candidates.length === MAX_DISH_CANDIDATES) break;
    }
  }

  return { confidence, candidates, questions: sanitizeClarifyingQuestions(data.questions) };
}

/**
 * ADR 031 D1: ask only when the gate is unsure *and* the candidates would make different recipes.
 * The model signals the second by writing questions. With no usable confidence we guess as today.
 */
export function shouldAskClarifyingQuestions(clarification: DishClarification | undefined): boolean {
  if (!clarification || clarification.confidence === null) return false;
  return (
    clarification.confidence < CLARIFY_CONFIDENCE_THRESHOLD &&
    clarification.candidates.length >= 2 &&
    clarification.questions.length > 0
  );
}

export type InventGatePlan = {
  runGate: boolean;
  clarify: boolean;
  /**
   * The food check already passed (Extract → "Guess instead?") and the gate runs only to ask.
   * Its verdict on food then doesn't count: a limit, an error or "unrelated" all mean guess as before.
   */
  onlyToAsk: boolean;
};

/** ADR 031 D2, D5: only photos, only from an app that can show questions, and only once. */
export function mayAskClarifyingQuestions(opts: {
  platform: string;
  canClarify: boolean;
  questionsDone: boolean;
}): boolean {
  return opts.platform === 'photo' && opts.canClarify && !opts.questionsDone;
}

/**
 * Whether invent-recipe runs the content gate, and with clarifying questions (ADR 031).
 * A photo from an app that can show questions is checked even after an earlier food check
 * (the Extract → "Guess instead?" offer, D7), unless its questions are already done.
 * Every other request is planned exactly as before PIN-64.
 */
export function planInventGate(opts: {
  platform: string;
  alreadyGated: boolean;
  thinSocialPost: boolean;
  canClarify: boolean;
  questionsDone: boolean;
}): InventGatePlan {
  if (mayAskClarifyingQuestions(opts)) return { runGate: true, clarify: true, onlyToAsk: opts.alreadyGated };
  return { runGate: !opts.alreadyGated && !opts.thinSocialPost, clarify: false, onlyToAsk: false };
}

/** The content kind invent-recipe acts on after the gate ran (D7: a re-check only to ask can't reject). */
export function inventKindAfterGate(plan: InventGatePlan, kind: ContentKind): ContentKind {
  return plan.onlyToAsk && kind === 'unrelated' ? 'plated_dish' : kind;
}

export async function classifyContent(
  input: ClassifyContentInput,
  options: ClassifyContentOptions = {},
): Promise<{
  kind: ContentKind;
  dishGuess: string;
  usage: GeminiUsageSnapshot | null;
  clarification?: DishClarification;
}> {
  let imageBase64 = input.imageBase64?.trim() || null;
  let mimeType = input.mimeType ?? 'image/jpeg';

  const textLen = (input.title?.trim().length ?? 0) + (input.description?.trim().length ?? 0);
  // A caption or page already gives the classifier enough to work with.
  // Downloading a thumbnail and sending it as vision adds a round trip.
  if (!imageBase64 && input.thumbnailUrl?.trim() && textLen < 280) {
    const fetched = await fetchImageAsBase64({
      sourceUrl: input.thumbnailUrl,
      referer: input.thumbnailReferer ?? undefined,
    });
    if (fetched) {
      imageBase64 = fetched.base64;
      mimeType = fetched.mimeType;
    }
  }

  const textBits: string[] = [];
  if (input.title?.trim()) textBits.push(`Title: ${input.title.trim().slice(0, 200)}`);
  if (input.description?.trim()) {
    textBits.push(`Caption or page text:\n${input.description.trim().slice(0, 2500)}`);
  }
  const text =
    textBits.join('\n\n') ||
    (imageBase64
      ? 'Classify the attached image.'
      : 'No image and almost no text. If this is a cooking or food video/page, mark plated_dish. Only mark unrelated when the text is clearly not food.');

  const parts: Array<{ text: string } | { imageBase64: string; mimeType: string }> = [];
  if (imageBase64) {
    parts.push({ imageBase64, mimeType });
  }
  parts.push({ text });

  const clarify = options.clarify;
  const { data, usage } = await generateLlmJson<Record<string, unknown>>({
    systemPrompt: clarify ? SYSTEM_PROMPT + clarifyPrompt(clarify.language) : SYSTEM_PROMPT,
    parts,
    responseSchema: clarify ? CLARIFY_SCHEMA : SCHEMA,
    timeoutMs: 20_000,
    maxOutputTokens: clarify ? 700 : 256,
    kind: 'content_gate',
    context: 'contentGate.ts: classifyContent',
  });

  const kind = KINDS.includes(data.kind as ContentKind)
    ? (data.kind as ContentKind)
    : 'mixed';
  const dishGuess =
    kind === 'unrelated'
      ? ''
      : typeof data.dish_guess === 'string'
        ? data.dish_guess.trim().slice(0, 80)
        : '';

  if (!clarify || kind === 'unrelated') return { kind, dishGuess, usage };
  return { kind, dishGuess, usage, clarification: parseDishClarification(data) };
}

export async function runContentGate(opts: {
  admin: Db;
  userId: string | null;
  guestInstallId: string | null;
  input: ClassifyContentInput;
  options?: ClassifyContentOptions;
}): Promise<ContentGateResult> {
  const { admin, userId, guestInstallId, input, options } = opts;
  const usageDate = currentUtcDate();
  const reserved = userId
    ? await reserveDailyAiUsage(admin, userId, 'content_gate', CONTENT_GATE_DAILY_LIMIT, usageDate)
    : await reserveGuestDailyAiUsage(
        admin,
        guestInstallId!,
        'content_gate',
        GUEST_CONTENT_GATE_DAILY_LIMIT,
        usageDate,
      );

  if (reserved === 'error') return { status: 'error', error: 'gate_unavailable' };
  if (reserved === 'limited') return { status: 'limited' };

  try {
    const classified = await classifyContent(input, options);
    return {
      status: 'ok',
      kind: classified.kind,
      dishGuess: classified.dishGuess,
      usage: classified.usage,
      ...(classified.clarification ? { clarification: classified.clarification } : {}),
    };
  } catch (err) {
    if (userId) {
      await refundDailyAiUsage(admin, userId, 'content_gate', usageDate);
    } else if (guestInstallId) {
      await refundGuestDailyAiUsage(admin, guestInstallId, 'content_gate', usageDate);
    }
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function thumbnailRefererForPlatform(
  platform: string,
): string | undefined {
  if (platform === 'instagram') return 'https://www.instagram.com/';
  if (platform === 'tiktok') return 'https://www.tiktok.com/';
  if (platform === 'facebook') return 'https://www.facebook.com/';
  return undefined;
}

export function buildContentGateInput(opts: {
  imageBase64?: string | null;
  mimeType?: string;
  platform: string;
  contentId?: string | null;
  meta?: {
    title?: string;
    description?: string;
    captions?: string;
    thumbnailUrl?: string;
  } | null;
  youtubeThumbnailUrl?: string | null;
}): ClassifyContentInput {
  const { imageBase64, mimeType, platform, contentId, meta, youtubeThumbnailUrl } = opts;
  const title = meta?.title?.trim() || undefined;
  const description = [meta?.description, meta?.captions].filter(Boolean).join('\n\n');
  return {
    imageBase64,
    mimeType,
    title,
    description: description || undefined,
    thumbnailUrl:
      meta?.thumbnailUrl ??
      (platform === 'youtube' && contentId ? youtubeThumbnailUrl ?? null : null),
    thumbnailReferer: thumbnailRefererForPlatform(platform),
  };
}

/** IG/TikTok/Facebook/Pinterest posts with no thumbnail and no caption cannot be classified; let video/extract proceed. */
export function shouldSkipThinSocialGate(opts: {
  platform: string;
  imageBase64?: string | null;
  contentId?: string | null;
  meta?: {
    title?: string;
    description?: string;
    captions?: string;
    thumbnailUrl?: string;
  } | null;
}): boolean {
  const { platform, imageBase64, meta } = opts;
  if (imageBase64?.trim()) return false;
  if (platform !== 'instagram' && platform !== 'tiktok' && platform !== 'facebook' && platform !== 'pinterest') {
    return false;
  }
  const hasText = Boolean(
    meta?.title?.trim() || meta?.description?.trim() || meta?.captions?.trim(),
  );
  if (hasText || meta?.thumbnailUrl?.trim()) return false;
  return true;
}
