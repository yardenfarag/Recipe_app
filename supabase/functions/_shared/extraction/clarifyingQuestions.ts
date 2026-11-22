/**
 * Clarifying questions before Guess the recipe from a photo (PIN-64, ADR 031).
 *
 * This file exists twice and must stay byte-identical:
 *   shared/lib/clarifyingQuestions.ts                                (apps)
 *   supabase/functions/_shared/extraction/clarifyingQuestions.ts     (Edge Functions, Deno)
 * shared/lib/clarifyingQuestions.test.ts fails when they differ. It has no imports so it runs in both.
 *
 * Everything here reads data from outside (model output, a request body, a server response),
 * so it drops what is invalid instead of throwing.
 */

/** Never more than this many questions for one photo. */
export const MAX_CLARIFYING_QUESTIONS = 3;
/** A question needs at least two options to be a choice. "Other" and "Just guess" are added by the app. */
export const MIN_QUESTION_OPTIONS = 2;
export const MAX_QUESTION_OPTIONS = 4;
export const MAX_QUESTION_LENGTH = 80;
export const MAX_OPTION_LENGTH = 40;
/** Free-text "Other" answers are cut to this length before they reach a prompt. */
export const MAX_ANSWER_LENGTH = 60;
export const MAX_DISH_GUESS_LENGTH = 80;

/** A question the server asks, with chip options built from the gate's candidate dishes. */
export type ClarifyingQuestion = {
  question: string;
  options: string[];
};

/** One answer the app sends back. `other` is true when the user typed it instead of tapping a chip. */
export type Clarification = {
  question: string;
  answer: string;
  other: boolean;
};

/** Trims, removes control characters, folds runs of whitespace and cuts to `max` characters (not UTF-16 units). */
export function cleanClarifyingText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const flat = value.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(flat).slice(0, max).join('').trim();
}

function sameText(a: string, b: string): boolean {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function sanitizeQuestion(raw: unknown): ClarifyingQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const question = cleanClarifyingText(item.question, MAX_QUESTION_LENGTH);
  if (!question || !Array.isArray(item.options)) return null;

  const options: string[] = [];
  for (const rawOption of item.options) {
    const option = cleanClarifyingText(rawOption, MAX_OPTION_LENGTH);
    if (!option || options.some((existing) => sameText(existing, option))) continue;
    options.push(option);
    if (options.length === MAX_QUESTION_OPTIONS) break;
  }
  return options.length >= MIN_QUESTION_OPTIONS ? { question, options } : null;
}

/** Questions from the model (server) or from a `needs_clarification` response (app). */
export function sanitizeClarifyingQuestions(value: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(value)) return [];
  const result: ClarifyingQuestion[] = [];
  for (const raw of value) {
    const question = sanitizeQuestion(raw);
    if (!question || result.some((existing) => sameText(existing.question, question.question))) continue;
    result.push(question);
    if (result.length === MAX_CLARIFYING_QUESTIONS) break;
  }
  return result;
}

/** Answers from the app's request body. The server treats them as user data, never as instructions. */
export function sanitizeClarifications(value: unknown): Clarification[] {
  if (!Array.isArray(value)) return [];
  const result: Clarification[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const question = cleanClarifyingText(item.question, MAX_QUESTION_LENGTH);
    const answer = cleanClarifyingText(item.answer, MAX_ANSWER_LENGTH);
    if (!question || !answer || result.some((existing) => sameText(existing.question, question))) continue;
    result.push({ question, answer, other: item.other === true });
    if (result.length === MAX_CLARIFYING_QUESTIONS) break;
  }
  return result;
}

/**
 * What the app sends on the second call. Its presence means the questions are done, answered or
 * skipped with "Just guess", so the server never asks again for this photo.
 */
export type ClarificationReply = {
  answers: Clarification[];
  /** True when the user tapped "Just guess" before answering every question. */
  skipped: boolean;
};

/** The `clarification` field of a request body, or null when there is none. */
export function sanitizeClarificationReply(value: unknown): ClarificationReply | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  return { answers: sanitizeClarifications(item.answers), skipped: item.skipped === true };
}

/** The first call's dish guess, sent back on the second call so the response keeps it. */
export function sanitizeDishGuess(value: unknown): string {
  return cleanClarifyingText(value, MAX_DISH_GUESS_LENGTH);
}
