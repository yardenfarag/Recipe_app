/** Gemini 3.5 Flash paid rates (USD per 1M tokens). */
export const GEMINI_INPUT_USD_PER_M = 1.5;
export const GEMINI_OUTPUT_USD_PER_M = 9.0;

/** Gemini 3.1 Flash-Lite paid rates (USD per 1M tokens). */
export const GEMINI_FAST_INPUT_USD_PER_M = 0.25;
export const GEMINI_FAST_OUTPUT_USD_PER_M = 1.5;

/** Conservative ScrapeCreators credit cost from the $47 / 25k pack. */
export const SCRAPECREATORS_USD_PER_CREDIT = 0.00188;

/** One recipe credit funds one successful, uncached extraction. */
export const TOKEN_COST_EXTRACT = 1;
/** Remix is free and capped per recipe. */
export const TOKEN_COST_REMIX = 0;
/** Lifetime free remixes per saved recipe or unsaved source URL. */
export const RECIPE_REMIX_LIMIT = 5;

/** Unused: guests can't extract (extract-recipe/invent-recipe return auth_required). */
export const GUEST_EXTRACT_LIMIT = 3;
/** Calendar-month extracts for signed-in Free users (UTC YYYY-MM). */
export const FREE_MONTHLY_EXTRACT_LIMIT = 10;
/** @deprecated Use FREE_MONTHLY_EXTRACT_LIMIT. */
export const FREE_EXTRACT_LIMIT = FREE_MONTHLY_EXTRACT_LIMIT;
/** Free fridge-match vision calls per UTC day (signed-in). */
export const FRIDGE_MATCH_DAILY_LIMIT = 8;
/** Free fridge-match vision calls per UTC day (guest install). */
export const GUEST_FRIDGE_MATCH_DAILY_LIMIT = 3;
/** Cheap food-gate classifies per UTC day (signed-in). */
export const CONTENT_GATE_DAILY_LIMIT = 40;
/** Cheap food-gate classifies per UTC day (guest install). */
export const GUEST_CONTENT_GATE_DAILY_LIMIT = 12;
export interface GeminiUsageSnapshot {
  model: string;
  kind: string;
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
  /** Exact USD cost from OpenRouter's `usage.cost`. Preferred over the rate table. */
  costUsd?: number;
}

/**
 * USD per 1M tokens, used only when OpenRouter did not return `usage.cost`.
 * Rates from OpenRouter's model API, 6 Oct 2026 (docs/research/05-llm-per-task.md).
 */
const OPENROUTER_RATES: Array<{ match: string; input: number; output: number }> = [
  { match: 'gpt-6.1-sol', input: 2.0, output: 10.0 },
  { match: 'gpt-6-luna', input: 0.1, output: 0.5 },
  { match: 'gpt-5.4-nano', input: 0.2, output: 1.25 },
  { match: 'gpt-4.1-mini', input: 0.4, output: 1.6 },
  { match: 'claude-sonnet-5.5', input: 2.0, output: 10.0 },
  { match: 'claude', input: 3.0, output: 15.0 },
  { match: 'mistral-small', input: 0.15, output: 0.6 },
  { match: 'qwen3.8-omni-flash', input: 0.15, output: 0.47 },
  { match: 'qwen3.8-flash', input: 0.15, output: 0.47 },
  { match: 'gemini-3.5-flash-lite', input: 0.3, output: 2.5 },
  { match: 'gemini-3.5-flash', input: GEMINI_INPUT_USD_PER_M, output: GEMINI_OUTPUT_USD_PER_M },
  { match: 'flash-lite', input: 0.1, output: 0.4 },
  { match: 'gemini-2.5-flash', input: 0.3, output: 2.5 },
];

export function geminiRatesForModel(model: string): { input: number; output: number } {
  const id = model.toLowerCase();
  for (const rate of OPENROUTER_RATES) {
    if (id.includes(rate.match)) return { input: rate.input, output: rate.output };
  }
  return { input: GEMINI_INPUT_USD_PER_M, output: GEMINI_OUTPUT_USD_PER_M };
}

export function estimateGeminiCostUsd(usage: GeminiUsageSnapshot): number {
  if (typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd)) {
    return Math.max(0, usage.costUsd);
  }
  const rates = geminiRatesForModel(usage.model);
  const input = usage.promptTokenCount;
  // Google bills thinking tokens at the output rate.
  const output = usage.candidatesTokenCount + usage.thoughtsTokenCount;
  return (input * rates.input + output * rates.output) / 1_000_000;
}

export function estimateScrapeCreatorsCostUsd(credits: number): number {
  return Math.max(0, credits) * SCRAPECREATORS_USD_PER_CREDIT;
}

export function sumGeminiUsages(usages: GeminiUsageSnapshot[]): {
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  geminiCostUsd: number;
  model: string | null;
} {
  let promptTokens = 0;
  let outputTokens = 0;
  let thinkingTokens = 0;
  let totalTokens = 0;
  let geminiCostUsd = 0;
  let model: string | null = null;

  for (const usage of usages) {
    promptTokens += usage.promptTokenCount;
    outputTokens += usage.candidatesTokenCount;
    thinkingTokens += usage.thoughtsTokenCount;
    totalTokens += usage.totalTokenCount;
    geminiCostUsd += estimateGeminiCostUsd(usage);
    model = usage.model;
  }

  return { promptTokens, outputTokens, thinkingTokens, totalTokens, geminiCostUsd, model };
}

/** Rough credit estimates when the provider does not return exact debit counts. */
export function estimateScrapeCredits(platform: string | null | undefined, usedVideoDownload: boolean): number {
  if (platform === 'instagram') {
    return usedVideoDownload ? 11 : 1;
  }
  if (platform === 'tiktok') {
    return 2;
  }
  return 0;
}
