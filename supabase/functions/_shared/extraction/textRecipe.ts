/**
 * Import a recipe someone wrote out as text (ADR 032): a message from a WhatsApp chat, in any language.
 *
 * It costs one credit like every import (ADR 025), and nothing when it isn't a recipe. The food check reads the text
 * first; then the text model reads it with the same prompt as a post's caption. There is no link, so the recipe is
 * saved as a written one (ADR 018) and never reaches the Hub. No cover is drawn: that costs more than the credit earns.
 */

import type { LlmUsageSnapshot } from '../llm/pricing.ts';
import type { ClassifyContentInput, ContentKind } from './contentGate.ts';
import { extractRecipeFromMessage, isLlmTimeout, type LlmRecipe } from './recipeExtraction.ts';

/** Shorter than this, it can't hold a recipe ("Lasagna recipe pls 🙏"). The apps check the same bounds. */
export const MIN_RECIPE_TEXT_CHARS = 40;
/** A long recipe with its story fits in a third of this. Past it, it's a whole chat pasted in, not a message. */
export const MAX_RECIPE_TEXT_CHARS = 20_000;

/** Why a text is turned away before anything is charged or any model is called. */
export type TextRejectCode = 'text_too_short' | 'text_too_long';

/** How a written recipe is saved: no link, no platform, marked as written (ADR 018), so the Library says so. */
export const TEXT_RECIPE_ORIGIN = { platform: 'unknown', extraction_source: 'manual' } as const;

/** The server's English words for a turned-away text. The apps show their own translation for the code. */
export function textRejectMessage(code: TextRejectCode): string {
  switch (code) {
    case 'text_too_short':
      return "That's too short to be a recipe. Try a message with the ingredients and steps.";
    case 'text_too_long':
      return `That text is too long. Try just the recipe, under ${MAX_RECIPE_TEXT_CHARS.toLocaleString('en')} characters.`;
  }
}

/**
 * Reads the request's `text`. Null when there is none (not a string). Length is counted after trimming, in UTF-16
 * code units (JavaScript's `length`), the same way the apps count it.
 */
export function readRecipeText(
  raw: unknown,
): { ok: true; text: string } | { ok: false; code: TextRejectCode } | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (text.length < MIN_RECIPE_TEXT_CHARS) return { ok: false, code: 'text_too_short' };
  if (text.length > MAX_RECIPE_TEXT_CHARS) return { ok: false, code: 'text_too_long' };
  return { ok: true, text };
}

/** The food check's input: the text alone (no picture to fetch). */
export function textGateInput(text: string): ClassifyContentInput {
  return { description: text };
}

/**
 * What the food check's answer means for a text. `unrelated` isn't food. `plated_dish` is food talk with no recipe in
 * it ("made shakshuka last night, so good"): turned away for free, unless the cook asked to read it anyway.
 */
export function textGateOutcome(kind: ContentKind, forceExtract: boolean): 'extract' | 'not_food' | 'no_recipe' {
  if (kind === 'unrelated') return 'not_food';
  if (kind === 'plated_dish' && !forceExtract) return 'no_recipe';
  return 'extract';
}

const TEXT_TIMEOUT_MS = 35_000;
/** Below this much time left, the call isn't started: it would be cut off before it could answer. */
const MIN_TEXT_MS = 8_000;

const EMPTY_RECIPE: LlmRecipe = {
  found_recipe: false,
  source_language: 'en',
  title: '',
  servings: 0,
  ingredients: [],
  instructions: [],
};

export type TextExtraction = {
  recipe: LlmRecipe;
  usages: LlmUsageSnapshot[];
  /** The model didn't answer in time (or there was no time to ask): refunded, and the app says to try again. */
  timedOut?: true;
};

/** The model call, replaceable in tests. */
export type MessageReader = (
  text: string,
  timeoutMs: number,
) => Promise<{ recipe: LlmRecipe; usage: LlmUsageSnapshot | null }>;

/**
 * Reads the recipe out of a written text with the text model. `deadlineAt` (epoch ms) shrinks the timeout, and a call
 * that can't fit isn't started. A timeout comes back as `timedOut`; any other error is thrown.
 */
export async function extractRecipeFromText(
  input: { text: string; deadlineAt?: number },
  read: MessageReader = extractRecipeFromMessage,
): Promise<TextExtraction> {
  const timeoutMs = input.deadlineAt === undefined
    ? TEXT_TIMEOUT_MS
    : Math.max(0, Math.min(TEXT_TIMEOUT_MS, input.deadlineAt - Date.now()));
  if (timeoutMs < MIN_TEXT_MS) return { recipe: EMPTY_RECIPE, usages: [], timedOut: true };
  try {
    const { recipe, usage } = await read(input.text, timeoutMs);
    return { recipe, usages: usage ? [usage] : [] };
  } catch (err) {
    if (!isLlmTimeout(err)) throw err;
    console.warn('[text] read timed out', { timeoutMs });
    return { recipe: EMPTY_RECIPE, usages: [], timedOut: true };
  }
}

/** A text import's size, for ai_usage_events (`input: 'text'`, like `input: 'pdf'`). Never the text itself. */
export function textMetadata(text: string | null): Record<string, unknown> {
  if (text === null) return {};
  return { input: 'text', text_chars: text.length };
}
