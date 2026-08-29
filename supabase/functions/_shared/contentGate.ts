import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  currentUtcDate,
  refundDailyAiUsage,
  refundGuestDailyAiUsage,
  reserveDailyAiUsage,
  reserveGuestDailyAiUsage,
} from './dailyAiUsage.ts';
import { generateLlmJson } from './llmClient.ts';
import { fetchImageAsBase64 } from './persistThumbnail.ts';
import {
  CONTENT_GATE_DAILY_LIMIT,
  GUEST_CONTENT_GATE_DAILY_LIMIT,
  type GeminiUsageSnapshot,
} from './pricing.ts';

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

export type ContentGateOk = {
  status: 'ok';
  kind: ContentKind;
  dishGuess: string;
  usage: GeminiUsageSnapshot | null;
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

export async function classifyContent(
  input: ClassifyContentInput,
): Promise<{ kind: ContentKind; dishGuess: string; usage: GeminiUsageSnapshot | null }> {
  let imageBase64 = input.imageBase64?.trim() || null;
  let mimeType = input.mimeType ?? 'image/jpeg';

  if (!imageBase64 && input.thumbnailUrl?.trim()) {
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

  const { data, usage } = await generateLlmJson<{ kind?: string; dish_guess?: string }>({
    tier: 'fast',
    systemPrompt: SYSTEM_PROMPT,
    parts,
    responseSchema: SCHEMA,
    timeoutMs: 20_000,
    maxOutputTokens: 256,
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

  return { kind, dishGuess, usage };
}

export async function runContentGate(opts: {
  admin: SupabaseClient;
  userId: string | null;
  guestInstallId: string | null;
  input: ClassifyContentInput;
}): Promise<ContentGateResult> {
  const { admin, userId, guestInstallId, input } = opts;
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
    const classified = await classifyContent(input);
    return {
      status: 'ok',
      kind: classified.kind,
      dishGuess: classified.dishGuess,
      usage: classified.usage,
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

/** IG/TikTok posts with no thumbnail and no caption cannot be classified; let video/extract proceed. */
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
  if (platform !== 'instagram' && platform !== 'tiktok') return false;
  const hasText = Boolean(
    meta?.title?.trim() || meta?.description?.trim() || meta?.captions?.trim(),
  );
  if (hasText || meta?.thumbnailUrl?.trim()) return false;
  return true;
}
