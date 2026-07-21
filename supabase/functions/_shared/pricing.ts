/** Gemini 3.5 Flash paid rates (USD per 1M tokens). */
export const GEMINI_INPUT_USD_PER_M = 1.5;
export const GEMINI_OUTPUT_USD_PER_M = 9.0;

/** Gemini 3.1 Flash-Lite paid rates (USD per 1M tokens). */
export const GEMINI_FAST_INPUT_USD_PER_M = 0.25;
export const GEMINI_FAST_OUTPUT_USD_PER_M = 1.5;

/** Conservative ScrapeCreators credit cost from the $47 / 25k pack. */
export const SCRAPECREATORS_USD_PER_CREDIT = 0.00188;

export const TOKEN_COST_EXTRACT = 10;
export const TOKEN_COST_REMIX = 5;
/** Keep in sync with client GUEST_EXTRACTION_LIMIT / GUEST_RECIPE_LIMIT. */
export const GUEST_EXTRACT_LIMIT = 3;
export const SIGNUP_TOKEN_BONUS = 150;

export interface GeminiUsageSnapshot {
  model: string;
  kind: string;
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  totalTokenCount: number;
}

export function geminiRatesForModel(model: string): { input: number; output: number } {
  if (model.toLowerCase().includes('flash-lite')) {
    return { input: GEMINI_FAST_INPUT_USD_PER_M, output: GEMINI_FAST_OUTPUT_USD_PER_M };
  }
  return { input: GEMINI_INPUT_USD_PER_M, output: GEMINI_OUTPUT_USD_PER_M };
}

export function estimateGeminiCostUsd(usage: GeminiUsageSnapshot): number {
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
