/**
 * TypeSafe Jev through OpenRouter's Decisions API (PIN-46).
 *
 * Jev returns typed decisions instead of text: a Choice (one option plus
 * probabilities) or a Noul (probability of yes). Text only, 32K context,
 * $0.042 per 1M input tokens, output free. Every caller fails open: on an
 * error or a low-confidence answer it runs the path it ran before Jev.
 */

import { buildTextContext, type ExtractInput } from './gemini.ts';
import { resolveOpenRouterApiKey } from './llmClient.ts';
import { isVideoTooLong } from './videoLimits.ts';

const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const DEFAULT_JEV_MODEL = 'typesafe/jev-1.13';
// p95 was 1.0 s in the PIN-44 eval. Past this, today's ladder is the faster bet.
const JEV_TIMEOUT_MS = 3_000;

export type JevQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria: { true: string; false: string } };

export type JevChoiceAnswer = {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type JevNoulAnswer = { type: 'noul'; noul: number };

export type JevResult = {
  answers: Record<string, JevChoiceAnswer | JevNoulAnswer | undefined>;
  model: string;
  costUsd: number;
  inputTokens: number;
  ms: number;
};

export function resolveJevModel(): string {
  return Deno.env.get('JEV_MODEL')?.trim() || DEFAULT_JEV_MODEL;
}

export async function jevDecide(opts: {
  state: Record<string, unknown>;
  questions: Record<string, JevQuestion>;
  timeoutMs?: number;
}): Promise<JevResult> {
  const apiKey = resolveOpenRouterApiKey();
  if (!apiKey) throw new Error('Jev: OPENROUTER_API_KEY is not set');
  const model = resolveJevModel();
  const started = Date.now();
  const res = await fetch(DECISIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://pinch-app.io',
      'X-Title': 'Pinch',
    },
    body: JSON.stringify({ model, state: opts.state, questions: opts.questions }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? JEV_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Jev ${res.status}: ${text.slice(0, 300)}`);
  const payload = JSON.parse(text);
  return {
    answers: payload.answers ?? {},
    model: String(payload.model ?? model),
    costUsd: Number(payload.usage?.cost ?? 0),
    inputTokens: Number(payload.usage?.input_tokens ?? 0),
    ms: Date.now() - started,
  };
}

// --- Extract gate -----------------------------------------------------------

export const EXTRACT_ROUTES = {
  full_recipe_in_text:
    'The text already holds a usable recipe: an ingredient list with amounts and method steps.',
  partial:
    'The text holds part of a recipe (ingredients without amounts, or ingredients without steps). The video may fill the gaps.',
  needs_video:
    'A cooking or food post whose text has no usable recipe. The recipe can only come from watching the video.',
  no_recipe: 'Not a recipe at all: a review, meme, vlog, product promo, or a post with no cookable content.',
} as const;
export type ExtractRoute = keyof typeof EXTRACT_ROUTES;

export const EXTRACT_ROUTE_INSTRUCTIONS =
  'This is the text of a social media cooking post (description, top comments, transcript). Before spending a slow extraction call, decide where the recipe can come from.';

/**
 * Below this, the ladder runs as before. The PIN-44 eval's two misroutes
 * (partial labelled full) had confidence 0.44 and 0.72. Every correct
 * needs_video / no_recipe answer was at 0.81 or above.
 */
export const EXTRACT_ROUTE_MIN_CONFIDENCE = 0.75;

export type ExtractGateDecision =
  | {
      ok: true;
      route: ExtractRoute;
      confidence: number;
      probabilities: Record<string, number>;
      /** False when confidence is under the floor, so the ladder ignores the route. */
      confident: boolean;
      model: string;
      costUsd: number;
      inputTokens: number;
      ms: number;
    }
  | { ok: false; error: string; ms: number };

/** Social posts with text only: web pages have no video, and no text means nothing to judge. */
export function shouldRunExtractGate(input: ExtractInput): boolean {
  if (input.platform === 'web' || input.platform === 'photo') return false;
  return (
    Boolean(input.description?.trim()) ||
    input.topComments.length > 0 ||
    Boolean(input.captions?.trim())
  );
}

/** Never throws: an error comes back as `ok: false` and the ladder runs as before. */
export async function decideExtractRoute(input: ExtractInput): Promise<ExtractGateDecision> {
  const started = Date.now();
  try {
    const res = await jevDecide({
      state: {
        post_text: buildTextContext(input, { description: true, comments: true, captions: true }),
      },
      questions: {
        route: { type: 'choice', instructions: EXTRACT_ROUTE_INSTRUCTIONS, criteria: { ...EXTRACT_ROUTES } },
      },
    });
    const answer = res.answers.route;
    if (answer?.type !== 'choice' || !(answer.choice in EXTRACT_ROUTES)) {
      throw new Error(`Jev: unexpected route answer ${JSON.stringify(answer)?.slice(0, 200)}`);
    }
    const confidence = Number(answer.confidence ?? 0);
    return {
      ok: true,
      route: answer.choice as ExtractRoute,
      confidence,
      probabilities: answer.probabilities ?? {},
      confident: confidence >= EXTRACT_ROUTE_MIN_CONFIDENCE,
      model: res.model,
      costUsd: res.costUsd,
      inputTokens: res.inputTokens,
      ms: res.ms,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}

/** The route the ladder should follow, or null for today's ladder. */
export function appliedExtractRoute(decision: ExtractGateDecision | null): ExtractRoute | null {
  return decision?.ok && decision.confident ? decision.route : null;
}

/** needs_video skips the text call only when there is a video the ladder can watch. */
export function skipsTextStep(route: ExtractRoute | null, input: ExtractInput): boolean {
  return route === 'needs_video' && Boolean(input.videoUrl?.trim()) && !isVideoTooLong(input.durationSeconds);
}
