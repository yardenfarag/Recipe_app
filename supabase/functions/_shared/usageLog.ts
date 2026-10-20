import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  estimateGeminiCostUsd,
  estimateScrapeCreatorsCostUsd,
  sumGeminiUsages,
  type GeminiUsageSnapshot,
} from './pricing.ts';

export interface UsageEventInput {
  userId?: string | null;
  guestInstallId?: string | null;
  action:
    | 'extract'
    | 'remix'
    | 'substitution'
    | 'translate'
    | 'repair'
    | 'fridge_match'
    | 'invent'
    | 'content_gate'
    | 'extract_gate';
  platform?: string | null;
  status: string;
  extractionSource?: string | null;
  usages?: GeminiUsageSnapshot[];
  /** A call that reports its own cost (Jev) instead of token counts. */
  pricedCall?: { model: string; costUsd: number; promptTokens: number };
  scrapecreatorsCredits?: number;
  tokensCharged?: number;
  durationMs?: number | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logUsageEvent(
  admin: SupabaseClient | null,
  input: UsageEventInput,
): Promise<string | null> {
  if (!admin) return null;

  const summed = sumGeminiUsages(input.usages ?? []);
  const scrapecreatorsCredits = input.scrapecreatorsCredits ?? 0;
  const scrapecreatorsCostUsd = estimateScrapeCreatorsCostUsd(scrapecreatorsCredits);
  const priced = input.pricedCall;
  const llmCostUsd = summed.geminiCostUsd + (priced?.costUsd ?? 0);
  const totalCostUsd = llmCostUsd + scrapecreatorsCostUsd;

  // One entry per model call, so the admin dashboard can attribute cost and
  // tokens to each model even when an extract made several calls.
  const llmCalls = [
    ...(input.usages ?? []).map((u) => ({
      kind: u.kind,
      model: u.model,
      prompt_tokens: u.promptTokenCount,
      output_tokens: u.candidatesTokenCount,
      thinking_tokens: u.thoughtsTokenCount,
      cost_usd: roundUsd(estimateGeminiCostUsd(u)),
      cost_source: typeof u.costUsd === 'number' ? 'openrouter' : 'rate_table',
    })),
    ...(priced
      ? [
          {
            kind: input.action,
            model: priced.model,
            prompt_tokens: priced.promptTokens,
            output_tokens: 0,
            thinking_tokens: 0,
            cost_usd: roundUsd(priced.costUsd),
            cost_source: 'openrouter',
          },
        ]
      : []),
  ];

  const row = {
    user_id: input.userId ?? null,
    guest_install_id: input.guestInstallId ?? null,
    action: input.action,
    platform: input.platform ?? null,
    status: input.status,
    extraction_source: input.extractionSource ?? null,
    model: summed.model ?? priced?.model ?? null,
    prompt_tokens: summed.promptTokens + (priced?.promptTokens ?? 0),
    output_tokens: summed.outputTokens,
    thinking_tokens: summed.thinkingTokens,
    total_tokens: summed.totalTokens + (priced?.promptTokens ?? 0),
    gemini_cost_usd: roundUsd(llmCostUsd),
    scrapecreators_credits: scrapecreatorsCredits,
    scrapecreators_cost_usd: roundUsd(scrapecreatorsCostUsd),
    total_cost_usd: roundUsd(totalCostUsd),
    tokens_charged: input.tokensCharged ?? 0,
    duration_ms: input.durationMs ?? null,
    error_message: input.errorMessage ?? null,
    metadata: llmCalls.length > 0 ? { ...(input.metadata ?? {}), llm_calls: llmCalls } : (input.metadata ?? {}),
  };

  const { data, error } = await admin.from('ai_usage_events').insert(row).select('id').maybeSingle();
  if (error) {
    console.error('[usageLog] insert failed', error);
    return null;
  }
  return data?.id ?? null;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
